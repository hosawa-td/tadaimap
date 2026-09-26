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
});
