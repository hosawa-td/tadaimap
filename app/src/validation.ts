export const NAME_MAX_LENGTH = 12;
export const RADIUS_MIN = 50;
export const RADIUS_MAX = 300;
export const RADIUS_DEFAULT = 100;
export const BUILDING_RADIUS_MIN = 100;
export const BUILDING_RADIUS_MAX = 2000;
export const BUILDING_RADIUS_DEFAULT = 300;
export const NEARBY_LABEL_MAX_LENGTH = 12;
export const NEARBY_LABEL_DEFAULT = "施設内";
export const HOME_DETAIL_MAX_LENGTH = 12;

export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= NAME_MAX_LENGTH;
}

export function isValidInviteCode(code: string): boolean {
  return /^[0-9]{6}$/.test(code);
}

export function isValidRadius(radius: number): boolean {
  return Number.isFinite(radius) && radius >= RADIUS_MIN && radius <= RADIUS_MAX;
}

export function isValidBuildingRadius(radius: number, homeRadiusM: number): boolean {
  return (
    Number.isFinite(radius) &&
    radius >= BUILDING_RADIUS_MIN &&
    radius <= BUILDING_RADIUS_MAX &&
    radius >= homeRadiusM
  );
}

export function isValidNearbyLabel(label: string): boolean {
  const trimmed = label.trim();
  return trimmed.length > 0 && trimmed.length <= NEARBY_LABEL_MAX_LENGTH;
}

/** 在宅中の詳細な状態(例:「トイレ中」)。空文字(未設定に戻す)も許可する。 */
export function isValidHomeDetail(detail: string): boolean {
  return detail.trim().length <= HOME_DETAIL_MAX_LENGTH;
}
