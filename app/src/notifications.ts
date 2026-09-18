import Constants, { ExecutionEnvironment } from "expo-constants";

function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/**
 * 通知の許可を求め、許可された場合はExpo Push Tokenを返す。
 * 拒否された場合やシミュレータ等で取得できない場合はnullを返す
 * （外部インターフェース設計書の方針: 失敗してもアプリの他機能には影響させない）。
 *
 * Expo Go(SDK 53以降)ではリモートプッシュ通知が使えない制限があるため、
 * Expo Go上ではexpo-notificationsに一切触れず、素通りする
 * （開発ビルド・本番ビルドでは通常どおり動作する）。
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (isExpoGo()) {
    // eslint-disable-next-line no-console
    console.log(
      "[notifications] Expo Goではプッシュ通知を試せません。開発ビルドまたは本番ビルドでご確認ください。"
    );
    return null;
  }

  const Device = require("expo-device");
  if (!Device.isDevice) {
    return null;
  }

  const Notifications = require("expo-notifications");
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

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
