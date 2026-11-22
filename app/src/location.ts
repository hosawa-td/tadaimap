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
  judgeWifiOnly,
  shouldSendStatus,
  WifiState,
} from "./autoStatus";
import { getOrCreateDeviceId } from "./deviceId";
import { addDiagLog, flushDiagLogs } from "./diagLog";
import {
  loadHomeGeofenceConfig,
  loadRegisteredWifis,
  loadStrictHomeWifi,
  loadWifiOnlyMode,
  loadNearbyGpsEnabled,
  saveNearbyGpsEnabled,
  saveWifiOnlyMode,
  RegisteredWifi,
  saveRegisteredWifis,
  saveStrictHomeWifi,
  WifiKind,
  STORAGE_KEYS,
} from "./storage";

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
async function readCurrentPosition(): Promise<{ lat: number; lng: number; src: "fresh" | "lastKnown" } | null> {
  try {
    // 既定(Balanced)の精度は誤差100m級になり、自宅の範囲(既定100m)の判定に使えないため高精度で取る
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: position.coords.latitude, lng: position.coords.longitude, src: "fresh" };
  } catch {
    // 取れなければ下の直近の記録へ
  }
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60 * 1000, requiredAccuracy: 100 });
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude, src: "lastKnown" };
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
  const [deviceId, memberId, groupId, config, wifis, strictWifi, wifiOnly, nearbyGpsEnabled, lastStatus] =
    await Promise.all([
      getOrCreateDeviceId(),
      AsyncStorage.getItem(STORAGE_KEYS.memberId),
      AsyncStorage.getItem(STORAGE_KEYS.groupId),
      loadHomeGeofenceConfig(),
      loadRegisteredWifis(),
      loadStrictHomeWifi(),
      loadWifiOnlyMode(),
      loadNearbyGpsEnabled(),
      AsyncStorage.getItem(LAST_STATUS_KEY),
    ]);
  if (!memberId) return null;

  const wifiState = readWifiState();
  const wifi = classifyWifi(wifiState, wifis);

  // 「何をきっかけに動き、何を見て、何と判断し、送れたか」を端末ログに残す(後から原因を調べるため)
  const diag: Record<string, unknown> = {
    trigger,
    mode: wifiOnly ? "wifi_only" : "location",
    wifi,
    wifiOn: wifiState ? wifiState.enabled : null,
    strict: strictWifi || undefined,
    nearbyGps: nearbyGpsEnabled ? undefined : "off",
    geo: geofenceEvent ? `${geofenceEvent.type}:${geofenceEvent.regionId}` : undefined,
  };
  const client = new ApiClient(API_BASE_URL, deviceId);
  // 結果を記録し、重要な出来事(送信した・失敗した・判断した)があったときは溜まったログも送る
  const finish = async (status: PresenceStatus | null, important: boolean): Promise<PresenceStatus | null> => {
    diag.judged = status ?? "none";
    await addDiagLog("auto_check", diag);
    await flushDiagLogs(client, memberId, { force: trigger === "foreground" || important });
    return status;
  };

  let status: PresenceStatus | null;
  if (wifiOnly) {
    // 位置情報は使わない。Wi-Fiの接続状況だけで判定する(F27)
    status = judgeWifiOnly(wifi);
  } else {
    // 登録したWi-Fi(自宅・別の部屋)につながっていれば位置に関係なく判定できるため、電池節約のため現在地は取らない
    let distanceM: number | null = null;
    if (wifi !== "home" && wifi !== "room" && config) {
      const position = await readCurrentPosition();
      diag.pos = position ? position.src : "none";
      if (position) distanceM = distanceMeters(position.lat, position.lng, config.lat, config.lng);
      diag.distM = distanceM === null ? undefined : Math.round(distanceM);
    } else {
      diag.pos = "skipped";
    }

    status = judgeAutoStatus({
      distanceM,
      homeRadiusM: config?.homeRadiusM ?? 0,
      buildingRadiusM: config?.buildingRadiusM ?? 0,
      wifi,
      strictWifi,
      nearbyGpsEnabled,
    });
    // 現在地が取れなくても、OSが知らせてくれた範囲の出入りから判定する
    if (!status && geofenceEvent) {
      status = judgeFromGeofenceEvent(geofenceEvent, wifi, strictWifi, nearbyGpsEnabled);
    }
  }
  if (!status) return finish(null, false);

  // 手動切替などで端末の前回値とサーバーがずれていても止まらないよう、サーバー上の状態と比べる
  const serverStatus = await fetchServerStatus(client, groupId, memberId);
  const current = serverStatus ?? (lastStatus as PresenceStatus | null);
  diag.server = serverStatus ?? "unknown";
  if (!shouldSendStatus(status, current)) {
    await AsyncStorage.setItem(LAST_STATUS_KEY, status);
    diag.sent = "same";
    return finish(status, false);
  }

  try {
    await client.updateStatus(memberId, status, "auto");
    await AsyncStorage.setItem(LAST_STATUS_KEY, status);
    diag.sent = "ok";
    return finish(status, true);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[${trigger}] ステータス更新に失敗しました`, err);
    diag.sent = "error";
    diag.err = err instanceof Error ? err.message.slice(0, 80) : "unknown";
    await finish(status, false);
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
    await addDiagLog("task_error", { task: "geofence", err: String((error as { message?: string })?.message ?? error) });
    return;
  }
  if (!data) return;
  // どちらの範囲のイベントでも、その時点の現在地から3段階のステータスを都度計算し直す。
  // 現在地が取れなかった場合だけ、イベントの内容(どの範囲に入った・出た)から判定する。
  await reportAutoStatus("geofence", toGeofenceEvent(data));
});

TaskManager.defineTask(WIFI_TASK_NAME, async ({ error }) => {
  if (error) {
    await addDiagLog("task_error", { task: "wifi", err: String((error as { message?: string })?.message ?? error) });
    return;
  }
  // どのWi-Fiにつながった場合でも起こされるため、自宅Wi-Fiかどうかはここで判定する
  await reportAutoStatus("wifi");
});

TaskManager.defineTask(WIFI_CHECK_TASK_NAME, async () => {
  try {
    await reportAutoStatus("periodic");
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    await addDiagLog("task_error", { task: "periodic", err: err instanceof Error ? err.message.slice(0, 80) : "unknown" });
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
  // Wi-Fiだけで判定するモード(F27)では、位置情報を使わないため、位置の見張り(ジオフェンス)は登録しない
  if (!(await loadWifiOnlyMode())) {
    const regions = [
      {
        identifier: HOME_REGION_ID,
        latitude: lat,
        longitude: lng,
        radius: homeRadiusM,
        notifyOnEnter: true,
        notifyOnExit: true,
      },
    ];
    // 「近くにいる」のGPS判定(F29)がオフのときは、建物の範囲は登録しない(自宅の範囲だけで在宅・外出中を決める)
    if (await loadNearbyGpsEnabled()) {
      regions.push({
        identifier: BUILDING_REGION_ID,
        latitude: lat,
        longitude: lng,
        radius: buildingRadiusM,
        notifyOnEnter: true,
        notifyOnExit: true,
      });
    }
    await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, regions);
  }
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
  if ((await loadRegisteredWifis()).length === 0) return;
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
 * いま接続中のWi-Fiを、自宅のWi-Fi(kind=home)または別の部屋のWi-Fi(kind=room)として登録し、見張りを開始する(F24)。
 * 同じWi-Fiを登録し直すと種類が入れ替わる。登録できない場合は、利用者向けの理由を含むErrorを投げる。
 * 登録後の一覧を返す。
 */
export async function registerWifi(kind: WifiKind): Promise<RegisteredWifi[]> {
  if (!isHomeWifiSupported()) throw new Error("この端末ではWi-Fiによる判定を利用できません");
  const permissions = await requestLocationPermissions();
  if (!permissions.foreground) {
    throw new Error("Wi-Fi名の読み取りには位置情報の許可が必要です");
  }
  const state = readWifiState();
  if (!state || !state.enabled) throw new Error("端末のWi-Fiがオフになっています");
  if (!state.connected) {
    throw new Error(
      `Wi-Fiに接続していません。${kind === "home" ? "自宅" : "その部屋"}のWi-Fiにつないでから登録してください`
    );
  }
  const ssid = state.ssid;
  if (!ssid) {
    throw new Error("Wi-Fi名を読み取れませんでした。位置情報をオンにし、権限を「常に許可」にしてください");
  }
  const next = [...(await loadRegisteredWifis()).filter((w) => w.ssid !== ssid), { ssid, kind }];
  await saveRegisteredWifis(next);
  await stopHomeWifiWatch();
  await startHomeWifiWatch();
  // 次のWi-Fi接続を待たずに、登録した時点の状態をすぐに反映する
  await reportAutoStatus("wifi");
  return next;
}

/**
 * アプリを開いたときに、いまの状況で判定し直す(F4)。
 * 判定の結果サーバーへ送った(または一致を確認した)ステータスを返す。判定できなければnull。
 */
export async function refreshAutoStatus(): Promise<PresenceStatus | null> {
  const config = await loadHomeGeofenceConfig();
  const wifiOnly = await loadWifiOnlyMode();
  if (wifiOnly) {
    // Wi-Fiだけで判定するモードでは自宅の位置は不要。Wi-Fiの見張りと定期確認だけ動かす
    if (!(await TaskManager.isTaskRegisteredAsync(WIFI_CHECK_TASK_NAME))) await startPeriodicCheck();
    await startHomeWifiWatch();
    return reportAutoStatus("foreground");
  }
  // 自宅が未登録の端末では自動判定しない
  if (!config) return null;
  if (!(await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME))) {
    // アプリの入れ直し・更新などでOSの見張りが消えていることがあるため、保存済みの自宅情報から登録し直す
    try {
      await startHomeGeofence(config.lat, config.lng, config.homeRadiusM, config.buildingRadiusM);
    } catch (err) {
      // 権限が無い等で登録できなくても、開いた時点のWi-Fi・現在地での判定は続ける
      // eslint-disable-next-line no-console
      console.warn("[foreground] ジオフェンスを再登録できませんでした", err);
    }
  }
  // 以前の版で自宅を登録した端末では定期確認が未登録のため、開いたついでに登録しておく
  if (!(await TaskManager.isTaskRegisteredAsync(WIFI_CHECK_TASK_NAME))) await startPeriodicCheck();
  return reportAutoStatus("foreground");
}

/** 手動で切り替えたステータスを、自動判定の前回値としても覚えておく(通信できないときの比較用)。 */
export async function rememberStatus(status: PresenceStatus): Promise<void> {
  await AsyncStorage.setItem(LAST_STATUS_KEY, status);
}

/** 登録したWi-Fiを1つ解除する。自宅のWi-Fiが無くなれば、厳密モードも解除する(F24)。解除後の一覧を返す。 */
export async function removeRegisteredWifi(ssid: string): Promise<RegisteredWifi[]> {
  const next = (await loadRegisteredWifis()).filter((w) => w.ssid !== ssid);
  await saveRegisteredWifis(next);
  await stopHomeWifiWatch();
  await startHomeWifiWatch();
  if (!next.some((w) => w.kind === "home")) {
    await saveStrictHomeWifi(false);
    // 自宅のWi-Fiが無いと「Wi-Fiだけで判定するモード」は成り立たないため、解除して位置での判定へ戻す
    if (await loadWifiOnlyMode()) await setWifiOnlyMode(false);
  }
  // 解除した結果をすぐに反映する(例:別の部屋のWi-Fiを外したら、近くにいる扱いが解ける)
  await reportAutoStatus("wifi");
  return next;
}

/**
 * 「自宅Wi-Fiにつながっているときだけ在宅にする」設定を切り替え、すぐに判定し直す(F24)。
 * マンションで別の階・別の部屋にいるときに、Wi-Fiをオフにしていても在宅にならないようにするための設定。
 */
export async function setStrictHomeWifi(enabled: boolean): Promise<void> {
  await saveStrictHomeWifi(enabled);
  await reportAutoStatus("wifi");
}

/**
 * 「位置情報を使わず、Wi-Fiの接続だけで判定する」モードを切り替え、すぐに判定し直す(F27)。
 * オンにすると位置の見張り(ジオフェンス)を止め、Wi-Fiの見張りと約15分ごとの確認だけで判定する。
 * オフに戻すと、自宅の位置が登録済みなら位置の見張りを再開する。
 * 自宅のWi-Fiが未登録のときは、オンにできない(判定の手がかりが無くなるため)。
 */
export async function setWifiOnlyMode(enabled: boolean): Promise<void> {
  if (enabled) {
    const wifis = await loadRegisteredWifis();
    if (!wifis.some((w) => w.kind === "home")) {
      throw new Error("先に「自宅のWi-Fi」を登録してください");
    }
  }
  await saveWifiOnlyMode(enabled);
  if (enabled) {
    if (await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME)) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
    }
    await startPeriodicCheck();
    await startHomeWifiWatch();
  } else {
    const config = await loadHomeGeofenceConfig();
    if (config) {
      try {
        await startHomeGeofence(config.lat, config.lng, config.homeRadiusM, config.buildingRadiusM);
      } catch (err) {
        // 権限が無い等で登録できなくても、Wi-Fiと開いた時点の現在地での判定は続ける
        // eslint-disable-next-line no-console
        console.warn("[wifiOnly] ジオフェンスを再登録できませんでした", err);
      }
    }
  }
  await addDiagLog("mode_change", { wifiOnly: enabled });
  await reportAutoStatus("wifi");
}

/**
 * 「近くにいる」をGPSで判定するか(F29)を切り替える。切り替えた時点で端末に保存し、位置の見張り(ジオフェンス)を
 * 登録し直して、すぐに判定し直す。画面の「この位置で保存する」を押さなくても、設定は残る。
 * 自宅の位置が未登録の間は、設定だけを保存する(自宅を保存したときに、この設定で見張りを登録する)。
 */
export async function applyNearbyGpsSetting(enabled: boolean): Promise<void> {
  await saveNearbyGpsEnabled(enabled);
  const config = await loadHomeGeofenceConfig();
  // Wi-Fiだけで判定するモード(F27)では、位置の見張りを使わないため、登録し直さない
  if (config && !(await loadWifiOnlyMode())) {
    try {
      await startHomeGeofence(config.lat, config.lng, config.homeRadiusM, config.buildingRadiusM);
    } catch (err) {
      // 権限が無い等で登録できなくても、設定の保存と、開いた時点の判定は続ける
      // eslint-disable-next-line no-console
      console.warn("[nearbyGps] ジオフェンスを再登録できませんでした", err);
    }
  }
  await addDiagLog("mode_change", { nearbyGps: enabled ? "on" : "off" });
  if (config) await reportAutoStatus("wifi");
}

export async function getCurrentLocation(): Promise<{ lat: number; lng: number }> {
  const position = await Location.getCurrentPositionAsync({});
  return { lat: position.coords.latitude, lng: position.coords.longitude };
}
