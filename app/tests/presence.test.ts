import { countHome, formatStatusLine, formatTime, statusLabel, summaryText } from "../src/presence";
import { MemberView } from "../src/api";

function member(overrides: Partial<MemberView>): MemberView {
  return {
    memberId: "m1",
    nameOrAnonymous: "さくら",
    isMe: false,
    status: "home",
    statusUpdatedAt: "2026-01-01T05:32:00.000Z",
    nearbyLabel: "施設内",
    isAdmin: false,
    ...overrides,
  };
}

describe("formatTime", () => {
  it("ISO日時をHH:MMに整形する", () => {
    const iso = new Date(2026, 0, 1, 9, 5).toISOString();
    expect(formatTime(iso)).toBe("09:05");
  });
});

describe("statusLabel", () => {
  it("在宅・外出中は固定文言、nearbyは本人の呼び方を使う", () => {
    expect(statusLabel(member({ status: "home" }))).toBe("在宅");
    expect(statusLabel(member({ status: "away" }))).toBe("外出中");
    expect(statusLabel(member({ status: "nearby", nearbyLabel: "ロビー" }))).toBe("ロビー");
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

  it("nearbyの場合は本人の呼び方を使う", () => {
    const iso = new Date(2026, 0, 1, 12, 0).toISOString();
    const line = formatStatusLine(member({ status: "nearby", nearbyLabel: "ロビー", statusUpdatedAt: iso }));
    expect(line).toBe("ロビー · 12:00から");
  });
});

describe("countHome / summaryText", () => {
  it("在宅人数と総人数を集計する(nearbyは在宅に含めない)", () => {
    const members = [
      member({ memberId: "1", status: "home" }),
      member({ memberId: "2", status: "nearby" }),
      member({ memberId: "3", status: "away" }),
    ];
    expect(countHome(members)).toEqual({ home: 1, total: 3 });
    expect(summaryText(members)).toBe("現在1/3人 在宅中");
  });

  it("メンバーが0人の場合", () => {
    expect(summaryText([])).toBe("現在0/0人 在宅中");
  });
});
