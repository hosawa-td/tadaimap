import AsyncStorage from "@react-native-async-storage/async-storage";

export const STORAGE_KEYS = {
  groupId: "tadaimap.groupId",
  memberId: "tadaimap.memberId",
  myName: "tadaimap.myName",
  showName: "tadaimap.showName",
  notifyEnabled: "tadaimap.notifyEnabled",
  homeRadiusM: "tadaimap.homeRadiusM",
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

export async function clearMembership(): Promise<void> {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.groupId,
    STORAGE_KEYS.memberId,
    STORAGE_KEYS.myName,
    STORAGE_KEYS.showName,
    STORAGE_KEYS.notifyEnabled,
    STORAGE_KEYS.homeRadiusM,
  ]);
}
