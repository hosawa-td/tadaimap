const store = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: async (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: async (k: string) => {
      store.delete(k);
    },
  },
}));

import { addDiagLog, DIAG_BUFFER_MAX, flushDiagLogs, serializeDetail } from "../src/diagLog";

function fakeClient() {
  const sent: { memberId: string; entries: { at: string; event: string; detail: string }[] }[] = [];
  return {
    sent,
    uploadLogs: async (memberId: string, entries: { at: string; event: string; detail: string }[]) => {
      sent.push({ memberId, entries });
    },
  };
}

beforeEach(() => store.clear());

describe("端末ログ(diagLog)", () => {
  it("記録したログを、force指定でサーバーへ送り、送れた分は端末から消える", async () => {
    await addDiagLog("auto_check", { trigger: "periodic", judged: "none" }, new Date("2026-11-21T00:00:00.000Z"));
    const client = fakeClient();
    await flushDiagLogs(client, "m1", { force: true });
    expect(client.sent).toHaveLength(1);
    expect(client.sent[0].memberId).toBe("m1");
    expect(client.sent[0].entries[0]).toMatchObject({ at: "2026-11-21T00:00:00.000Z", event: "auto_check" });
    expect(JSON.parse(client.sent[0].entries[0].detail)).toMatchObject({ trigger: "periodic" });
    await flushDiagLogs(client, "m1", { force: true });
    expect(client.sent).toHaveLength(1); // 空なので再送しない
  });

  it("force無しでは、件数が少なく前回の送信から間もないときは送らない", async () => {
    await addDiagLog("auto_check", {});
    const client = fakeClient();
    await flushDiagLogs(client, "m1", { force: true });
    await addDiagLog("auto_check", {});
    await flushDiagLogs(client, "m1"); // 直前に送信済みで1件だけ → 送らない
    expect(client.sent).toHaveLength(1);
    // 前回の送信から1時間以上経てば送る
    await flushDiagLogs(client, "m1", { now: new Date(Date.now() + 61 * 60 * 1000) });
    expect(client.sent).toHaveLength(2);
  });

  it("送信に失敗したログは端末に残り、次回に再送される", async () => {
    await addDiagLog("auto_check", { n: 1 });
    const failing = {
      uploadLogs: async () => {
        throw new Error("offline");
      },
    };
    await flushDiagLogs(failing, "m1", { force: true });
    const client = fakeClient();
    await flushDiagLogs(client, "m1", { force: true });
    expect(client.sent[0].entries).toHaveLength(1);
  });

  it("端末に溜める件数には上限があり、古いものから捨てる", async () => {
    for (let i = 0; i < DIAG_BUFFER_MAX + 5; i++) await addDiagLog("auto_check", { i });
    const client = fakeClient();
    await flushDiagLogs(client, "m1", { force: true });
    expect(client.sent[0].entries[0]).toBeDefined();
    const first = JSON.parse(client.sent[0].entries[0].detail);
    expect(first.i).toBe(5);
  });

  it("detailは500文字以内に収める", () => {
    expect(serializeDetail("a".repeat(1000)).length).toBeLessThanOrEqual(500);
  });
});
