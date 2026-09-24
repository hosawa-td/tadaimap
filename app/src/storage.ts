import AsyncStorage from "@react-native-async-storage/async-storage";

export const STORAGE_KEYS = {
  groupId: "tadaimap.groupId",
  memberId: "tadaimap.memberId",
  myName: "tadaimap.myName",
  showName: "tadaimap.showName",
  notifyEnabled: "tadaimap.notifyEnabled",
  homeRadiusM: "tadaimap.homeRadiusM",
  buildingRadiusM: "tadaimap.buildingRadiusM",
  nearbyLabel: "tadaimap.nearbyLabel",
  homeLat: "tadaimap.homeLat",
  homeLng: "tadaimap.homeLng",
} as const;

export async function saveMembership(groupId: string, memberId: string, name: string): Promise<void> {
  await AsyncStorage.multiSet([
    [STORAGE_KEYS.groupId, groupId],
    [STORAGE_KEYS.memberId, memberId],
    [STORAGE_KEYS.myName, name],
  ]);
}

export async function loadMembership(): Promise<{
  groupId: string | null;
  memberId: string | null;
  myName: string | null;
}> {
  const values = await AsyncStorage.multiGet([
    STORAGE_KEYS.groupId,
    STORAGE_KEYS.memberId,
    STORAGE_KEYS.myName,
  ]);
  const map = Object.fromEntries(values);
  return {
    groupId: map[STORAGE_KEYS.groupId] ?? null,
    memberId: map[STORAGE_KEYS.memberId] ?? null,
    myName: map[STORAGE_KEYS.myName] ?? null,
  };
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

export async function clearMembership(): Promise<void> {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.groupId,
    STORAGE_KEYS.memberId,
    STORAGE_KEYS.myName,
    STORAGE_KEYS.showName,
    STORAGE_KEYS.notifyEnabled,
    STORAGE_KEYS.homeRadiusM,
    STORAGE_KEYS.buildingRadiusM,
    STORAGE_KEYS.nearbyLabel,
    STORAGE_KEYS.homeLat,
    STORAGE_KEYS.homeLng,
  ]);
}
