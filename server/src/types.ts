export type PresenceStatus = "home" | "nearby" | "away";

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
  /** 自宅より一回り大きい「施設内」判定用の範囲(メートル)。homeRadiusM以上の値。 */
  buildingRadiusM: number | null;
  /** "nearby"ステータスの表示名。本人が自由に設定できる(初期値「施設内」)。 */
  nearbyLabel: string;
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
  /** status が "nearby" の場合に表示すべきラベル(本人が設定した呼び方)。 */
  nearbyLabel: string;
}
