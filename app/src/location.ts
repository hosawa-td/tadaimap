import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import AsyncStorage from "@react-native-async-storage/async-storage";
import TadaimapWifi from "../modules/tadaimap-wifi";
import { ApiClient, PresenceStatus } from "./api";
import {
  classifyWifi,
  distanceMeters,
  GeofenceEvent,
  judgeAutoStatus,
  judgeFromGeofenceEvent,
  shouldSendStatus,
  WifiState,
} from "./autoStatus";
import { getOrCreateDeviceId } from "./deviceId";
import { loadHomeGeofenceConfig, loadHomeWifiSsid, saveHomeWifiSsid, STORAGE_KEYS } from "./storage";

export const GEOFENCE_TASK_NAME = "tadaimap-home-geofence";
/** 自宅Wi-Fiへの接続をOSに見張らせるタスク(F24)。 */
export const WIFI_TASK_NAME = "tadaimap-home-wifi";
/**
 * 定期確認タスク(F4・F24)。ジオフェンスの取りこぼしと、自宅Wi-Fiの切断(OSから通知されない)を拾う。
 * 既に端末に登録済みのタスクと合わせるため、名前は自宅Wi-Fi専用だった頃のまま。
 */
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

/** 現在地を取る。アプリが閉じているときは失敗しやすいため、直近(2分以内)のOSの記録にも頼る。 */
async function readCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    // 既定(Balanced)の精度は誤差100m級になり、自宅の範囲(既定100m)の判定に使えないため高精度で取る
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    // 取れなければ下の直近の記録へ
  }
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60 * 1000, requiredAccuracy: 100 });
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
  } catch {
    // 直近の記録も無ければ、呼び出し側で判定を見送るかイベントから判定する
  }
  return null;
}

/** サーバー上の、いまの自分の状態。通信できなければnull。 */
async function fetchServerStatus(
  client: ApiClient,
  groupId: string | null,
  memberId: string
): Promise<PresenceStatus | null> {
  if (!groupId) return null;
  try {
    const result = await client.getMembers(groupId);
    return result.members.find((m) => m.memberId === memberId)?.status ?? null;
  } catch {
    return null;
  }
}

/**
 * その時点の現在地・自宅Wi-Fiの接続状況から3段階のステータスを計算し直し、
 * サーバー上の状態と違っていればサーバーへ送る(F4・F24)。
 * - geofence/wifi: 範囲の出入り・Wi-Fiへの接続をきっかけに、毎回判定し直す
 * - periodic: ジオフェンスの取りこぼしや、自宅Wi-Fiが切れたことを拾うための定期確認
 * - foreground: アプリを開いたとき(ずれていても開けば直るように)
 */
async function reportAutoStatus(
  trigger: "geofence" | "wifi" | "periodic" | "foreground",
  geofenceEvent?: GeofenceEvent
): Promise<PresenceStatus | null> {
  const [deviceId, memberId, groupId, config, homeSsid, lastStatus] = await Promise.all([
    getOrCreateDeviceId(),
    AsyncStorage.getItem(STORAGE_KEYS.memberId),
    AsyncStorage.getItem(STORAGE_KEYS.groupId),
    loadHomeGeofenceConfig(),
    loadHomeWifiSsid(),
    AsyncStorage.getItem(LAST_STATUS_KEY),
  ]);
  if (!memberId) return null;

  const wifi = classifyWifi(readWifiState(), homeSsid);

  // 自宅Wi-Fiにつながっていれば位置に関係なく在宅と判定できるため、電池節約のため現在地は取らない
  let distanceM: number | null = null;
  if (wifi !== "home" && config) {
    const position = await readCurrentPosition();
    if (position) distanceM = distanceMeters(position.lat, position.lng, config.lat, config.lng);
  }

  let status = judgeAutoStatus({
    distanceM,
    homeRadiusM: config?.homeRadiusM ?? 0,
    buildingRadiusM: config?.buildingRadiusM ?? 0,
    wifi,
  });
  // 現在地が取れなくても、OSが知らせてくれた範囲の出入りから判定する
  if (!status && geofenceEvent) status = judgeFromGeofenceEvent(geofenceEvent, wifi);
  if (!status) return null;

  const client = new ApiClient(API_BASE_URL, deviceId);
  // 手動切替などで端末の前回値とサーバーがずれていても止まらないよう、サーバー上の状態と比べる
  const current = (await fetchServerStatus(client, groupId, memberId)) ?? (lastStatus as PresenceStatus | null);
  if (!shouldSendStatus(status, current)) {
    await AsyncStorage.setItem(LAST_STATUS_KEY, status);
    return status;
  }

  try {
    await client.updateStatus(memberId, status, "auto");
    await AsyncStorage.setItem(LAST_STATUS_KEY, status);
    return status;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[${trigger}] ステータス更新に失敗しました`, err);
    return null;
  }
}

/** expo-locationのイベント内容を、判定用の形に変換する。 */
function toGeofenceEvent(data: unknown): GeofenceEvent | undefined {
  const d = data as { eventType?: number; region?: { identifier?: string } } | null;
  const regionId = d?.region?.identifier;
  if (regionId !== HOME_REGION_ID && regionId !== BUILDING_REGION_ID) return undefined;
  if (d?.eventType === Location.GeofencingEventType.Enter) return { regionId, type: "enter" };
  if (d?.eventType === Location.GeofencingEventType.Exit) return { regionId, type: "exit" };
  return undefined;
}

TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[geofence] エラー", error);
    return;
  }
  if (!data) return;
  // どちらの範囲のイベントでも、その時点の現在地から3段階のステータスを都度計算し直す。
  // 現在地が取れなかった場合だけ、イベントの内容(どの範囲に入った・出た)から判定する。
  await reportAutoStatus("geofence", toGeofenceEvent(data));
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
  await startPeriodicCheck();
  await startHomeWifiWatch();
}

export async function stopHomeGeofence(): Promise<void> {
  const started = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME);
  if (started) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
  }
  await stopPeriodicCheck();
  await stopHomeWifiWatch();
}

/**
 * 約15分ごとの定期確認を開始する。ジオフェンスの通知はOSの都合で遅れたり届かなかったりし、
 * 自宅Wi-Fiの切断も通知されないため、その取りこぼしを拾う保険として自宅の登録があれば常に動かす。
 */
async function startPeriodicCheck(): Promise<void> {
  try {
    await BackgroundTask.registerTaskAsync(WIFI_CHECK_TASK_NAME, {
      minimumInterval: WIFI_CHECK_INTERVAL_MINUTES,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[periodic] 定期確認を開始できませんでした", err);
  }
}

async function stopPeriodicCheck(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(WIFI_CHECK_TASK_NAME)) {
      await BackgroundTask.unregisterTaskAsync(WIFI_CHECK_TASK_NAME);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[periodic] 定期確認を停止できませんでした", err);
  }
}

/** 自宅Wi-Fiが登録済みであれば、Wi-Fiへの接続の見張りを開始する(F24)。 */
async function startHomeWifiWatch(): Promise<void> {
  if (!TadaimapWifi) return;
  const homeSsid = await loadHomeWifiSsid();
  if (!homeSsid) return;
  try {
    await TadaimapWifi.startWifiWatchAsync(WIFI_TASK_NAME);
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

/**
 * アプリを開いたときに、いまの状況で判定し直す(F4)。
 * 判定の結果サーバーへ送った(または一致を確認した)ステータスを返す。判定できなければnull。
 */
export async function refreshAutoStatus(): Promise<PresenceStatus | null> {
  if (!(await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME))) return null;
  // 以前の版で自宅を登録した端末では定期確認が未登録のため、開いたついでに登録しておく
  if (!(await TaskManager.isTaskRegisteredAsync(WIFI_CHECK_TASK_NAME))) await startPeriodicCheck();
  return reportAutoStatus("foreground");
}

/** 手動で切り替えたステータスを、自動判定の前回値としても覚えておく(通信できないときの比較用)。 */
export async function rememberStatus(status: PresenceStatus): Promise<void> {
  await AsyncStorage.setItem(LAST_STATUS_KEY, status);
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
