// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseArgs, selectCleanup } = require("../scripts/cleanup-test-data.js");

// Members: [member_id, group_id, device_id, name, ...] / Groups: [group_id, ...]
const members = [
  ["aaaaaaaa-1", "g-family", "d1", "パパ", "", "home"],
  ["bbbbbbbb-2", "g-family", "d2", "ママ", "", "home"],
  ["cccccccc-3", "g-test1", "d3", "テスト_管理者", "", "away"],
  ["dddddddd-4", "g-test1", "d4", "テスト_家族A", "", "away"],
  ["eeeeeeee-5", "g-old", "d5", "ばあば", "", "away"],
  ["ffffffff-6", "g-mixed", "d6", "テスト_混在", "", "away"],
  ["99999999-7", "g-mixed", "d7", "ゆう", "", "home"],
];
const groups = [["g-family"], ["g-test1"], ["g-old"], ["g-mixed"]];

describe("cleanup-test-data の対象判定", () => {
  it("名前が「テスト_」で始まるメンバーだけが対象。メンバーが0人になるグループだけを、あわせて消す", () => {
    const r = selectCleanup(members, groups, parseArgs([]));
    expect(r.members.map((m: { row: string[] }) => m.row[3])).toEqual(["テスト_管理者", "テスト_家族A", "テスト_混在"]);
    // g-test1 は全員が対象なので消す。g-mixed は「ゆう」が残るので消さない。g-family は対象外
    expect(r.groups.map((g: { row: string[] }) => g.row[0])).toEqual(["g-test1"]);
  });

  it("行番号は、見出しの分を含むシート上の行(1始まり)になる", () => {
    const r = selectCleanup(members, groups, parseArgs([]));
    expect(r.members.map((m: { rowNumber: number }) => m.rowNumber)).toEqual([4, 5, 7]);
    expect(r.groups.map((g: { rowNumber: number }) => g.rowNumber)).toEqual([3]);
  });

  it("--ids で、名前では見分けられない古いテスト用メンバーも指定できる", () => {
    const r = selectCleanup(members, groups, parseArgs(["--ids", "eeeeeeee"]));
    expect(r.members.map((m: { row: string[] }) => m.row[3])).toContain("ばあば");
    expect(r.groups.map((g: { row: string[] }) => g.row[0])).toContain("g-old");
  });

  it("名前の先頭を変えられる。本番のメンバーは、指定しない限り対象にならない", () => {
    expect(selectCleanup(members, groups, parseArgs(["--name-prefix", "仮_"])).members).toEqual([]);
    const r = selectCleanup(members, groups, parseArgs([]));
    expect(r.members.some((m: { row: string[] }) => ["パパ", "ママ", "ゆう"].includes(m.row[3]))).toBe(false);
  });

  it("不正な指定はエラー(短すぎるid・空の先頭・知らないオプション)", () => {
    expect(() => parseArgs(["--ids", "abc"])).toThrow();
    expect(() => parseArgs(["--name-prefix", ""])).toThrow();
    expect(() => parseArgs(["--foo"])).toThrow();
  });
});
