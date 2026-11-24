/**
 * テスト用のメンバーかどうか。名前が「Test」(大文字・小文字は区別しない)、または「テスト_」「Test_」で始まるもの。
 * テスト用のメンバーは、テスト用のメンバー以外の人には、一覧にも通知にも出さない(動作確認で家族を混乱させないため)。
 * ※本番の家族の名前を「Test」「テスト_…」にすると隠れてしまうため、使わないこと。
 */
export function isTestMemberName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === "test" || n.startsWith("test_") || n.startsWith("テスト_");
}
