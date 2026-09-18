import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "tadaimap.deviceId";

function generateId(): string {
  const s4 = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const id = generateId();
  await AsyncStorage.setItem(STORAGE_KEY, id);
  return id;
}
