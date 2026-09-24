import { Group, Member, PresenceStatus } from "./types";

export interface Repository {
  createGroup(deviceId: string, name: string): Promise<{ group: Group; member: Member }>;

  joinGroup(
    deviceId: string,
    inviteCode: string,
    name: string
  ): Promise<{ group: Group; member: Member }>;

  getGroup(groupId: string): Promise<Group | null>;

  getMembersByGroup(groupId: string): Promise<Member[]>;

  getMemberById(memberId: string): Promise<Member | null>;

  getMemberByDeviceId(deviceId: string): Promise<Member | null>;

  updateHome(
    memberId: string,
    deviceId: string,
    homeLat: number,
    homeLng: number,
    homeRadiusM: number,
    buildingRadiusM: number
  ): Promise<Member>;

  updateStatus(
    memberId: string,
    deviceId: string,
    status: PresenceStatus
  ): Promise<Member>;

  updateProfile(
    memberId: string,
    deviceId: string,
    fields: { name?: string; showName?: boolean; nearbyLabel?: string }
  ): Promise<Member>;

  updateNotify(
    memberId: string,
    deviceId: string,
    notifyEnabled: boolean
  ): Promise<Member>;

  updatePushToken(
    memberId: string,
    deviceId: string,
    pushToken: string
  ): Promise<Member>;

  refreshInviteCode(groupId: string, deviceId: string): Promise<Group>;

  leaveGroup(memberId: string, deviceId: string): Promise<void>;
}

/**
 * 指定したメンバーが、そのグループの管理者として扱えるかを判定する。
 * 通常は member.isAdmin を見るだけでよいが、この機能を追加する前に
 * 作られたグループには is_admin の記録が無いため、その場合は
 * 作成日時が最も古いメンバーを管理者とみなす(後方互換のため)。
 */
export function isEffectiveAdmin(candidate: Member, groupMembers: Member[]): boolean {
  if (candidate.isAdmin) return true;
  const anyExplicitAdmin = groupMembers.some((m) => m.isAdmin);
  if (anyExplicitAdmin) return false;
  const earliest = groupMembers.reduce((a, b) =>
    new Date(a.createdAt).getTime() <= new Date(b.createdAt).getTime() ? a : b
  );
  return candidate.memberId === earliest.memberId;
}

export const INVITE_CODE_VALID_DAYS = 7;

export function generateInviteCode(): string {
  const n = Math.floor(Math.random() * 1_000_000);
  return n.toString().padStart(6, "0");
}

export function inviteCodeExpiryFrom(now: Date): string {
  const expires = new Date(now.getTime());
  expires.setDate(expires.getDate() + INVITE_CODE_VALID_DAYS);
  return expires.toISOString();
}
