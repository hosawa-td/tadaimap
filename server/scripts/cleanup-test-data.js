#!/usr/bin/env node
/**
 * テストで作ったメンバー・グループを、スプレッドシートから消すコマンド。
 *
 * テストで使うメンバーの名前は、必ず「テスト_」で始める(例:テスト_管理者、テスト_家族A)。
 * テストが終わったら、このコマンドで「テスト_」で始まるメンバーと、メンバーがいなくなったグループを消す。
 *
 * 使い方(server フォルダで):
 *   npm run cleanup-test-data                      # 消す対象を表示するだけ(何も消さない)
 *   npm run cleanup-test-data -- --yes             # 消す
 *   npm run cleanup-test-data -- --name-prefix 仮_ # 名前の先頭を変える(既定は「テスト_」)
 *   npm run cleanup-test-data -- --ids 0248bae5,398e9ed9 --yes   # 名前では見分けられない古いテスト用メンバーを、
 *                                                                #  memberIdの先頭8文字以上で指定して消す
 *
 * - 消す対象は「名前が指定の先頭で始まるメンバー」または「--ids で指定したメンバー」。
 * - 消したあとにメンバーが0人になるグループも、あわせて消す。1人でも残るグループは消さない。
 * - --yes を付けない場合は、対象の一覧を表示するだけで、何も消さない。必ず一覧を目で確認してから --yes を付ける。
 * - 本番の家族のメンバーを消してしまわないよう、対象が全メンバーの半数を超える場合は、--force を付けない限り実行しない。
 * - 消したデータは、アプリからは戻せない(スプレッドシートの「版の履歴」からは復元できる)。
 * - これらのメンバーのログ(Logs・log_日付シート)は、このコマンドでは消さない(7日で自動的に消える)。
 */
const path = require("path");

const DEFAULT_PREFIX = "テスト_";
const MEMBERS_SHEET = "Members";
const GROUPS_SHEET = "Groups";

function parseArgs(argv) {
  const opts = { namePrefix: DEFAULT_PREFIX, ids: [], yes: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--yes") opts.yes = true;
    else if (a === "--force") opts.force = true;
    else if (a === "--name-prefix") opts.namePrefix = argv[++i] || "";
    else if (a === "--ids") opts.ids = (argv[++i] || "").split(",").map((x) => x.trim()).filter(Boolean);
    else throw new Error(`知らないオプションです: ${a}`);
  }
  if (opts.namePrefix.length === 0) throw new Error("--name-prefix には1文字以上を指定してください");
  for (const id of opts.ids) {
    if (id.length < 8) throw new Error(`--ids には memberId の先頭8文字以上を指定してください: ${id}`);
  }
  return opts;
}

/**
 * 消す対象を決める。memberRows/groupRows は、見出しを除いたシートの行。
 * Members: [member_id, group_id, device_id, name, ...] / Groups: [group_id, ...]
 */
function selectCleanup(memberRows, groupRows, opts) {
  const isTarget = (row) =>
    String(row[3] || "").startsWith(opts.namePrefix) || opts.ids.some((id) => String(row[0] || "").startsWith(id));
  // シート上の行番号は、見出しの分だけ+2(1始まり)
  const members = memberRows.map((row, i) => ({ row, rowNumber: i + 2 })).filter((m) => isTarget(m.row));
  const targetIds = new Set(members.map((m) => m.row[0]));
  const remainingByGroup = new Map();
  for (const row of memberRows) {
    if (targetIds.has(row[0])) continue;
    remainingByGroup.set(row[1], (remainingByGroup.get(row[1]) || 0) + 1);
  }
  const touchedGroupIds = new Set(members.map((m) => m.row[1]));
  const groups = groupRows
    .map((row, i) => ({ row, rowNumber: i + 2 }))
    .filter((g) => touchedGroupIds.has(g.row[0]) && !remainingByGroup.get(g.row[0]));
  return { members, groups, totalMembers: memberRows.length };
}

function createSheetsClient() {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
  const { google } = require("googleapis");
  let key = (process.env.GOOGLE_PRIVATE_KEY || "").trim();
  if (/^["']/.test(key) && /["']$/.test(key)) key = key.slice(1, -1);
  key = key.replace(/\\n/g, "\n");
  if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !key) {
    throw new Error("server/.env に GOOGLE_SHEET_ID・GOOGLE_SERVICE_ACCOUNT_EMAIL・GOOGLE_PRIVATE_KEY を設定してください");
  }
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const sheets = createSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const [m, g, meta] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId, range: `${MEMBERS_SHEET}!A:Z` }),
    sheets.spreadsheets.values.get({ spreadsheetId, range: `${GROUPS_SHEET}!A:Z` }),
    sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" }),
  ]);
  const memberRows = (m.data.values || []).slice(1);
  const groupRows = (g.data.values || []).slice(1);
  const { members, groups, totalMembers } = selectCleanup(memberRows, groupRows, opts);

  console.log(`消す対象のメンバー: ${members.length} 人 / 全メンバー ${totalMembers} 人`);
  for (const t of members) {
    console.log(`  行${t.rowNumber} | ${String(t.row[0]).slice(0, 8)} | グループ ${String(t.row[1]).slice(0, 8)} | ${t.row[3]} | ${t.row[5]} | 更新 ${t.row[6] || ""}`);
  }
  console.log(`あわせて消す、メンバーがいなくなるグループ: ${groups.length} 件`);
  for (const t of groups) console.log(`  行${t.rowNumber} | ${String(t.row[0]).slice(0, 8)}`);

  if (members.length === 0) {
    console.log("消す対象がありません。");
    return;
  }
  if (members.length > totalMembers / 2 && !opts.force) {
    throw new Error("対象が全メンバーの半数を超えています。本番のメンバーを消してしまわないか、一覧をよく確認し、問題なければ --force を付けて実行してください");
  }
  if (!opts.yes) {
    console.log("(確認のみ。一覧を確認し、実際に消すには、同じ条件に --yes を付けて実行してください)");
    return;
  }

  const sheetIdOf = (title) => {
    const found = (meta.data.sheets || []).find((s) => s.properties && s.properties.title === title);
    if (!found) throw new Error(`${title} シートが見つかりません`);
    return found.properties.sheetId;
  };
  const rowRequests = (title, items) =>
    items
      .map((t) => t.rowNumber)
      .sort((a, b) => b - a) // 行番号の大きい順に消す(消すたびに下の行がずれるのを避ける)
      .map((rowNumber) => ({
        deleteDimension: { range: { sheetId: sheetIdOf(title), dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } },
      }));
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [...rowRequests(MEMBERS_SHEET, members), ...rowRequests(GROUPS_SHEET, groups)] },
  });
  console.log(`消しました: メンバー ${members.length} 人、グループ ${groups.length} 件`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("失敗:", err.message);
    process.exit(1);
  });
}

module.exports = { parseArgs, selectCleanup, DEFAULT_PREFIX };
