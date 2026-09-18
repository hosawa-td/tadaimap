export type PresenceStatus = "home" | "away";

export interface Group {
  groupId: string;
  inviteCode: string;
  inviteCodeExpiresAt: string; // ISO8601
  createdAt: string; // ISO8601
}

export interface Member {
  memberId: string;
  groupId: string;
  deviceId: string;
  name: string;
  showName: boolean;
  status: PresenceStatus;
  statusUpdatedAt: string; // ISO8601
  homeLat: number | null;
  homeLng: number | null;
  homeRadiusM: number | null;
  notifyEnabled: boolean;
  pushToken: string | null;
  createdAt: string; // ISO8601
}

export interface MemberView {
  memberId: string;
  nameOrAnonymous: string;
  isMe: boolean;
  status: PresenceStatus;
  statusUpdatedAt: string;
}
