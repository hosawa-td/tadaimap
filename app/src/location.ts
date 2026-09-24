import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiClient, PresenceStatus } from "./api";
import { getOrCreateDeviceId } from "./deviceId";
import { loadHomeGeofenceConfig, saveHomeGeofenceConfig, STORAGE_KEYS } from "./storage";

export const GEOFENCE_TASK_NAME = "tadaimap-home-geofence";
const HOME_REGION_ID = "home";
const BUILDING_REGION_ID = "building";
const LAST_STATUS_KEY = "tadaimap.lastAutoStatus";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

/** 2地点間の距離をメートルで返す(Haversine公式)。 */
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[geofence] エラー", error);
    return;
  }
  if (!data) return;

  const [deviceId, memberId, config] = await Promise.all([
    getOrCreateDeviceId(),
    AsyncStorage.getItem(STORAGE_KEYS.memberId),
    loadHomeGeofenceConfig(),
  ]);
  if (!memberId || !config) return;

  // どちらの範囲のイベントでも、その時点の現在地から3段階のステータスを
  // 都度計算し直す(範囲の内外判定を単独のイベントだけに頼らないため)。
  let lat: number;
  let lng: number;
  try {
    const position = await Location.getCurrentPositionAsync({});
    lat = position.coords.latitude;
    lng = position.coords.longitude;
  } catch (err) {
    return;
  }

  const distance = distanceMeters(lat, lng, config.lat, config.lng);
  let status: PresenceStatus;
  if (distance <= config.homeRadiusM) {
    status = "home";
  } else if (distance <= config.buildingRadiusM) {
    status = "nearby";
  } else {
    status = "away";
  }

  const lastStatus = await AsyncStorage.getItem(LAST_STATUS_KEY);
  if (lastStatus === status) return; // 変化がなければ通信・通知を発生させない

  const client = new ApiClient(API_BASE_URL, deviceId);
  try {
    await client.updateStatus(memberId, status, "auto");
    await AsyncStorage.setItem(LAST_STATUS_KEY, status);
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

export async function startHomeGeofence(
  lat: number,
  lng: number,
  homeRadiusM: number,
  buildingRadiusM: number
): Promise<void> {
  await stopHomeGeofence();
  await AsyncStorage.removeItem(LAST_STATUS_KEY);
  await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, [
    {
      identifier: HOME_REGION_ID,
      latitude: lat,
      longitude: lng,
      radius: homeRadiusM,
      notifyOnEnter: true,
      notifyOnExit: true,
    },
    {
      identifier: BUILDING_REGION_ID,
      latitude: lat,
      longitude: lng,
      radius: buildingRadiusM,
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
