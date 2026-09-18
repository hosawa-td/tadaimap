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
    homeRadiusM: number
  ): Promise<Member>;

  updateStatus(
    memberId: string,
    deviceId: string,
    status: PresenceStatus
  ): Promise<Member>;

  updateProfile(
    memberId: string,
    deviceId: string,
    fields: { name?: string; showName?: boolean }
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
