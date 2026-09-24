import Constants, { ExecutionEnvironment } from "expo-constants";

function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/**
 * プッシュ通知を受け取った瞬間(アプリがフォアグラウンド/バックグラウンドどちらの場合も)、
 * および通知をタップしてアプリを開いた瞬間に onNotification を呼び出す。
 * Expo Go上では何もしない(unsubscribeは空関数を返す)。
 */
export function subscribeToNotifications(onNotification: () => void): () => void {
  if (isExpoGo()) {
    return () => {};
  }

  const Notifications = require("expo-notifications");
  const receivedSub = Notifications.addNotificationReceivedListener(onNotification);
  const responseSub = Notifications.addNotificationResponseReceivedListener(onNotification);

  return () => {
    receivedSub.remove();
    responseSub.remove();
  };
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
