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

  describe("ログのローテート保存(GET /cron/rotate-logs)", () => {
    afterEach(() => {
      delete process.env.CRON_SECRET;
    });

    it("認証できなければ実行できない(Cronの合言葉・DIAG_TOKENのどちらも未設定なら無効)", async () => {
      const { app } = await setup();
      expect((await request(app).get("/cron/rotate-logs")).status).toBe(403);
      process.env.CRON_SECRET = "cron-secret";
      expect((await request(app).get("/cron/rotate-logs").set("authorization", "Bearer wrong")).status).toBe(403);
      expect((await request(app).get("/cron/rotate-logs?token=cron-secret")).status).toBe(403); // CRON_SECRETはBearerだけ
    });

    it("Vercel Cronの合言葉で実行すると、Logsのログが保存シートへ移り、Logsは空になる", async () => {
      const { app, repository, memberId } = await setup();
      process.env.CRON_SECRET = "cron-secret";
      await request(app).post(`/members/${memberId}/logs`).set("x-device-id", "dev-1").send({ entries: [{ event: "online" }, { event: "offline" }] });
      const res = await request(app).get("/cron/rotate-logs").set("authorization", "Bearer cron-secret");
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, dryRun: false, saved: 2, clearedRows: 2, deletedTabs: [] });
      expect(res.body.tab).toMatch(/^log_\d{8}$/);
      expect(await repository.getLogs({ limit: 10 })).toEqual([]);
      expect(repository.logArchives.get(res.body.tab)).toHaveLength(2);
    });

    it("dryRun=1 では、件数の見込みだけを返して何も変えない(手動実行はDIAG_TOKENで可能)", async () => {
      const { app, repository, memberId } = await setup();
      process.env.DIAG_TOKEN = "secret-token";
      await request(app).post(`/members/${memberId}/logs`).set("x-device-id", "dev-1").send({ entries: [{ event: "online" }] });
      const res = await request(app).get("/cron/rotate-logs?token=secret-token&dryRun=1");
      expect(res.body).toMatchObject({ dryRun: true, saved: 1, clearedRows: 0 });
      expect((await repository.getLogs({ limit: 10 })).length).toBe(1);
      expect(repository.logArchives.size).toBe(0);
    });

    it("実行日から7日より前の保存シートだけを削除し、直近7日分を残す(11/22の実行で、11/15を削除)", async () => {
      const repository = new MemoryRepository();
      for (const d of ["20261115", "20261116", "20261121"]) repository.logArchives.set(`log_${d}`, []);
      const now = new Date("2026-11-21T15:00:00.000Z"); // 日本時間 2026/11/22 0:00
      const result = await repository.rotateLogs(now, false);
      expect(result).toMatchObject({ tab: "log_20261122", deletedTabs: ["log_20261115"] });
      expect([...repository.logArchives.keys()].sort()).toEqual(["log_20261116", "log_20261121", "log_20261122"]);
    });
  });

  describe("メンバーのログ閲覧(GET /members/:memberId/logs)", () => {
    async function setupGroup() {
      const repository = new MemoryRepository();
      const app = createApp(repository, new FakePushSender());
      const admin = await request(app).post("/groups").send({ deviceId: "dev-admin", name: "パパ" });
      const joined = await request(app)
        .post("/groups/join")
        .send({ deviceId: "dev-kid", inviteCode: admin.body.inviteCode, name: "かい" });
      const other = await request(app).post("/groups").send({ deviceId: "dev-other", name: "他人" });
      return { app, repository, adminId: admin.body.memberId as string, kidId: joined.body.memberId as string, otherAdmin: other.body.memberId as string };
    }
    const get = (app: ReturnType<typeof createApp>, memberId: string, deviceId?: string) => {
      const r = request(app).get(`/members/${memberId}/logs`);
      return deviceId ? r.set("x-device-id", deviceId) : r;
    };

    it("管理者は、メンバーの現在のログと保存済み(ローテート後)のログを新しい順に見られる。端末IDは返さない", async () => {
      const { app, repository, kidId } = await setupGroup();
      const entry = (at: string, event: string, memberId = kidId) => ({ at, receivedAt: at, memberId, deviceId: "dev-kid", origin: "server" as const, event, detail: "{}" });
      repository.logArchives.set("log_20261120", [entry("2026-11-19T01:00:00.000Z", "old")]);
      await repository.addLogs([entry("2026-11-21T01:00:00.000Z", "new"), entry("2026-11-21T02:00:00.000Z", "other-member", "someone-else")]);
      const res = await get(app, kidId, "dev-admin");
      expect(res.status).toBe(200);
      expect(res.body.logs.map((l: { event: string }) => l.event)).toEqual(["new", "old"]);
      expect(JSON.stringify(res.body)).not.toContain("dev-kid");
      expect(res.body.logs[0]).toEqual({ at: "2026-11-21T01:00:00.000Z", origin: "server", event: "new", detail: "{}" });
    });

    it("管理者は自分のログも見られる", async () => {
      const { app, adminId } = await setupGroup();
      expect((await get(app, adminId, "dev-admin")).status).toBe(200);
    });

    it("管理者ではないメンバー・別グループの管理者・端末IDなしは見られない", async () => {
      const { app, kidId, adminId } = await setupGroup();
      expect((await get(app, adminId, "dev-kid")).status).toBe(403); // 一般メンバーは、管理者のログも見られない
      expect((await get(app, kidId, "dev-kid")).status).toBe(403); // 自分のログも、管理者以外は見られない
      expect((await get(app, kidId, "dev-other")).status).toBe(403); // 別グループの管理者
      expect((await get(app, kidId)).status).toBe(400);
      expect((await get(app, "no-such-member", "dev-admin")).status).toBe(404);
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
