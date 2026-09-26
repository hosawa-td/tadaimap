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

  return { app, repository, groupId, memberIdA, memberIdB, oldInviteCode: created.body.inviteCode };
}

describe("POST /groups/:groupId/invite-code/refresh", () => {
  it("グループのメンバーが招待コードを再発行できる", async () => {
    const { app, groupId, oldInviteCode } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .post(`/groups/${groupId}/invite-code/refresh`)
      .send({ deviceId: "dev-1" });

    expect(res.status).toBe(200);
    expect(res.body.inviteCode).toMatch(/^[0-9]{6}$/);
    expect(res.body.inviteCode).not.toBe(oldInviteCode);
  });

  it("そのグループに所属していない端末はFORBIDDENになる", async () => {
    const { app, groupId } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .post(`/groups/${groupId}/invite-code/refresh`)
      .send({ deviceId: "dev-999" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});

describe("DELETE /members/:memberId", () => {
  it("グループから退出できる", async () => {
    const { app, groupId, memberIdB } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .delete(`/members/${memberIdB}`)
      .set("x-device-id", "dev-2");

    expect(res.status).toBe(200);

    const list = await request(app).get(`/groups/${groupId}/members`).set("x-device-id", "dev-1");
    expect(list.body.members).toHaveLength(1);
  });

  it("最後の1人が退出するとグループごと削除される", async () => {
    const { app, repository, groupId, memberIdA, memberIdB } = await setupGroupWithTwoMembers();

    await request(app).delete(`/members/${memberIdA}`).set("x-device-id", "dev-1");
    await request(app).delete(`/members/${memberIdB}`).set("x-device-id", "dev-2");

    const group = await repository.getGroup(groupId);
    expect(group).toBeNull();
  });

  it("他人のmemberIdを退出させようとするとFORBIDDENになる", async () => {
    const { app, memberIdA } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .delete(`/members/${memberIdA}`)
      .set("x-device-id", "dev-2");

    expect(res.status).toBe(403);
  });

  it("管理者は他のメンバーを削除できる", async () => {
    const { app, groupId, memberIdB } = await setupGroupWithTwoMembers();

    const res = await request(app)
      .delete(`/members/${memberIdB}`)
      .set("x-device-id", "dev-1");

    expect(res.status).toBe(200);

    const list = await request(app).get(`/groups/${groupId}/members`).set("x-device-id", "dev-1");
    expect(list.body.members).toHaveLength(1);
  });
});

describe("DELETE /groups/:groupId", () => {
  it("管理者はグループを削除できる(所属メンバー全員も削除される)", async () => {
    const { app, repository, groupId, memberIdA, memberIdB } = await setupGroupWithTwoMembers();

    const res = await request(app).delete(`/groups/${groupId}`).set("x-device-id", "dev-1");

    expect(res.status).toBe(200);
    expect(await repository.getGroup(groupId)).toBeNull();
    expect(await repository.getMemberById(memberIdA)).toBeNull();
    expect(await repository.getMemberById(memberIdB)).toBeNull();
  });

  it("管理者以外はグループを削除できない", async () => {
    const { app, groupId } = await setupGroupWithTwoMembers();

    const res = await request(app).delete(`/groups/${groupId}`).set("x-device-id", "dev-2");

    expect(res.status).toBe(403);
  });
});
