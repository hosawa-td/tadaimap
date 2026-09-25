import request from "supertest";
import { createApp } from "../src/app";
import { MemoryRepository } from "../src/repository.memory";
import { FakePushSender } from "../src/push";
import { FakeWebPushSender, VapidWebPushSender, WebPushSender } from "../src/webpush";

const VALID_SUBSCRIPTION = {
  endpoint: "https://example.com/push/abc123",
  keys: { p256dh: "p256dh-key", auth: "auth-key" },
};

async function setupGroupWithTwoMembers(webPush: WebPushSender) {
  const repository = new MemoryRepository();
  const push = new FakePushSender();
  const app = createApp(repository, push, webPush);

  const created = await request(app).post("/groups").send({ deviceId: "dev-1", name: "さくら" });
  const groupId = created.body.groupId;
  const memberIdA = created.body.memberId;

  const joined = await request(app)
    .post("/groups/join")
    .send({ deviceId: "dev-2", inviteCode: created.body.inviteCode, name: "お父さん" });
  const memberIdB = joined.body.memberId;

  return { app, push, groupId, memberIdA, memberIdB };
}

describe("GET /push/vapid-public-key", () => {
  const original = process.env.VAPID_PUBLIC_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = original;
  });

  it("VAPID_PUBLIC_KEYが設定されていればそれを返す", async () => {
    process.env.VAPID_PUBLIC_KEY = "test-public-key";
    const app = createApp(new MemoryRepository(), new FakePushSender());

    const res = await request(app).get("/push/vapid-public-key");

    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBe("test-public-key");
  });

  it("VAPID_PUBLIC_KEYが未設定ならnullを返す", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    const app = createApp(new MemoryRepository(), new FakePushSender());

    const res = await request(app).get("/push/vapid-public-key");

    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBeNull();
  });
});

describe("PATCH /members/:memberId/web-push-subscription", () => {
  it("正しい形式の購読情報を登録できる", async () => {
    const webPush = new FakeWebPushSender();
    const { app, memberIdA } = await setupGroupWithTwoMembers(webPush);

    const res = await request(app)
      .patch(`/members/${memberIdA}/web-push-subscription`)
      .send({ deviceId: "dev-1", subscription: VALID_SUBSCRIPTION });

    expect(res.status).toBe(200);
  });

  it("nullを送ると購読を解除できる", async () => {
    const webPush = new FakeWebPushSender();
    const { app, memberIdA } = await setupGroupWithTwoMembers(webPush);
    await request(app)
      .patch(`/members/${memberIdA}/web-push-subscription`)
      .send({ deviceId: "dev-1", subscription: VALID_SUBSCRIPTION });

    const res = await request(app)
      .patch(`/members/${memberIdA}/web-push-subscription`)
      .send({ deviceId: "dev-1", subscription: null });

    expect(res.status).toBe(200);
  });

  it("形式が不正な購読情報はVALIDATION_ERRORになる", async () => {
    const webPush = new FakeWebPushSender();
    const { app, memberIdA } = await setupGroupWithTwoMembers(webPush);

    const res = await request(app)
      .patch(`/members/${memberIdA}/web-push-subscription`)
      .send({ deviceId: "dev-1", subscription: { endpoint: "https://example.com" } });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("他人のmemberIdを操作しようとするとFORBIDDENになる", async () => {
    const webPush = new FakeWebPushSender();
    const { app, memberIdA } = await setupGroupWithTwoMembers(webPush);

    const res = await request(app)
      .patch(`/members/${memberIdA}/web-push-subscription`)
      .send({ deviceId: "dev-2", subscription: VALID_SUBSCRIPTION });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});

describe("状態変更時のWeb Push通知", () => {
  it("購読済みのメンバーにWeb Push通知が送られる", async () => {
    const webPush = new FakeWebPushSender();
    const { app, memberIdA, memberIdB } = await setupGroupWithTwoMembers(webPush);
    await request(app)
      .patch(`/members/${memberIdB}/web-push-subscription`)
      .send({ deviceId: "dev-2", subscription: VALID_SUBSCRIPTION });

    const res = await request(app)
      .patch(`/members/${memberIdA}/status`)
      .send({ deviceId: "dev-1", status: "home" });

    expect(res.status).toBe(200);
    expect(webPush.sent).toHaveLength(1);
    expect(webPush.sent[0].subscription).toEqual(VALID_SUBSCRIPTION);
    expect(webPush.sent[0].body).toContain("帰宅しました");
  });

  it("購読していないメンバーにはWeb Push通知が送られない", async () => {
    const webPush = new FakeWebPushSender();
    const { app, memberIdA } = await setupGroupWithTwoMembers(webPush);

    await request(app).patch(`/members/${memberIdA}/status`).send({ deviceId: "dev-1", status: "home" });

    expect(webPush.sent).toHaveLength(0);
  });

  it("通知設定OFFのメンバーにはWeb Push通知も送られない", async () => {
    const webPush = new FakeWebPushSender();
    const { app, memberIdA, memberIdB } = await setupGroupWithTwoMembers(webPush);
    await request(app)
      .patch(`/members/${memberIdB}/web-push-subscription`)
      .send({ deviceId: "dev-2", subscription: VALID_SUBSCRIPTION });
    await request(app).patch(`/members/${memberIdB}/notify`).send({ deviceId: "dev-2", notifyEnabled: false });

    await request(app).patch(`/members/${memberIdA}/status`).send({ deviceId: "dev-1", status: "home" });

    expect(webPush.sent).toHaveLength(0);
  });

  it("Web Push送信が失敗しても状態更新自体は成功する(VAPID鍵の設定ミスなどで通知全体が壊れないようにする)", async () => {
    class ThrowingWebPushSender {
      async send(): Promise<void> {
        throw new Error("VAPID鍵が不正です");
      }
    }
    const { app, memberIdA, memberIdB } = await setupGroupWithTwoMembers(new ThrowingWebPushSender());
    await request(app)
      .patch(`/members/${memberIdB}/web-push-subscription`)
      .send({ deviceId: "dev-2", subscription: VALID_SUBSCRIPTION });

    const res = await request(app)
      .patch(`/members/${memberIdA}/status`)
      .send({ deviceId: "dev-1", status: "home" });

    expect(res.status).toBe(200);
  });
});

describe("VapidWebPushSender", () => {
  it("VAPID鍵が不正でも例外を投げずに終わる(誤ってコピペした鍵で他の操作を巻き込んで失敗させないため)", async () => {
    const sender = new VapidWebPushSender("不正な公開鍵", "不正な秘密鍵", "mailto:test@example.com");

    await expect(
      sender.send([{ subscription: VALID_SUBSCRIPTION, title: "タダイマップ", body: "テスト" }])
    ).resolves.toBeUndefined();
  });
});
