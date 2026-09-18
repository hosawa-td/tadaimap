import * as Notifications from "expo-notifications";
import * as Device from "expo-device";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * 通知の許可を求め、許可された場合はExpo Push Tokenを返す。
 * 拒否された場合やシミュレータ等で取得できない場合はnullを返す
 * （外部インターフェース設計書の方針: 失敗してもアプリの他機能には影響させない）。
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }
  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;
  if (finalStatus !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }
  if (finalStatus !== "granted") {
    return null;
  }
  try {
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[notifications] プッシュ通知トークンの取得に失敗しました", err);
    return null;
  }
}
