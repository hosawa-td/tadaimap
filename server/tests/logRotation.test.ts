import { archiveTabName, archiveTabsToDelete, jstYmd, sortLogRows } from "../src/logRotation";

describe("ログのローテート(日付・名前の判定)", () => {
  it("日付は日本時間で判定する(UTC 15:00 = 日本時間の翌日0:00)", () => {
    expect(jstYmd(new Date("2026-11-21T15:00:00.000Z"))).toBe("20261122");
    expect(jstYmd(new Date("2026-11-21T14:59:59.000Z"))).toBe("20261121");
    expect(archiveTabName(new Date("2026-11-21T15:00:00.000Z"))).toBe("log_20261122");
  });

  it("ご提示の例:20261122の実行で、log_20261115だけが削除対象(log_20261116〜1122の7日分が残る)", () => {
    const names = ["log_20261115", "log_20261116", "log_20261117", "log_20261118", "log_20261119", "log_20261120", "log_20261121"];
    expect(archiveTabsToDelete(names, new Date("2026-11-21T15:00:00.000Z"))).toEqual(["log_20261115"]);
  });

  it("月をまたいでも正しく数える(12/1の実行で、残るのは11/25〜12/1)", () => {
    const names = ["log_20261123", "log_20261124", "log_20261125", "log_20261201"];
    expect(archiveTabsToDelete(names, new Date("2026-11-30T15:00:00.000Z"))).toEqual(["log_20261123", "log_20261124"]);
  });

  it("Logs・Members・Groupsなど、log_YYYYMMDD以外のシートには決して触れない", () => {
    const names = ["Logs", "Members", "Groups", "log_old", "log_2026112", "log_20261115x", "memo_20200101"];
    expect(archiveTabsToDelete(names, new Date("2026-11-21T15:00:00.000Z"))).toEqual([]);
  });

  it("ログは記録時刻の古い順に並べ、時刻が空の行は捨てる", () => {
    const rows = [["2026-11-21T03:00:00.000Z", "b"], ["2026-11-21T01:00:00.000Z", "a"], ["", "x"], ["不正な時刻", "z"]];
    expect(sortLogRows(rows).map((r) => r[1])).toEqual(["a", "b", "z"]);
  });
});
