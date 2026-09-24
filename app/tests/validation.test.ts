import {
  isValidName,
  isValidInviteCode,
  isValidRadius,
  isValidBuildingRadius,
  isValidNearbyLabel,
} from "../src/validation";

describe("isValidName", () => {
  it("1文字以上12文字以内なら有効", () => {
    expect(isValidName("さくら")).toBe(true);
    expect(isValidName("あ".repeat(12))).toBe(true);
  });

  it("空文字や13文字以上は無効", () => {
    expect(isValidName("")).toBe(false);
    expect(isValidName("   ")).toBe(false);
    expect(isValidName("あ".repeat(13))).toBe(false);
  });
});

describe("isValidInviteCode", () => {
  it("6桁の数字のみ有効", () => {
    expect(isValidInviteCode("123456")).toBe(true);
    expect(isValidInviteCode("12345")).toBe(false);
    expect(isValidInviteCode("abcdef")).toBe(false);
  });
});

describe("isValidRadius", () => {
  it("50〜300の範囲内が有効", () => {
    expect(isValidRadius(50)).toBe(true);
    expect(isValidRadius(300)).toBe(true);
    expect(isValidRadius(100)).toBe(true);
  });

  it("範囲外は無効", () => {
    expect(isValidRadius(49)).toBe(false);
    expect(isValidRadius(301)).toBe(false);
  });
});

describe("isValidBuildingRadius", () => {
  it("100〜2000mかつ自宅の範囲以上なら有効", () => {
    expect(isValidBuildingRadius(300, 100)).toBe(true);
    expect(isValidBuildingRadius(100, 100)).toBe(true);
  });

  it("範囲外、または自宅の範囲より小さいと無効", () => {
    expect(isValidBuildingRadius(99, 50)).toBe(false);
    expect(isValidBuildingRadius(2001, 100)).toBe(false);
    expect(isValidBuildingRadius(150, 200)).toBe(false);
  });
});

describe("isValidNearbyLabel", () => {
  it("1〜12文字なら有効", () => {
    expect(isValidNearbyLabel("施設内")).toBe(true);
    expect(isValidNearbyLabel("あ".repeat(12))).toBe(true);
  });

  it("空文字や13文字以上は無効", () => {
    expect(isValidNearbyLabel("")).toBe(false);
    expect(isValidNearbyLabel("あ".repeat(13))).toBe(false);
  });
});
