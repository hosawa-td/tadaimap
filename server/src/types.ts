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
  /** 在宅中の詳細な状態(例:「トイレ中」「入浴中」)。本人が自由に設定できる。状態が変わるたびに空に戻る。 */
  homeDetail: string;
  homeLat: number | null;
  homeLng: number | null;
  homeRadiusM: number | null;
  /** 自宅より一回り大きい「施設内」判定用の範囲(メートル)。homeRadiusM以上の値。 */
  buildingRadiusM: number | null;
  notifyEnabled: boolean;
  /** ネイティブアプリ(Expo)のプッシュ通知トークン。 */
  pushToken: string | null;
  /** Web版のプッシュ通知(Web Push)の購読情報。JSON文字列({endpoint, keys})で保持する。 */
  webPushSubscription: string | null;
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
  /** status が "home" の場合に、本人が任意で設定した詳細な状態(例:「トイレ中」)。 */
  homeDetail: string;
  /** このメンバーが管理者かどうか(管理者は家族一覧で分かるようにする)。 */
  isAdmin: boolean;
  /**
   * 自宅位置・判定範囲(登録済みの場合のみ)。他メンバーの位置情報を見せないよう、
   * isMeがtrueの行にだけ含める(Web版が、画面を開いた瞬間の自動判定に使う)。
   */
  home: { lat: number; lng: number; homeRadiusM: number; buildingRadiusM: number } | null;
}
