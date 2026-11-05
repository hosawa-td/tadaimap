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
 * 自宅Wi-Fiとの関係(F24)。
 * - none: 自宅Wi-Fiが未登録
 * - unknown: Wi-Fiがオフ・Wi-Fi名が読めない等で判断できない
 * - home: 自宅Wi-Fiに接続中
 * - other: Wi-Fiはオンだが、自宅Wi-Fiには接続していない
 */
export type WifiMatch = "none" | "unknown" | "home" | "other";

export function classifyWifi(state: WifiState | null, homeSsid: string | null): WifiMatch {
  if (!homeSsid) return "none";
  if (!state || !state.enabled) return "unknown";
  if (!state.connected) return "other";
  if (state.ssid === null) return "unknown";
  return state.ssid === homeSsid ? "home" : "other";
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
}): PresenceStatus | null {
  const { distanceM, homeRadiusM, buildingRadiusM, wifi } = input;
  // 自宅Wi-Fiは部屋の中でしか届かないため、つながっていれば屋内のGPSのずれより優先して在宅とみなす
  if (wifi === "home") return "home";
  if (distanceM === null) return null;
  if (distanceM > buildingRadiusM) return "away";
  // 自宅Wi-Fiが登録済みでつながっていなければ、同じ建物内(1Fロビー等)にいるとみなす
  if (wifi === "other") return "nearby";
  return distanceM <= homeRadiusM ? "home" : "nearby";
}
