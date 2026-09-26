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

  it("自宅位置は本人の行にのみ含まれる(他メンバーには見せない)", async () => {
    const { app, groupId, memberIdA } = await setupGroupWithTwoMembers();

    await request(app)
      .patch(`/members/${memberIdA}/home`)
      .send({ deviceId: "dev-1", homeLat: 35.68, homeLng: 139.76, homeRadiusM: 100, buildingRadiusM: 300 });

    const asOwner = await request(app).get(`/groups/${groupId}/members`).set("x-device-id", "dev-1");
    const me = asOwner.body.members.find((m: any) => m.memberId === memberIdA);
    expect(me.home).toEqual({ lat: 35.68, lng: 139.76, homeRadiusM: 100, buildingRadiusM: 300 });

    const asOther = await request(app).get(`/groups/${groupId}/members`).set("x-device-id", "dev-2");
    const notMe = asOther.body.members.find((m: any) => m.memberId === memberIdA);
    expect(notMe.home).toBeNull();
  });

  it("自宅位置が未登録の場合はhomeがnullになる", async () => {
    const { app, groupId, memberIdA } = await setupGroupWithTwoMembers();

    const res = await request(app).get(`/groups/${groupId}/members`).set("x-device-id", "dev-1");
    const me = res.body.members.find((m: any) => m.memberId === memberIdA);
    expect(me.home).toBeNull();
  });

  it("グループを作成した人だけがisAdmin=trueになる", async () => {
    const { app, groupId, memberIdA, memberIdB } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .get(`/groups/${groupId}/members`)
      .set("x-device-id", "dev-1");

    const admin = res.body.members.find((m: any) => m.memberId === memberIdA);
    const other = res.body.members.find((m: any) => m.memberId === memberIdB);
    expect(admin.isAdmin).toBe(true);
    expect(other.isAdmin).toBe(false);
  });
});

describe("PATCH /members/:memberId/home", () => {
  it("自宅位置・判定範囲・施設内範囲を登録できる", async () => {
    const { app, memberIdA } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .patch(`/members/${memberIdA}/home`)
      .send({ deviceId: "dev-1", homeLat: 35.68, homeLng: 139.76, homeRadiusM: 150, buildingRadiusM: 300 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("判定範囲が50〜300mの範囲外だとエラーになる", async () => {
    const { app, memberIdA } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .patch(`/members/${memberIdA}/home`)
      .send({ deviceId: "dev-1", homeLat: 35.68, homeLng: 139.76, homeRadiusM: 20, buildingRadiusM: 300 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("施設内範囲が自宅の範囲より小さいとエラーになる", async () => {
    const { app, memberIdA } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .patch(`/members/${memberIdA}/home`)
      .send({ deviceId: "dev-1", homeLat: 35.68, homeLng: 139.76, homeRadiusM: 200, buildingRadiusM: 150 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("他人のmemberIdを操作しようとするとFORBIDDENになる", async () => {
    const { app, memberIdA } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .patch(`/members/${memberIdA}/home`)
      .send({ deviceId: "dev-2", homeLat: 35.68, homeLng: 139.76, homeRadiusM: 100, buildingRadiusM: 300 });

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

  it('statusに"nearby"を指定でき、グループ共通の呼び方(nearbyLabel)を使って通知される', async () => {
    const { app, push, groupId, memberIdA, memberIdB } = await setupGroupWithTwoMembers();

    await request(app)
      .patch(`/members/${memberIdB}/push-token`)
      .send({ deviceId: "dev-2", pushToken: "ExponentPushToken[xxx]" });
    await request(app)
      .patch(`/groups/${groupId}/nearby-label`)
      .send({ deviceId: "dev-1", nearbyLabel: "ロビー" });

    const res = await request(app)
      .patch(`/members/${memberIdA}/status`)
      .send({ deviceId: "dev-1", status: "nearby" });

    expect(res.status).toBe(200);
    expect(push.sent[0].body).toContain("ロビーに移動しました");
  });

  it("不正なstatus値はVALIDATION_ERRORになる", async () => {
    const { app, memberIdA } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .patch(`/members/${memberIdA}/status`)
      .send({ deviceId: "dev-1", status: "unknown" });

    expect(res.status).toBe(400);
  });

  it("管理者は他のメンバーの状態を代わりに変更できる", async () => {
    const { app, groupId, memberIdA, memberIdB } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .patch(`/members/${memberIdB}/status`)
      .send({ deviceId: "dev-1", status: "home" });

    expect(res.status).toBe(200);

    const list = await request(app)
      .get(`/groups/${groupId}/members`)
      .set("x-device-id", "dev-1");
    const memberB = list.body.members.find((m: any) => m.memberId === memberIdB);
    expect(memberB.status).toBe("home");
  });

  it("管理者以外は他のメンバーの状態を変更できずFORBIDDENになる", async () => {
    const { app, memberIdA, memberIdB } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .patch(`/members/${memberIdA}/status`)
      .send({ deviceId: "dev-2", status: "home" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
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

describe("PATCH /groups/:groupId/nearby-label", () => {
  it("管理者は呼び方を変更でき、全メンバーに反映される", async () => {
    const { app, groupId, memberIdA, memberIdB } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .patch(`/groups/${groupId}/nearby-label`)
      .send({ deviceId: "dev-1", nearbyLabel: "ロビー" });

    expect(res.status).toBe(200);
    expect(res.body.nearbyLabel).toBe("ロビー");

    const list = await request(app)
      .get(`/groups/${groupId}/members`)
      .set("x-device-id", "dev-2");
    expect(list.body.nearbyLabel).toBe("ロビー");
    const memberA = list.body.members.find((m: any) => m.memberId === memberIdA);
    const memberB = list.body.members.find((m: any) => m.memberId === memberIdB);
    expect(memberA.nearbyLabel).toBe("ロビー");
    expect(memberB.nearbyLabel).toBe("ロビー");
  });

  it("管理者以外は呼び方を変更できずFORBIDDENになる", async () => {
    const { app, groupId } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .patch(`/groups/${groupId}/nearby-label`)
      .send({ deviceId: "dev-2", nearbyLabel: "ロビー" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("13文字以上の呼び方はVALIDATION_ERRORになる", async () => {
    const { app, groupId } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .patch(`/groups/${groupId}/nearby-label`)
      .send({ deviceId: "dev-1", nearbyLabel: "あ".repeat(13) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("PATCH /members/:memberId/home-detail", () => {
  it("在宅中の詳細な状態を設定でき、家族一覧にも反映される", async () => {
    const { app, groupId, memberIdA } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .patch(`/members/${memberIdA}/home-detail`)
      .send({ deviceId: "dev-1", homeDetail: "トイレ中" });

    expect(res.status).toBe(200);

    const list = await request(app)
      .get(`/groups/${groupId}/members`)
      .set("x-device-id", "dev-1");
    const memberA = list.body.members.find((m: any) => m.memberId === memberIdA);
    expect(memberA.homeDetail).toBe("トイレ中");
  });

  it("空文字を送ると詳細な状態をクリアできる", async () => {
    const { app, memberIdA } = await setupGroupWithTwoMembers();
    await request(app)
      .patch(`/members/${memberIdA}/home-detail`)
      .send({ deviceId: "dev-1", homeDetail: "トイレ中" });

    const res = await request(app)
      .patch(`/members/${memberIdA}/home-detail`)
      .send({ deviceId: "dev-1", homeDetail: "" });

    expect(res.status).toBe(200);
    expect(res.body.homeDetail).toBe("");
  });

  it("13文字以上はVALIDATION_ERRORになる", async () => {
    const { app, memberIdA } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .patch(`/members/${memberIdA}/home-detail`)
      .send({ deviceId: "dev-1", homeDetail: "あ".repeat(13) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("他人のmemberIdを操作しようとするとFORBIDDENになる", async () => {
    const { app, memberIdA } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .patch(`/members/${memberIdA}/home-detail`)
      .send({ deviceId: "dev-2", homeDetail: "トイレ中" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("状態(status)を変更すると、詳細な状態は自動的にクリアされる", async () => {
    const { app, groupId, memberIdA } = await setupGroupWithTwoMembers();
    await request(app)
      .patch(`/members/${memberIdA}/home-detail`)
      .send({ deviceId: "dev-1", homeDetail: "トイレ中" });

    await request(app).patch(`/members/${memberIdA}/status`).send({ deviceId: "dev-1", status: "home" });

    const list = await request(app)
      .get(`/groups/${groupId}/members`)
      .set("x-device-id", "dev-1");
    const memberA = list.body.members.find((m: any) => m.memberId === memberIdA);
    expect(memberA.homeDetail).toBe("");
  });
});
