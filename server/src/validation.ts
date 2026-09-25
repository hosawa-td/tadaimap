export const NAME_MAX_LENGTH = 12;
export const RADIUS_MIN = 50;
export const RADIUS_MAX = 300;
export const BUILDING_RADIUS_MIN = 100;
export const BUILDING_RADIUS_MAX = 2000;
export const NEARBY_LABEL_MAX_LENGTH = 12;
export const NEARBY_LABEL_DEFAULT = "施設内";
export const HOME_DETAIL_MAX_LENGTH = 12;

export function isValidName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.trim().length > 0 &&
    name.trim().length <= NAME_MAX_LENGTH
  );
}

export function isValidInviteCode(code: unknown): code is string {
  return typeof code === "string" && /^[0-9]{6}$/.test(code);
}

export function isValidRadius(radius: unknown): radius is number {
  return (
    typeof radius === "number" &&
    Number.isFinite(radius) &&
    radius >= RADIUS_MIN &&
    radius <= RADIUS_MAX
  );
}

export function isValidBuildingRadius(radius: unknown, homeRadiusM: number): radius is number {
  return (
    typeof radius === "number" &&
    Number.isFinite(radius) &&
    radius >= BUILDING_RADIUS_MIN &&
    radius <= BUILDING_RADIUS_MAX &&
    radius >= homeRadiusM
  );
}

export function isValidNearbyLabel(label: unknown): label is string {
  return (
    typeof label === "string" &&
    label.trim().length > 0 &&
    label.trim().length <= NEARBY_LABEL_MAX_LENGTH
  );
}

export function isValidStatus(status: unknown): status is "home" | "nearby" | "away" {
  return status === "home" || status === "nearby" || status === "away";
}

/** 在宅中の詳細な状態(例:「トイレ中」)。空文字(未設定に戻す)も許可する。 */
export function isValidHomeDetail(detail: unknown): detail is string {
  return typeof detail === "string" && detail.trim().length <= HOME_DETAIL_MAX_LENGTH;
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function isValidDeviceId(deviceId: unknown): deviceId is string {
  return typeof deviceId === "string" && deviceId.trim().length > 0;
}

/** Web Push購読情報({endpoint, keys: {p256dh, auth}})の形をしているか検証する。 */
export function isValidWebPushSubscription(
  subscription: unknown
): subscription is { endpoint: string; keys: { p256dh: string; auth: string } } {
  if (typeof subscription !== "object" || subscription === null) return false;
  const sub = subscription as Record<string, unknown>;
  if (typeof sub.endpoint !== "string" || sub.endpoint.trim().length === 0) return false;
  if (typeof sub.keys !== "object" || sub.keys === null) return false;
  const keys = sub.keys as Record<string, unknown>;
  return (
    typeof keys.p256dh === "string" &&
    keys.p256dh.length > 0 &&
    typeof keys.auth === "string" &&
    keys.auth.length > 0
  );
}
