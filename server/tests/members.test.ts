import request from "supertest";
import { createApp } from "../src/app";
import { MemoryRepository } from "../src/repository.memory";
import { FakePushSender } from "../src/push";

async function setupGroupWithTwoMembers() {
  const repository = new MemoryRepository();
  const push = new FakePushSender();
  const app = createApp(repository, push);

  const created = await request(app).post("/groups").send({ deviceId: "dev-1", name: "さくら" });
  const groupId = created.body.groupId;
  const memberIdA = created.body.memberId;

  const joined = await request(app)
    .post("/groups/join")
    .send({ deviceId: "dev-2", inviteCode: created.body.inviteCode, name: "お父さん" });
  const memberIdB = joined.body.memberId;

  return { app, push, groupId, memberIdA, memberIdB };
}

describe("GET /groups/:groupId/members", () => {
  it("メンバー一覧を取得でき、本人にはisMe=trueが付く", async () => {
    const { app, groupId, memberIdA } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .get(`/groups/${groupId}/members`)
      .set("x-device-id", "dev-1");

    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(2);
    const me = res.body.members.find((m: any) => m.memberId === memberIdA);
    expect(me.isMe).toBe(true);
    expect(me.nameOrAnonymous).toBe("さくら");
  });

  it("名前非表示のメンバーは匿名で表示される", async () => {
    const { app, groupId, memberIdB } = await setupGroupWithTwoMembers();

    await request(app)
      .patch(`/members/${memberIdB}/profile`)
      .send({ deviceId: "dev-2", showName: false });

    const res = await request(app)
      .get(`/groups/${groupId}/members`)
      .set("x-device-id", "dev-1");

    const other = res.body.members.find((m: any) => m.memberId === memberIdB);
    expect(other.isMe).toBe(false);
    expect(other.nameOrAnonymous).toBe("メンバー");
  });
});

describe("PATCH /members/:memberId/home", () => {
  it("自宅位置・判定範囲を登録できる", async () => {
    const { app, memberIdA } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .patch(`/members/${memberIdA}/home`)
      .send({ deviceId: "dev-1", homeLat: 35.68, homeLng: 139.76, homeRadiusM: 150 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("判定範囲が50〜300mの範囲外だとエラーになる", async () => {
    const { app, memberIdA } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .patch(`/members/${memberIdA}/home`)
      .send({ deviceId: "dev-1", homeLat: 35.68, homeLng: 139.76, homeRadiusM: 20 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("他人のmemberIdを操作しようとするとFORBIDDENになる", async () => {
    const { app, memberIdA } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .patch(`/members/${memberIdA}/home`)
      .send({ deviceId: "dev-2", homeLat: 35.68, homeLng: 139.76, homeRadiusM: 100 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});

describe("PATCH /members/:memberId/status", () => {
  it("ステータス更新後、通知設定ONの他メンバーへ通知が送られる", async () => {
    const { app, push, memberIdA, memberIdB } = await setupGroupWithTwoMembers();

    await request(app)
      .patch(`/members/${memberIdB}/push-token`)
      .send({ deviceId: "dev-2", pushToken: "ExponentPushToken[xxx]" });

    const res = await request(app)
      .patch(`/members/${memberIdA}/status`)
      .send({ deviceId: "dev-1", status: "home" });

    expect(res.status).toBe(200);
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0].to).toBe("ExponentPushToken[xxx]");
    expect(push.sent[0].body).toContain("帰宅しました");
  });

  it("通知設定OFFのメンバーには通知が送られない", async () => {
    const { app, push, memberIdA, memberIdB } = await setupGroupWithTwoMembers();

    await request(app)
      .patch(`/members/${memberIdB}/push-token`)
      .send({ deviceId: "dev-2", pushToken: "ExponentPushToken[xxx]" });
    await request(app).patch(`/members/${memberIdB}/notify`).send({ deviceId: "dev-2", notifyEnabled: false });

    await request(app).patch(`/members/${memberIdA}/status`).send({ deviceId: "dev-1", status: "home" });

    expect(push.sent).toHaveLength(0);
  });

  it("不正なstatus値はVALIDATION_ERRORになる", async () => {
    const { app, memberIdA } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .patch(`/members/${memberIdA}/status`)
      .send({ deviceId: "dev-1", status: "unknown" });

    expect(res.status).toBe(400);
  });
});

describe("PATCH /members/:memberId/profile", () => {
  it("名前を変更できる", async () => {
    const { app, memberIdA } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .patch(`/members/${memberIdA}/profile`)
      .send({ deviceId: "dev-1", name: "パパ" });

    expect(res.status).toBe(200);
  });
});
