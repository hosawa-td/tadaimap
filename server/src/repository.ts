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

  /** 指定したグループの中で、この端末が持っているメンバー行を返す(1台の端末が複数グループに参加できるため)。 */
  getMemberByGroupAndDevice(groupId: string, deviceId: string): Promise<Member | null>;

  /** この端末が参加しているすべてのグループのメンバー行を、DB(スプレッドシート)から取得する。 */
  getMembersByDeviceId(deviceId: string): Promise<Member[]>;

  updateHome(
    memberId: string,
    deviceId: string,
    homeLat: number,
    homeLng: number,
    homeRadiusM: number,
    buildingRadiusM: number
  ): Promise<Member>;

  /** 状態(status)を変更する。あわせて homeDetail は自動的に空へ戻す。 */
  updateStatus(
    memberId: string,
    deviceId: string,
    status: PresenceStatus
  ): Promise<Member>;

  /** 在宅中の詳細な状態(例:「トイレ中」)を変更する。本人のみ実行できる。 */
  updateHomeDetail(memberId: string, deviceId: string, homeDetail: string): Promise<Member>;

  updateProfile(
    memberId: string,
    deviceId: string,
    fields: { name?: string; showName?: boolean }
  ): Promise<Member>;

  /** "nearby"ステータスの呼び方(グループ共通)を変更する。管理者のみ実行できる。 */
  updateGroupNearbyLabel(groupId: string, deviceId: string, nearbyLabel: string): Promise<Group>;

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

  /** Web版のプッシュ通知(Web Push)の購読情報を登録・解除する。nullで解除。 */
  updateWebPushSubscription(
    memberId: string,
    deviceId: string,
    subscription: string | null
  ): Promise<Member>;

  refreshInviteCode(groupId: string, deviceId: string): Promise<Group>;

  /** 本人がグループから抜ける。 */
  leaveGroup(memberId: string, deviceId: string): Promise<void>;

  /** 管理者が、自分以外のメンバーをグループから削除する。 */
  removeMember(memberId: string, requesterDeviceId: string): Promise<void>;

  /** 管理者がグループそのものを削除する(所属メンバー全員も削除される)。 */
  deleteGroup(groupId: string, requesterDeviceId: string): Promise<void>;
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
