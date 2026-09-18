import { countHome, formatStatusLine, formatTime, summaryText } from "../src/presence";
import { MemberView } from "../src/api";

function member(overrides: Partial<MemberView>): MemberView {
  return {
    memberId: "m1",
    nameOrAnonymous: "さくら",
    isMe: false,
    status: "home",
    statusUpdatedAt: "2026-01-01T05:32:00.000Z",
    ...overrides,
  };
}

describe("formatTime", () => {
  it("ISO日時をHH:MMに整形する", () => {
    const iso = new Date(2026, 0, 1, 9, 5).toISOString();
    expect(formatTime(iso)).toBe("09:05");
  });
});

describe("formatStatusLine", () => {
  it("在宅の場合は「在宅・HH:MMに帰宅」", () => {
    const iso = new Date(2026, 0, 1, 15, 3).toISOString();
    const line = formatStatusLine(member({ status: "home", statusUpdatedAt: iso }));
    expect(line).toBe("在宅 · 15:03に帰宅");
  });

  it("外出中の場合は「外出中・HH:MMに外出」", () => {
    const iso = new Date(2026, 0, 1, 8, 45).toISOString();
    const line = formatStatusLine(member({ status: "away", statusUpdatedAt: iso }));
    expect(line).toBe("外出中 · 08:45に外出");
  });
});

describe("countHome / summaryText", () => {
  it("在宅人数と総人数を集計する", () => {
    const members = [
      member({ memberId: "1", status: "home" }),
      member({ memberId: "2", status: "home" }),
      member({ memberId: "3", status: "away" }),
    ];
    expect(countHome(members)).toEqual({ home: 2, total: 3 });
    expect(summaryText(members)).toBe("現在2/3人 在宅中");
  });

  it("メンバーが0人の場合", () => {
    expect(summaryText([])).toBe("現在0/0人 在宅中");
  });
});
