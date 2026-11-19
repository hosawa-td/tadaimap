import request from "supertest";
import { createApp } from "../src/app";
import { MemoryRepository } from "../src/repository.memory";
import { FakePushSender } from "../src/push";

async function setup() {
  const repository = new MemoryRepository();
  const app = createApp(repository, new FakePushSender());
  const created = await request(app).post("/groups").send({ deviceId: "dev-1", name: "さくら" });
  return { app, repository, memberId: created.body.memberId as string };
}

describe("接続状況ログ", () => {
  afterEach(() => {
    delete process.env.DIAG_TOKEN;
  });

  it("本人の端末はログをアップロードできる", async () => {
    const { app, repository, memberId } = await setup();
    const res = await request(app)
      .post(`/members/${memberId}/logs`)
      .set("x-device-id", "dev-1")
      .send({ entries: [{ at: "2026-11-19T02:00:00.000Z", event: "offline", detail: "x" }, { bad: true }] });
    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(1);
    const logs = await repository.getLogs({ memberId, limit: 10 });
    expect(logs[0]).toMatchObject({ event: "offline", origin: "client", at: "2026-11-19T02:00:00.000Z" });
  });

  it("他人の端末からは送信できない", async () => {
    const { app, memberId } = await setup();
    const res = await request(app)
      .post(`/members/${memberId}/logs`)
      .set("x-device-id", "dev-other")
      .send({ entries: [{ event: "offline" }] });
    expect(res.status).toBe(403);
  });

  it("状態変更はサーバー側でも自動的に記録される", async () => {
    const { app, repository, memberId } = await setup();
    await request(app)
      .patch(`/members/${memberId}/status`)
      .set("x-device-id", "dev-1")
      .send({ status: "home", source: "shortcut" });
    await new Promise((r) => setTimeout(r, 10));
    const logs = await repository.getLogs({ memberId, limit: 10 });
    expect(logs[0].event).toBe("status_change");
    expect(JSON.parse(logs[0].detail)).toMatchObject({ from: "away", to: "home", source: "shortcut" });
  });

  it("閲覧は合言葉(DIAG_TOKEN)が一致したときだけできる", async () => {
    const { app, memberId } = await setup();
    await request(app).post(`/members/${memberId}/logs`).set("x-device-id", "dev-1").send({ entries: [{ event: "online" }] });
    expect((await request(app).get("/diag/logs")).status).toBe(403);
    process.env.DIAG_TOKEN = "secret-token";
    expect((await request(app).get("/diag/logs?token=wrong")).status).toBe(403);
    const ok = await request(app).get("/diag/logs?token=secret-token");
    expect(ok.status).toBe(200);
    expect(ok.body.count).toBe(1);
  });
});
