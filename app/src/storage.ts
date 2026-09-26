import AsyncStorage from "@react-native-async-storage/async-storage";

export const STORAGE_KEYS = {
  // 後方互換のため残しているキー(1端末1グループだった頃の名残)。読み込み時に一度だけ移行する。
  groupId: "tadaimap.groupId",
  memberId: "tadaimap.memberId",
  myName: "tadaimap.myName",
  memberships: "tadaimap.memberships",
  currentGroupId: "tadaimap.currentGroupId",
  showName: "tadaimap.showName",
  notifyEnabled: "tadaimap.notifyEnabled",
  homeRadiusM: "tadaimap.homeRadiusM",
  buildingRadiusM: "tadaimap.buildingRadiusM",
  nearbyLabel: "tadaimap.nearbyLabel",
  homeLat: "tadaimap.homeLat",
  homeLng: "tadaimap.homeLng",
} as const;

/** 1台の端末が複数の家族グループに参加できるように、参加中のグループを配列で保持する。 */
export interface Membership {
  groupId: string;
  memberId: string;
  myName: string;
  /** 一覧上でグループを見分けやすくするための表示用情報(DBから取得できた場合のみ)。 */
  inviteCode?: string | null;
}

async function readMembershipsRaw(): Promise<Membership[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.memberships);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeMemberships(list: Membership[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.memberships, JSON.stringify(list));
}

/**
 * バックグラウンドの位置情報タスク(location.ts)は別のJSコンテキストで動くため、
 * 一覧を都度読み直す代わりに「いまアクティブなグループのmemberId」を単一キーへ複製しておく。
 */
async function syncActiveMemberPointer(membership: Membership | null): Promise<void> {
  if (membership) {
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.groupId, membership.groupId],
      [STORAGE_KEYS.memberId, membership.memberId],
      [STORAGE_KEYS.myName, membership.myName],
    ]);
  } else {
    await AsyncStorage.multiRemove([STORAGE_KEYS.groupId, STORAGE_KEYS.memberId, STORAGE_KEYS.myName]);
  }
}

/**
 * 参加中のグループ一覧と、現在アクティブなグループIDを読み込む。
 * まだ新形式のデータが無く、旧形式(1グループ分のみ)のデータが残っている端末では、
 * このタイミングで新形式に一度だけ移行する。
 */
export async function loadMemberships(): Promise<{
  memberships: Membership[];
  currentGroupId: string | null;
}> {
  let memberships = await readMembershipsRaw();
  let currentGroupId = await AsyncStorage.getItem(STORAGE_KEYS.currentGroupId);

  if (memberships.length === 0) {
    const legacy = await AsyncStorage.multiGet([
      STORAGE_KEYS.groupId,
      STORAGE_KEYS.memberId,
      STORAGE_KEYS.myName,
    ]);
    const legacyMap = Object.fromEntries(legacy);
    const legacyGroupId = legacyMap[STORAGE_KEYS.groupId];
    const legacyMemberId = legacyMap[STORAGE_KEYS.memberId];
    if (legacyGroupId && legacyMemberId) {
      memberships = [
        { groupId: legacyGroupId, memberId: legacyMemberId, myName: legacyMap[STORAGE_KEYS.myName] ?? "" },
      ];
      currentGroupId = legacyGroupId;
      await writeMemberships(memberships);
      await AsyncStorage.setItem(STORAGE_KEYS.currentGroupId, legacyGroupId);
      // groupId/memberId/myNameの単一キーは、location.tsが参照する「現在アクティブなグループ」の
      // 複製として引き続き使うため、ここでは削除しない(値は既に一致している)。
    }
  }

  if (!currentGroupId || !memberships.some((m) => m.groupId === currentGroupId)) {
    currentGroupId = memberships[0]?.groupId ?? null;
  }

  return { memberships, currentGroupId };
}

/** グループへの参加(作成含む)を、参加中グループの一覧に追加し、アクティブなグループとして選択する。 */
export async function addMembership(membership: Membership): Promise<void> {
  const { memberships } = await loadMemberships();
  const next = [...memberships.filter((m) => m.groupId !== membership.groupId), membership];
  await writeMemberships(next);
  await AsyncStorage.setItem(STORAGE_KEYS.currentGroupId, membership.groupId);
  await syncActiveMemberPointer(membership);
}

/** グループの退出・削除にともなって、参加中グループの一覧から取り除く。 */
export async function removeMembership(
  groupId: string
): Promise<{ memberships: Membership[]; currentGroupId: string | null }> {
  const { memberships, currentGroupId } = await loadMemberships();
  const next = memberships.filter((m) => m.groupId !== groupId);
  await writeMemberships(next);
  const nextCurrent = currentGroupId === groupId ? next[0]?.groupId ?? null : currentGroupId;
  if (nextCurrent) {
    await AsyncStorage.setItem(STORAGE_KEYS.currentGroupId, nextCurrent);
  } else {
    await AsyncStorage.removeItem(STORAGE_KEYS.currentGroupId);
  }
  await syncActiveMemberPointer(next.find((m) => m.groupId === nextCurrent) ?? null);
  return { memberships: next, currentGroupId: nextCurrent };
}

export async function setCurrentGroupId(groupId: string): Promise<void> {
  const { memberships } = await loadMemberships();
  await AsyncStorage.setItem(STORAGE_KEYS.currentGroupId, groupId);
  await syncActiveMemberPointer(memberships.find((m) => m.groupId === groupId) ?? null);
}

/**
 * 端末内の保存内容(参加中グループ一覧)を、サーバー(DB)から取得した最新の内容で置き換える。
 * 端末の保存領域が失われた場合や、複数端末での操作で内容がずれた場合でも、
 * 実際にDB上でこの端末が参加しているグループへ復元・同期できるようにするため。
 */
export async function replaceMemberships(
  serverMemberships: Membership[]
): Promise<{ memberships: Membership[]; currentGroupId: string | null }> {
  const { currentGroupId: previousCurrent } = await loadMemberships();
  await writeMemberships(serverMemberships);
  const currentGroupId = serverMemberships.some((m) => m.groupId === previousCurrent)
    ? previousCurrent
    : serverMemberships[0]?.groupId ?? null;
  if (currentGroupId) {
    await AsyncStorage.setItem(STORAGE_KEYS.currentGroupId, currentGroupId);
  } else {
    await AsyncStorage.removeItem(STORAGE_KEYS.currentGroupId);
  }
  await syncActiveMemberPointer(serverMemberships.find((m) => m.groupId === currentGroupId) ?? null);
  return { memberships: serverMemberships, currentGroupId };
}

export async function updateMembershipName(groupId: string, myName: string): Promise<void> {
  const { memberships, currentGroupId } = await loadMemberships();
  const next = memberships.map((m) => (m.groupId === groupId ? { ...m, myName } : m));
  await writeMemberships(next);
  if (currentGroupId === groupId) {
    await syncActiveMemberPointer(next.find((m) => m.groupId === groupId) ?? null);
  }
}

/**
 * 自宅の中心位置・判定範囲を、バックグラウンドの位置情報タスクからも
 * 参照できるように端末内に保存しておく(ジオフェンスのイベントハンドラは
 * 別のJSコンテキストで実行されるため、AsyncStorage経由で受け渡す)。
 */
export async function saveHomeGeofenceConfig(config: {
  lat: number;
  lng: number;
  homeRadiusM: number;
  buildingRadiusM: number;
}): Promise<void> {
  await AsyncStorage.multiSet([
    [STORAGE_KEYS.homeLat, String(config.lat)],
    [STORAGE_KEYS.homeLng, String(config.lng)],
    [STORAGE_KEYS.homeRadiusM, String(config.homeRadiusM)],
    [STORAGE_KEYS.buildingRadiusM, String(config.buildingRadiusM)],
  ]);
}

export async function loadHomeGeofenceConfig(): Promise<{
  lat: number;
  lng: number;
  homeRadiusM: number;
  buildingRadiusM: number;
} | null> {
  const values = await AsyncStorage.multiGet([
    STORAGE_KEYS.homeLat,
    STORAGE_KEYS.homeLng,
    STORAGE_KEYS.homeRadiusM,
    STORAGE_KEYS.buildingRadiusM,
  ]);
  const map = Object.fromEntries(values);
  const lat = Number(map[STORAGE_KEYS.homeLat]);
  const lng = Number(map[STORAGE_KEYS.homeLng]);
  const homeRadiusM = Number(map[STORAGE_KEYS.homeRadiusM]);
  const buildingRadiusM = Number(map[STORAGE_KEYS.buildingRadiusM]);
  if (![lat, lng, homeRadiusM, buildingRadiusM].every(Number.isFinite)) {
    return null;
  }
  return { lat, lng, homeRadiusM, buildingRadiusM };
}

function memberOrderKey(groupId: string): string {
  return `tadaimap.memberOrder.${groupId}`;
}

/**
 * ホーム画面の家族一覧の並び順(このグループでの、この端末だけの表示順)。
 * 他のメンバーには影響しない、見た目だけの設定のため端末内にのみ保存する。
 */
export async function loadMemberOrder(groupId: string): Promise<string[] | null> {
  const raw = await AsyncStorage.getItem(memberOrderKey(groupId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveMemberOrder(groupId: string, memberIdsInOrder: string[]): Promise<void> {
  await AsyncStorage.setItem(memberOrderKey(groupId), JSON.stringify(memberIdsInOrder));
}

/** 参加中のグループが1つも残らなくなったときに、端末に残るすべてのローカル状態を消す。 */
export async function clearAllMemberships(): Promise<void> {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.groupId,
    STORAGE_KEYS.memberId,
    STORAGE_KEYS.myName,
    STORAGE_KEYS.memberships,
    STORAGE_KEYS.currentGroupId,
    STORAGE_KEYS.showName,
    STORAGE_KEYS.notifyEnabled,
    STORAGE_KEYS.homeRadiusM,
    STORAGE_KEYS.buildingRadiusM,
    STORAGE_KEYS.nearbyLabel,
    STORAGE_KEYS.homeLat,
    STORAGE_KEYS.homeLng,
  ]);
}
