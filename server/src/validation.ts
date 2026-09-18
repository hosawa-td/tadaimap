export const NAME_MAX_LENGTH = 12;
export const RADIUS_MIN = 50;
export const RADIUS_MAX = 300;

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
