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

  describe("自動更新のガード", () => {
    const send = (app: ReturnType<typeof createApp>, memberId: string, status: string, extra: object = {}) =>
      request(app)
        .patch(`/members/${memberId}/status`)
        .set("x-device-id", "dev-1")
        .send({ status, source: "auto", ...extra });
    const wait = () => new Promise((r) => setTimeout(r, 10));

    it("すでに同じ状態の自動更新は、変更として扱わず無視ログだけ残す", async () => {
      const { app, repository, memberId } = await setup(); // 初期状態はaway
      const res = await send(app, memberId, "away");
      expect(res.body).toMatchObject({ ok: true, ignored: "same_status" });
      await wait();
      const logs = await repository.getLogs({ memberId, limit: 10 });
      expect(logs.map((l) => l.event)).toEqual(["status_ignored"]);
      expect(JSON.parse(logs[0].detail)).toMatchObject({ reason: "same_status" });
    });

    it("同じ自動更新がほぼ同時に二重で届いても、1回だけ反映する", async () => {
      const { app, repository, memberId } = await setup();
      expect((await send(app, memberId, "nearby")).body.ignored).toBeUndefined();
      expect((await send(app, memberId, "nearby")).body.ignored).toBe("duplicate");
      await wait();
      const logs = await repository.getLogs({ memberId, limit: 10 });
      expect(logs.filter((l) => l.event === "status_change")).toHaveLength(1);
    });

    it("帰宅の直後に届いた自動の「外出」は無視し、帰宅状態を保つ", async () => {
      const { app, repository, memberId } = await setup();
      await send(app, memberId, "home");
      const res = await send(app, memberId, "away");
      expect(res.body.ignored).toBe("flip_flop");
      expect((await repository.getMemberById(memberId))?.status).toBe("home");
    });

    it("手動の「外出」は直後でも必ず反映する", async () => {
      const { app, repository, memberId } = await setup();
      await send(app, memberId, "home");
      const res = await request(app)
        .patch(`/members/${memberId}/status`)
        .set("x-device-id", "dev-1")
        .send({ status: "away", source: "manual" });
      expect(res.body.ignored).toBeUndefined();
      expect((await repository.getMemberById(memberId))?.status).toBe("away");
    });

    it("trigger(どの自動化が送ったか)がログに残る", async () => {
      const { app, repository, memberId } = await setup();
      await send(app, memberId, "home", { trigger: "wifi_connect" });
      await wait();
      const logs = await repository.getLogs({ memberId, limit: 10 });
      expect(JSON.parse(logs[0].detail)).toMatchObject({ to: "home", trigger: "wifi_connect" });
    });
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
