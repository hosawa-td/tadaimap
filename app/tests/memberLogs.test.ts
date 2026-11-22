import { describeLog, formatJst, groupLogsByDay, MemberLogEntry } from "../src/memberLogs";

const entry = (at: string, event: string, detail: object | string, origin: "client" | "server" = "server"): MemberLogEntry => ({
  at,
  origin,
  event,
  detail: typeof detail === "string" ? detail : JSON.stringify(detail),
});

describe("formatJst", () => {
  it("日本時間(+9時間)の日付・曜日・時刻にする", () => {
    expect(formatJst("2026-11-21T23:05:38.000Z")).toEqual({ dateLabel: "2026/11/22(日)", timeLabel: "08:05:38" });
    expect(formatJst("2026-11-21T14:59:59.000Z")).toEqual({ dateLabel: "2026/11/21(土)", timeLabel: "23:59:59" });
  });

  it("読み取れない日時は「日時不明」", () => {
    expect(formatJst("x").dateLabel).toBe("日時不明");
  });
});

describe("describeLog", () => {
  it("状態の変化:状態名・きっかけ・前回からの経過を表示する", () => {
    const d = describeLog(
      entry("2026-11-21T23:05:38.000Z", "status_change", { from: "home", to: "away", source: "auto", trigger: "wifi_disconnect", sinceLastChangeSec: 35710 }),
      "施設内"
    );
    expect(d).toMatchObject({ kind: "status", title: "在宅 → 外出中", timeLabel: "08:05:38" });
    expect(d.note).toBe("自動 ・ Wi-Fi切断(ショートカット) ・ 前回の変更から9時間55分");
  });

  it("グループ共通の呼び方(nearbyLabel)を使い、管理者による変更も分かる", () => {
    const d = describeLog(entry("2026-11-21T00:00:00.000Z", "status_change", { from: "away", to: "nearby", byAdmin: true }), "ロビー");
    expect(d.title).toBe("外出中 → ロビー");
    expect(d.note).toBe("管理者による変更");
  });

  it("無視された更新:理由を日本語で表示する", () => {
    const d = describeLog(entry("2026-11-21T23:06:51.000Z", "status_ignored", { from: "home", to: "away", reason: "flip_flop", source: "auto" }), "施設内");
    expect(d).toMatchObject({ kind: "status", title: "無視：外出中への自動更新" });
    expect(d.note).toBe("理由：直前の変更から60秒以内の外出");
  });

  it("Androidの自動判定ログ:Wi-Fi・位置・判定・結果を1行にまとめる(技術的なログ)", () => {
    const d = describeLog(
      entry("2026-11-21T22:42:43.000Z", "auto_check", { trigger: "periodic", mode: "location", wifi: "other", wifiOn: true, pos: "fresh", distM: 1773, server: "home", sent: "ok", judged: "away" }, "client"),
      "施設内"
    );
    expect(d.kind).toBe("technical");
    expect(d.title).toBe("自動判定（定期確認・位置情報あり）");
    expect(d.note).toBe("Wi-Fi：他のWi-Fi・未接続 ／ 位置：取得(1773m) ／ 判定：外出中 ／ 結果：送信");
  });

  it("位置が取れず判断できなかったときも分かる", () => {
    const d = describeLog(entry("2026-11-21T22:42:43.000Z", "auto_check", { trigger: "periodic", mode: "location", wifi: "other", wifiOn: false, pos: "none", judged: "none", sent: undefined }, "client"), "施設内");
    expect(d.note).toContain("端末のWi-Fiはオフ");
    expect(d.note).toContain("位置：取得できず");
    expect(d.note).toContain("判定：判断できず");
  });

  it("それ以外のログ(boot・gapなど)は、そのまま技術的なログとして表示する。壊れたdetailでも落ちない", () => {
    const d = describeLog(entry("2026-11-20T11:23:43.000Z", "gap", "boot 前回の動作から79140秒", "client"), "施設内");
    expect(d).toMatchObject({ kind: "technical", title: "gap", note: "boot 前回の動作から79140秒" });
    expect(describeLog(entry("2026-11-20T11:23:43.000Z", "status_change", "壊れた{"), "施設内").kind).toBe("technical");
  });
});

describe("groupLogsByDay", () => {
  const entries = [
    entry("2026-11-21T23:05:38.000Z", "status_change", { from: "home", to: "away", source: "auto" }), // 11/22 08:05
    entry("2026-11-21T14:00:00.000Z", "auto_check", { trigger: "periodic", wifi: "home", judged: "home", sent: "same" }, "client"), // 11/21 23:00
    entry("2026-11-21T01:00:00.000Z", "status_change", { from: "away", to: "home", source: "auto" }), // 11/21 10:00
  ];

  it("日本時間の日付ごとにまとめ、新しい順に並べる", () => {
    const groups = groupLogsByDay([...entries].reverse(), "施設内");
    expect(groups.map((g) => g.dateLabel)).toEqual(["2026/11/22(日)", "2026/11/21(土)"]);
    expect(groups[1].items.map((i) => i.timeLabel)).toEqual(["23:00:00", "10:00:00"]);
  });

  it("onlyStatus=trueなら、状態の履歴だけを残す(技術的なログだけの日は出さない)", () => {
    const groups = groupLogsByDay(entries, "施設内", { onlyStatus: true });
    expect(groups.flatMap((g) => g.items).every((i) => i.kind === "status")).toBe(true);
    expect(groups.flatMap((g) => g.items)).toHaveLength(2);
  });
});
