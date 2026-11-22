import type { PresenceStatus } from "./api";

/** 2地点間の距離をメートルで返す(Haversine公式)。 */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface WifiState {
  enabled: boolean;
  connected: boolean;
  ssid: string | null;
}

/**
 * 登録したWi-Fiとの関係(F24)。
 * - none: 自宅のWi-Fiが未登録(別の部屋のWi-Fiにつながっている場合を除く)
 * - unknown: Wi-Fiがオフ・Wi-Fi名が読めない等で判断できない
 * - home: 自宅のWi-Fiに接続中
 * - room: 登録した別の部屋のWi-Fiに接続中
 * - other: Wi-Fiはオンだが、登録したWi-Fiには接続していない
 */
export type WifiMatch = "none" | "unknown" | "home" | "room" | "other";

/** 登録したWi-Fi。home=自宅、room=別の部屋。 */
export interface WifiEntry {
  ssid: string;
  kind: "home" | "room";
}

export function classifyWifi(state: WifiState | null, wifis: WifiEntry[]): WifiMatch {
  if (wifis.length === 0) return "none";
  const hasHome = wifis.some((w) => w.kind === "home");
  // 自宅のWi-Fiが未登録なら、別の部屋のWi-Fiにつながっている場合以外は距離だけで判定する
  const noMatch = hasHome ? "other" : "none";
  const noInfo = hasHome ? "unknown" : "none";
  if (!state || !state.enabled) return noInfo;
  if (!state.connected) return noMatch;
  if (state.ssid === null) return noInfo;
  const matched = wifis.find((w) => w.ssid === state.ssid);
  if (!matched) return noMatch;
  return matched.kind === "home" ? "home" : "room";
}

/**
 * 「自宅Wi-Fiの届く範囲(自分の部屋)の外にいる」とみなすかどうか。
 * 通常はWi-Fiにつながっていて別のWi-Fiの場合だけ。厳密モード(strictWifi)では、Wi-Fiがオフ・名前が読めない
 * 場合も「部屋にいる証拠が無い」ものとして外とみなす(別の階の部屋でWi-Fiをオフにしていても在宅にしないため)。
 */
function isOutsideHomeWifi(wifi: WifiMatch, strictWifi?: boolean): boolean {
  return wifi === "other" || (!!strictWifi && wifi === "unknown");
}

/**
 * 自宅までの距離と自宅Wi-Fiとの関係から、3段階のステータスを判定する(F4・F24)。
 * 判定に必要な情報が足りない場合はnull(ステータスを変更しない)。
 */
export function judgeAutoStatus(input: {
  distanceM: number | null;
  homeRadiusM: number;
  buildingRadiusM: number;
  wifi: WifiMatch;
  /** マンションの別の階・別の部屋と区別するため、自宅Wi-Fiにつながっていなければ在宅にしない設定。 */
  strictWifi?: boolean;
  /**
   * 「近くにいる」(施設内)をGPSの距離で判定するか(F29)。省略時はtrue(従来どおり)。
   * falseのときは、GPSでは「近くにいる」を作らず、自宅の範囲の内側なら在宅、外側なら外出中とする。
   */
  nearbyGpsEnabled?: boolean;
}): PresenceStatus | null {
  const { distanceM, homeRadiusM, buildingRadiusM, wifi } = input;
  // 自宅Wi-Fiは部屋の中でしか届かないため、つながっていれば屋内のGPSのずれより優先して在宅とみなす
  if (wifi === "home") return "home";
  // 別の部屋のWi-Fiにつながっていれば、その部屋(同じ建物内)にいるため、距離に関係なく「近くにいる」とみなす
  // (これはWi-Fiによる判定なので、GPSの「近くにいる」判定をオフにしても変わらない)
  if (wifi === "room") return "nearby";
  if (distanceM === null) return null;
  if (input.nearbyGpsEnabled === false) return distanceM <= homeRadiusM ? "home" : "away";
  if (distanceM > buildingRadiusM) return "away";
  // 自宅Wi-Fiが登録済みでつながっていなければ、同じ建物内(1Fロビー・別の階の部屋等)にいるとみなす
  if (isOutsideHomeWifi(wifi, input.strictWifi)) return "nearby";
  return distanceM <= homeRadiusM ? "home" : "nearby";
}

/**
 * 位置情報を使わず、Wi-Fiの接続状況だけから3段階のステータスを判定する(F27)。
 * - 自宅のWi-Fiに接続中 → 在宅
 * - 登録した別の部屋のWi-Fiに接続中 → 施設内
 * - 接続していない・登録外のWi-Fiに接続中 → 外出
 * - Wi-Fiがオフ・Wi-Fi名が読めない・Wi-Fi未登録 → 判断できないためnull(ステータスを変更しない)
 */
export function judgeWifiOnly(wifi: WifiMatch): PresenceStatus | null {
  if (wifi === "home") return "home";
  if (wifi === "room") return "nearby";
  if (wifi === "other") return "away";
  return null;
}

/** ジオフェンス(自宅・建物の2つの範囲)の出入りイベント。 */
export interface GeofenceEvent {
  regionId: "home" | "building";
  type: "enter" | "exit";
}

/**
 * 現在地が取れなかったときに、ジオフェンスの出入りイベントそのものから3段階のステータスを判定する(F4・F24)。
 * アプリが閉じているときの現在地の取得は失敗しやすいため、OSが知らせてくれた「どの範囲に入った・出た」を
 * 捨てずに判定に使う。
 */
export function judgeFromGeofenceEvent(
  event: GeofenceEvent,
  wifi: WifiMatch,
  strictWifi?: boolean,
  nearbyGpsEnabled: boolean = true
): PresenceStatus | null {
  if (wifi === "home") return "home";
  if (wifi === "room") return "nearby";
  if (!nearbyGpsEnabled) {
    // 「近くにいる」のGPS判定がオフのときは、自宅の範囲の出入りだけで在宅・外出中を決める(建物の範囲は使わない)
    if (event.regionId !== "home") return null;
    return event.type === "exit" ? "away" : "home";
  }
  if (event.regionId === "home") {
    if (event.type === "exit") return "nearby";
    // 自宅Wi-Fiが登録済みでつながっていなければ、同じ建物内(1Fロビー・別の階の部屋等)にいるとみなす
    return isOutsideHomeWifi(wifi, strictWifi) ? "nearby" : "home";
  }
  return event.type === "exit" ? "away" : "nearby";
}

/**
 * 判定結果をサーバーへ送るべきかどうか。
 * 比べる相手は「サーバー上のいまの自分の状態」(取得できなかった場合のみ端末に覚えている前回値)。
 * 手動切替・管理者の変更・Web版の自動判定で状態が変わっていても、ずれたまま送信が止まらないようにするため。
 */
export function shouldSendStatus(
  next: PresenceStatus | null,
  current: PresenceStatus | null
): next is PresenceStatus {
  return next !== null && next !== current;
}
