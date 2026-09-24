export type PresenceStatus = "home" | "nearby" | "away";

export interface Group {
  groupId: string;
  inviteCode: string;
  inviteCodeExpiresAt: string; // ISO8601
  createdAt: string; // ISO8601
  /** "nearby"ステータスの表示名。グループ共通で、管理者だけが変更できる(初期値「施設内」)。 */
  nearbyLabel: string;
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
  notifyEnabled: boolean;
  pushToken: string | null;
  createdAt: string; // ISO8601
  /** グループを作成した人が管理者。管理者は他のメンバーの状態も手動で変更できる。 */
  isAdmin: boolean;
}

export interface MemberView {
  memberId: string;
  nameOrAnonymous: string;
  isMe: boolean;
  status: PresenceStatus;
  statusUpdatedAt: string;
  /** status が "nearby" の場合に表示すべきラベル(グループ共通・管理者が設定した呼び方)。 */
  nearbyLabel: string;
  /** このメンバーが管理者かどうか(管理者は家族一覧で分かるようにする)。 */
  isAdmin: boolean;
}
