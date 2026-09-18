import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiClient } from "./api";
import { getOrCreateDeviceId } from "./deviceId";
import { STORAGE_KEYS } from "./storage";

export const GEOFENCE_TASK_NAME = "tadaimap-home-geofence";
const REGION_ID = "home";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[geofence] エラー", error);
    return;
  }
  const eventType = (data as { eventType?: Location.GeofencingEventType })?.eventType;
  if (eventType === undefined) return;

  const [deviceId, memberId] = await Promise.all([
    getOrCreateDeviceId(),
    AsyncStorage.getItem(STORAGE_KEYS.memberId),
  ]);
  if (!memberId) return;

  const status = eventType === Location.GeofencingEventType.Enter ? "home" : "away";
  const client = new ApiClient(API_BASE_URL, deviceId);
  try {
    await client.updateStatus(memberId, status, "auto");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[geofence] ステータス更新に失敗しました", err);
  }
});

export async function requestLocationPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") {
    return { foreground: false, background: false };
  }
  const bg = await Location.requestBackgroundPermissionsAsync();
  return { foreground: true, background: bg.status === "granted" };
}

export async function startHomeGeofence(lat: number, lng: number, radiusM: number): Promise<void> {
  await stopHomeGeofence();
  await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, [
    {
      identifier: REGION_ID,
      latitude: lat,
      longitude: lng,
      radius: radiusM,
      notifyOnEnter: true,
      notifyOnExit: true,
    },
  ]);
}

export async function stopHomeGeofence(): Promise<void> {
  const started = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME);
  if (started) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
  }
}

export async function getCurrentLocation(): Promise<{ lat: number; lng: number }> {
  const position = await Location.getCurrentPositionAsync({});
  return { lat: position.coords.latitude, lng: position.coords.longitude };
}
