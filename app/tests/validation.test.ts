import { isValidName, isValidInviteCode, isValidRadius } from "../src/validation";

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
