import { normalizePrivateKey } from "../src/repository.sheets";

describe("normalizePrivateKey", () => {
  it("前後の二重引用符を取り除く", () => {
    const result = normalizePrivateKey('"-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n"');
    expect(result.startsWith('"')).toBe(false);
    expect(result.endsWith('"')).toBe(false);
  });

  it("前後の単一引用符を取り除く", () => {
    const result = normalizePrivateKey("'-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n'");
    expect(result.startsWith("'")).toBe(false);
  });

  it("\\nという文字列を実際の改行に変換する", () => {
    const result = normalizePrivateKey("-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n");
    expect(result).toBe("-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n");
  });

  it("引用符がなく、実際の改行の場合は前後の空白だけ取り除かれる", () => {
    const input = "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n";
    expect(normalizePrivateKey(input)).toBe(input.trim());
  });
});
