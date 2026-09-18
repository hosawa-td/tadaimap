export interface PushMessage {
  to: string;
  title: string;
  body: string;
}

export interface PushSender {
  send(messages: PushMessage[]): Promise<void>;
}

/**
 * Expo Push Notification Service を使った実装。
 * 送信失敗はログに記録するのみとし、呼び出し元の処理を失敗させない
 * （外部インターフェース設計書 1. の方針）。
 */
export class ExpoPushSender implements PushSender {
  async send(messages: PushMessage[]): Promise<void> {
    if (messages.length === 0) return;
    try {
      // 実運用では expo-server-sdk の Expo クラスを使って送信する。
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Expo } = require("expo-server-sdk");
      const expo = new Expo();
      const validMessages = messages.filter((m) => Expo.isExpoPushToken(m.to));
      const chunks = expo.chunkPushNotifications(validMessages);
      for (const chunk of chunks) {
        await expo.sendPushNotificationsAsync(chunk);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[push] 通知の送信に失敗しました", err);
    }
  }
}

/** テスト用の記録だけ行う実装。 */
export class FakePushSender implements PushSender {
  public sent: PushMessage[] = [];

  async send(messages: PushMessage[]): Promise<void> {
    this.sent.push(...messages);
  }
}
