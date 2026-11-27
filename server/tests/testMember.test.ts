import request from "supertest";
import { createApp } from "../src/app";
import { MemoryRepository } from "../src/repository.memory";
import { FakePushSender } from "../src/push";
import { isTestMemberName } from "../src/testMember";

describe("isTestMemberName", () => {
  it("Test(大文字小文字を問わない)・Test_・テスト_で始まる名前はテスト用", () => {
    for (const n of ["Test", "test", "TEST", " Test ", "Test_A", "test_b", "テスト_管理者", "テスト_家族A"]) {
      expect(isTestMemberName(n)).toBe(true);
    }
  });
  it("普通の名前はテスト用ではない", () => {
    for (const n of ["パパ", "ママ", "Testa", "テスト", "Tester", "かい"]) {
      expect(isTestMemberName(n)).toBe(false);
    }
  });
});

async function setup() {
  const repository = new MemoryRepository();
  const push = new FakePushSender();
  const app = createApp(repository, push);
  const created = await request(app).post("/groups").send({ deviceId: "dev-papa", name: "パパ" });
  const groupId = created.body.groupId as string;
  const papaId = created.body.memberId as string;
  const code = created.body.inviteCode as string;
  const kai = await request(app).post("/groups/join").send({ deviceId: "dev-kai", inviteCode: code, name: "かい" });
  const test = await request(app).post("/groups/join").send({ deviceId: "dev-test", inviteCode: code, name: "Test" });
  await repository.updatePushToken(papaId, "dev-papa", "ExponentPushToken[papa]");
  await repository.updatePushToken(kai.body.memberId, "dev-kai", "ExponentPushToken[kai]");
  await repository.updatePushToken(test.body.memberId, "dev-test", "ExponentPushToken[test]");
  return { app, push, groupId, kaiId: kai.body.memberId as string, testId: test.body.memberId as string, papaId };
}

describe("テスト用メンバーの非表示(管理者とテスト用メンバー本人には見える)", () => {
  it("管理者以外の一覧には、テスト用メンバーが出ない", async () => {
    const { app, groupId } = await setup();
    const res = await request(app).get(`/groups/${groupId}/members`).set("x-device-id", "dev-kai");
    expect(res.status).toBe(200);
    const names = res.body.members.map((m: { nameOrAnonymous: string }) => m.nameOrAnonymous);
    expect(names).toEqual(expect.arrayContaining(["パパ", "かい"]));
    expect(names).not.toContain("Test");
    expect(res.body.members).toHaveLength(2);
  });

  it("管理者には、テスト用メンバーも見える", async () => {
    const { app, groupId } = await setup();
    const res = await request(app).get(`/groups/${groupId}/members`).set("x-device-id", "dev-papa");
    expect(res.status).toBe(200);
    const names = res.body.members.map((m: { nameOrAnonymous: string }) => m.nameOrAnonymous);
    expect(names).toEqual(expect.arrayContaining(["パパ", "かい", "Test"]));
    expect(res.body.members).toHaveLength(3);
  });

  it("テスト用メンバー本人には、全員が見える", async () => {
    const { app, groupId } = await setup();
    const res = await request(app).get(`/groups/${groupId}/members`).set("x-device-id", "dev-test");
    expect(res.body.members).toHaveLength(3);
  });

  it("テスト用メンバーの状態変更は、誰にも通知されない", async () => {
    const { app, push, testId } = await setup();
    const res = await request(app)
      .patch(`/members/${testId}/status`)
      .set("x-device-id", "dev-test")
      .send({ status: "away", source: "manual" });
    expect(res.status).toBe(200);
    expect(push.sent).toHaveLength(0);
  });

  it("普通のメンバーの状態変更は、これまでどおり通知される(テスト用メンバーにも届く)", async () => {
    const { app, push, kaiId } = await setup();
    await request(app)
      .patch(`/members/${kaiId}/status`)
      .set("x-device-id", "dev-kai")
      .send({ status: "away", source: "manual" });
    expect(push.sent.map((m) => m.to).sort()).toEqual(["ExponentPushToken[papa]", "ExponentPushToken[test]"]);
  });
});
