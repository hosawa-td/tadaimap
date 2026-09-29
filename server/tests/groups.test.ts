import request from "supertest";
import { createApp } from "../src/app";
import { MemoryRepository } from "../src/repository.memory";
import { FakePushSender } from "../src/push";

function buildApp() {
  const repository = new MemoryRepository();
  const push = new FakePushSender();
  return { app: createApp(repository, push), repository, push };
}

describe("POST /groups", () => {
  it("グループを作成し、招待コードが発行される", async () => {
    const { app } = buildApp();
    const res = await request(app).post("/groups").send({ deviceId: "dev-1", name: "さくら" });

    expect(res.status).toBe(200);
    expect(res.body.groupId).toEqual(expect.any(String));
    expect(res.body.memberId).toEqual(expect.any(String));
    expect(res.body.inviteCode).toMatch(/^[0-9]{6}$/);
    expect(new Date(res.body.inviteCodeExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("名前が未入力の場合はエラーになる", async () => {
    const { app } = buildApp();
    const res = await request(app).post("/groups").send({ deviceId: "dev-1", name: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("名前が13文字以上の場合はエラーになる", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post("/groups")
      .send({ deviceId: "dev-1", name: "あ".repeat(13) });

    expect(res.status).toBe(400);
  });
});

describe("POST /groups/join", () => {
  it("正しい招待コードで参加できる", async () => {
    const { app } = buildApp();
    const created = await request(app).post("/groups").send({ deviceId: "dev-1", name: "さくら" });
    const inviteCode = created.body.inviteCode;

    const res = await request(app)
      .post("/groups/join")
      .send({ deviceId: "dev-2", inviteCode, name: "お母さん" });

    expect(res.status).toBe(200);
    expect(res.body.groupId).toBe(created.body.groupId);
    expect(res.body.memberId).toEqual(expect.any(String));
  });

  it("存在しない招待コードはCODE_NOT_FOUNDになる", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post("/groups/join")
      .send({ deviceId: "dev-2", inviteCode: "999999", name: "お母さん" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CODE_NOT_FOUND");
  });

  it("期限切れの招待コードはCODE_EXPIREDになる", async () => {
    const { app, repository } = buildApp();
    const created = await request(app).post("/groups").send({ deviceId: "dev-1", name: "さくら" });
    const group = await repository.getGroup(created.body.groupId);
    // 有効期限を過去に書き換えて期限切れを再現する
    (group as any).inviteCodeExpiresAt = new Date(Date.now() - 1000).toISOString();

    const res = await request(app)
      .post("/groups/join")
      .send({ deviceId: "dev-2", inviteCode: created.body.inviteCode, name: "お母さん" });

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("CODE_EXPIRED");
  });

  it("1台の端末が複数のグループに参加できる", async () => {
    const { app } = buildApp();
    const groupA = await request(app).post("/groups").send({ deviceId: "dev-1", name: "さくら" });
    const groupB = await request(app).post("/groups").send({ deviceId: "dev-2", name: "たかし" });

    const res = await request(app)
      .post("/groups/join")
      .send({ deviceId: "dev-1", inviteCode: groupB.body.inviteCode, name: "さくら" });

    expect(res.status).toBe(200);
    expect(res.body.groupId).toBe(groupB.body.groupId);
    expect(groupA.status).toBe(200);
  });

  it("同じグループに同じ端末から重複して参加しようとするとALREADY_JOINEDになる", async () => {
    const { app } = buildApp();
    const groupA = await request(app).post("/groups").send({ deviceId: "dev-1", name: "さくら" });
    await request(app)
      .post("/groups/join")
      .send({ deviceId: "dev-2", inviteCode: groupA.body.inviteCode, name: "お母さん" });

    const res = await request(app)
      .post("/groups/join")
      .send({ deviceId: "dev-2", inviteCode: groupA.body.inviteCode, name: "お母さん" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_JOINED");
  });

  it("招待コードの桁数が不正な場合はVALIDATION_ERRORになる", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post("/groups/join")
      .send({ deviceId: "dev-2", inviteCode: "123", name: "お母さん" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("端末の再インストール等で別のdevice_idになっても、同じ名前で参加し直すと元のメンバーとして復帰する", async () => {
    const { app, repository } = buildApp();
    const groupA = await request(app).post("/groups").send({ deviceId: "dev-1", name: "さくら" });
    const joined = await request(app)
      .post("/groups/join")
      .send({ deviceId: "dev-2", inviteCode: groupA.body.inviteCode, name: "たろう" });
    const originalMemberId = joined.body.memberId;
    await request(app)
      .patch(`/members/${originalMemberId}/status`)
      .send({ deviceId: "dev-2", status: "home" });

    // dev-2の端末が再インストールされ、新しいdevice_id(dev-2-reinstalled)になったと仮定する
    const rejoinRes = await request(app)
      .post("/groups/join")
      .send({ deviceId: "dev-2-reinstalled", inviteCode: groupA.body.inviteCode, name: "たろう" });

    expect(rejoinRes.status).toBe(200);
    expect(rejoinRes.body.memberId).toBe(originalMemberId);
    const member = await repository.getMemberById(originalMemberId);
    expect(member?.deviceId).toBe("dev-2-reinstalled");
    expect(member?.status).toBe("home"); // 以前の状態も引き継がれている

    const list = await request(app).get(`/groups/${groupA.body.groupId}/members`).set("x-device-id", "dev-1");
    expect(list.body.members).toHaveLength(2); // 重複登録されていない
  });

  it("参加のレスポンスに自宅位置を含む(復帰時は既存の値、新規時はnull)", async () => {
    const { app } = buildApp();
    const groupA = await request(app).post("/groups").send({ deviceId: "dev-1", name: "さくら" });
    const joined = await request(app)
      .post("/groups/join")
      .send({ deviceId: "dev-2", inviteCode: groupA.body.inviteCode, name: "たろう" });
    expect(joined.body.home).toBeNull();

    await request(app)
      .patch(`/members/${joined.body.memberId}/home`)
      .send({ deviceId: "dev-2", homeLat: 35.68, homeLng: 139.76, homeRadiusM: 100, buildingRadiusM: 300 });

    const rejoinRes = await request(app)
      .post("/groups/join")
      .send({ deviceId: "dev-2-reinstalled", inviteCode: groupA.body.inviteCode, name: "たろう" });

    expect(rejoinRes.body.home).toEqual({ lat: 35.68, lng: 139.76, homeRadiusM: 100, buildingRadiusM: 300 });
  });

  it("別の名前で参加した場合は、通常どおり新しいメンバーとして登録される", async () => {
    const { app } = buildApp();
    const groupA = await request(app).post("/groups").send({ deviceId: "dev-1", name: "さくら" });
    await request(app)
      .post("/groups/join")
      .send({ deviceId: "dev-2", inviteCode: groupA.body.inviteCode, name: "たろう" });

    const res = await request(app)
      .post("/groups/join")
      .send({ deviceId: "dev-3", inviteCode: groupA.body.inviteCode, name: "はなこ" });

    expect(res.status).toBe(200);
    const list = await request(app).get(`/groups/${groupA.body.groupId}/members`).set("x-device-id", "dev-1");
    expect(list.body.members).toHaveLength(3);
  });
});

describe("GET /memberships", () => {
  it("この端末が参加しているすべてのグループを、招待コード付きでDBから返す", async () => {
    const { app } = buildApp();
    const groupA = await request(app).post("/groups").send({ deviceId: "dev-1", name: "さくら" });
    const groupB = await request(app).post("/groups").send({ deviceId: "dev-2", name: "たかし" });
    await request(app)
      .post("/groups/join")
      .send({ deviceId: "dev-1", inviteCode: groupB.body.inviteCode, name: "さくら" });

    const res = await request(app).get("/memberships").set("x-device-id", "dev-1");

    expect(res.status).toBe(200);
    expect(res.body.memberships).toHaveLength(2);
    expect(res.body.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ groupId: groupA.body.groupId, inviteCode: groupA.body.inviteCode }),
        expect.objectContaining({ groupId: groupB.body.groupId, inviteCode: groupB.body.inviteCode }),
      ])
    );
  });

  it("参加しているグループが無い端末には空配列を返す", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/memberships").set("x-device-id", "dev-999");

    expect(res.status).toBe(200);
    expect(res.body.memberships).toEqual([]);
  });
});
