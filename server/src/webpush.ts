export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface WebPushMessage {
  subscription: WebPushSubscription;
  title: string;
  body: string;
}

export interface WebPushSender {
  send(messages: WebPushMessage[]): Promise<void>;
}

/**
 * ブラウザ標準のWeb Push(VAPID)を使った実装。iPhoneのWeb版など、
 * ネイティブアプリを入れられない端末向けの通知に使う。
 * 送信失敗はログに記録するのみとし、呼び出し元の処理を失敗させない
 * (Expo向けのExpoPushSenderと同じ方針)。
 */
export class VapidWebPushSender implements WebPushSender {
  constructor(private publicKey: string, private privateKey: string, private subject: string) {}

  async send(messages: WebPushMessage[]): Promise<void> {
    if (messages.length === 0) return;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const webpush = require("web-push");
    webpush.setVapidDetails(this.subject, this.publicKey, this.privateKey);
    await Promise.all(
      messages.map(async (m) => {
        try {
          await webpush.sendNotification(m.subscription, JSON.stringify({ title: m.title, body: m.body }));
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[webpush] 通知の送信に失敗しました", err);
        }
      })
    );
  }
}

/** テスト用の記録だけ行う実装。 */
export class FakeWebPushSender implements WebPushSender {
  public sent: WebPushMessage[] = [];

  async send(messages: WebPushMessage[]): Promise<void> {
    this.sent.push(...messages);
  }
}

/** VAPID鍵が未設定の環境(ローカル開発など)向けに、何もしない実装。 */
export class NoopWebPushSender implements WebPushSender {
  async send(): Promise<void> {
    // 何もしない
  }
}
