import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import AsyncStorage from "@react-native-async-storage/async-storage";
import TadaimapWifi from "../modules/tadaimap-wifi";
import { ApiClient } from "./api";
import { classifyWifi, distanceMeters, judgeAutoStatus, WifiState } from "./autoStatus";
import { getOrCreateDeviceId } from "./deviceId";
import { loadHomeGeofenceConfig, loadHomeWifiSsid, saveHomeWifiSsid, STORAGE_KEYS } from "./storage";

export const GEOFENCE_TASK_NAME = "tadaimap-home-geofence";
/** 自宅Wi-Fiへの接続をOSに見張らせるタスク(F24)。 */
export const WIFI_TASK_NAME = "tadaimap-home-wifi";
/** 自宅Wi-Fiが切れたことを拾うための定期確認タスク(F24)。OSの都合で切断の瞬間は通知されないため。 */
export const WIFI_CHECK_TASK_NAME = "tadaimap-home-wifi-check";
/** 定期確認の間隔(分)。Androidで指定できる最短が15分。 */
const WIFI_CHECK_INTERVAL_MINUTES = 15;
const HOME_REGION_ID = "home";
const BUILDING_REGION_ID = "building";
const LAST_STATUS_KEY = "tadaimap.lastAutoStatus";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

function readWifiState(): WifiState | null {
  if (!TadaimapWifi) return null;
  try {
    return TadaimapWifi.getWifiState();
  } catch {
    return null;
  }
}

/**
 * その時点の現在地・自宅Wi-Fiの接続状況から3段階のステータスを計算し直し、
 * 前回から変化していればサーバーへ送る(F4・F24)。
 * - geofence/wifi: 範囲の出入り・Wi-Fiへの接続をきっかけに、毎回判定し直す
 * - periodic: 「自宅Wi-Fiが切れたのに在宅のまま」を拾うためだけの定期確認
 */
async function reportAutoStatus(trigger: "geofence" | "wifi" | "periodic"): Promise<void> {
  const [deviceId, memberId, config, homeSsid, lastStatus] = await Promise.all([
    getOrCreateDeviceId(),
    AsyncStorage.getItem(STORAGE_KEYS.memberId),
    loadHomeGeofenceConfig(),
    loadHomeWifiSsid(),
    AsyncStorage.getItem(LAST_STATUS_KEY),
  ]);
  if (!memberId) return;

  const wifi = classifyWifi(readWifiState(), homeSsid);
  if (trigger === "periodic" && !(lastStatus === "home" && wifi === "other")) return;

  // 自宅Wi-Fiにつながっていれば位置に関係なく在宅と判定できるため、電池節約のため現在地は取らない
  let distanceM: number | null = null;
  if (wifi !== "home" && config) {
    try {
      const position = await Location.getCurrentPositionAsync({});
      distanceM = distanceMeters(
        position.coords.latitude,
        position.coords.longitude,
        config.lat,
        config.lng
      );
    } catch {
      // 現在地が取れなければ判定を見送る(judgeAutoStatusがnullを返す)
    }
  }

  const status = judgeAutoStatus({
    distanceM,
    homeRadiusM: config?.homeRadiusM ?? 0,
    buildingRadiusM: config?.buildingRadiusM ?? 0,
    wifi,
  });
  if (!status) return;
  if (lastStatus === status) return; // 変化がなければ通信・通知を発生させない

  const client = new ApiClient(API_BASE_URL, deviceId);
  try {
    await client.updateStatus(memberId, status, "auto");
    await AsyncStorage.setItem(LAST_STATUS_KEY, status);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[${trigger}] ステータス更新に失敗しました`, err);
  }
}

TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[geofence] エラー", error);
    return;
  }
  if (!data) return;
  // どちらの範囲のイベントでも、その時点の現在地から3段階のステータスを
  // 都度計算し直す(範囲の内外判定を単独のイベントだけに頼らないため)。
  await reportAutoStatus("geofence");
});

TaskManager.defineTask(WIFI_TASK_NAME, async ({ error }) => {
  if (error) return;
  // どのWi-Fiにつながった場合でも起こされるため、自宅Wi-Fiかどうかはここで判定する
  await reportAutoStatus("wifi");
});

TaskManager.defineTask(WIFI_CHECK_TASK_NAME, async () => {
  try {
    await reportAutoStatus("periodic");
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function requestLocationPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") {
    return { foreground: false, background: false };
  }
  const bg = await Location.requestBackgroundPermissionsAsync();
  return { foreground: true, background: bg.status === "granted" };
}

export async function startHomeGeofence(
  lat: number,
  lng: number,
  homeRadiusM: number,
  buildingRadiusM: number
): Promise<void> {
  await stopHomeGeofence();
  await AsyncStorage.removeItem(LAST_STATUS_KEY);
  await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, [
    {
      identifier: HOME_REGION_ID,
      latitude: lat,
      longitude: lng,
      radius: homeRadiusM,
      notifyOnEnter: true,
      notifyOnExit: true,
    },
    {
      identifier: BUILDING_REGION_ID,
      latitude: lat,
      longitude: lng,
      radius: buildingRadiusM,
      notifyOnEnter: true,
      notifyOnExit: true,
    },
  ]);
  await startHomeWifiWatch();
}

export async function stopHomeGeofence(): Promise<void> {
  const started = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME);
  if (started) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
  }
  await stopHomeWifiWatch();
}

/** 自宅Wi-Fiが登録済みであれば、Wi-Fiへの接続の見張りと定期確認を開始する(F24)。 */
async function startHomeWifiWatch(): Promise<void> {
  if (!TadaimapWifi) return;
  const homeSsid = await loadHomeWifiSsid();
  if (!homeSsid) return;
  try {
    await TadaimapWifi.startWifiWatchAsync(WIFI_TASK_NAME);
    await BackgroundTask.registerTaskAsync(WIFI_CHECK_TASK_NAME, {
      minimumInterval: WIFI_CHECK_INTERVAL_MINUTES,
    });
  } catch (err) {
    // 見張りを開始できなくても、従来の距離だけでの自動判定は引き続き働く
    // eslint-disable-next-line no-console
    console.warn("[wifi] 自宅Wi-Fiの見張りを開始できませんでした", err);
  }
}

async function stopHomeWifiWatch(): Promise<void> {
  if (!TadaimapWifi) return;
  try {
    await TadaimapWifi.stopWifiWatchAsync(WIFI_TASK_NAME);
    if (await TaskManager.isTaskRegisteredAsync(WIFI_CHECK_TASK_NAME)) {
      await BackgroundTask.unregisterTaskAsync(WIFI_CHECK_TASK_NAME);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[wifi] 自宅Wi-Fiの見張りを停止できませんでした", err);
  }
}

/** この端末で自宅Wi-Fiの判定(F24)が使えるかどうか(Android版のみ)。 */
export function isHomeWifiSupported(): boolean {
  return !!TadaimapWifi;
}

/**
 * いま接続中のWi-Fiを自宅Wi-Fiとして登録し、見張りを開始する(F24)。
 * 登録できない場合は、利用者向けの理由を含むErrorを投げる。
 */
export async function registerHomeWifi(): Promise<string> {
  if (!TadaimapWifi) throw new Error("この端末では自宅Wi-Fiの判定を利用できません");
  const permissions = await requestLocationPermissions();
  if (!permissions.foreground) {
    throw new Error("Wi-Fi名の読み取りには位置情報の許可が必要です");
  }
  const state = readWifiState();
  if (!state || !state.enabled) throw new Error("端末のWi-Fiがオフになっています");
  if (!state.connected) throw new Error("Wi-Fiに接続していません。自宅のWi-Fiにつないでから登録してください");
  if (!state.ssid) {
    throw new Error("Wi-Fi名を読み取れませんでした。位置情報をオンにし、権限を「常に許可」にしてください");
  }
  await saveHomeWifiSsid(state.ssid);
  await stopHomeWifiWatch();
  await startHomeWifiWatch();
  // 次のWi-Fi接続を待たずに、登録した時点の状態をすぐに反映する
  await reportAutoStatus("wifi");
  return state.ssid;
}

/** 自宅Wi-Fiの登録を解除し、従来の距離だけでの判定に戻す(F24)。 */
export async function clearHomeWifi(): Promise<void> {
  await stopHomeWifiWatch();
  await saveHomeWifiSsid(null);
}

export async function getCurrentLocation(): Promise<{ lat: number; lng: number }> {
  const position = await Location.getCurrentPositionAsync({});
  return { lat: position.coords.latitude, lng: position.coords.longitude };
}
