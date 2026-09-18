export const NAME_MAX_LENGTH = 12;
export const RADIUS_MIN = 50;
export const RADIUS_MAX = 300;
export const RADIUS_DEFAULT = 100;

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
