// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseArgs, buildMatcher } = require("../scripts/clear-logs.js");

// [at, received_at, member_id, device_id, origin, event, detail]
const ios = ["2026-11-19T13:00:00.000Z", "", "b3e7df12-aaaa", "web-abc", "server", "status_change", "{}"];
const iosNew = ["2026-11-21T13:00:00.000Z", "", "c3bbaf82-bbbb", "web-def", "server", "status_change", "{}"];
const android = ["2026-11-19T13:00:00.000Z", "", "b2a91af5-cccc", "3cf63e7c-3fca-a01d-62fa-17b2feb8e055", "client", "auto_check", "{}"];

describe("clear-logs コマンドの対象判定", () => {
  it("--ios は端末IDが web- で始まるログだけが対象", () => {
    const m = buildMatcher(parseArgs(["--ios"]));
    expect([ios, iosNew, android].map(m)).toEqual([true, true, false]);
  });

  it("--android は web- で始まらないログだけが対象", () => {
    const m = buildMatcher(parseArgs(["--android"]));
    expect([ios, iosNew, android].map(m)).toEqual([false, false, true]);
  });

  it("--before は日本時間の指定日0時より前のログだけが対象(複数条件はすべて満たすもの)", () => {
    // 2026-11-20 0:00 JST = 2026-11-19T15:00Z。ios(13:00Z)は前、iosNewは後
    const m = buildMatcher(parseArgs(["--ios", "--before", "2026-11-20"]));
    expect([ios, iosNew, android].map(m)).toEqual([true, false, false]);
  });

  it("--member は memberId の先頭が一致するログだけが対象。短すぎる指定は拒否する", () => {
    const m = buildMatcher(parseArgs(["--member", "c3bbaf82"]));
    expect([ios, iosNew, android].map(m)).toEqual([false, true, false]);
    expect(() => buildMatcher(parseArgs(["--member", "c3bb"]))).toThrow();
  });

  it("知らないオプションや不正な日付はエラー", () => {
    expect(() => parseArgs(["--foo"])).toThrow();
    expect(() => buildMatcher(parseArgs(["--before", "あした"]))).toThrow();
  });
});
