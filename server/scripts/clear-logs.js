#!/usr/bin/env node
/**
 * 接続状況ログ(スプレッドシートの「Logs」シート)を消すコマンド。
 *
 * 使い方(server フォルダで):
 *   npm run clear-logs -- --ios              # iPhone(Web版・ショートカット)のログだけを確認(消さない)
 *   npm run clear-logs -- --ios --yes        # iPhone(Web版・ショートカット)のログだけを消す
 *   npm run clear-logs -- --android --yes    # Androidアプリのログだけを消す
 *   npm run clear-logs -- --all --yes        # すべてのログを消す
 *   npm run clear-logs -- --ios --before 2026-11-20 --yes   # 指定日(日本時間)より前のiPhoneのログだけを消す
 *   npm run clear-logs -- --member b3e7df12 --yes           # 指定メンバー(memberIdの先頭8文字以上)のログだけを消す
 *
 * - --yes を付けない場合は、消す対象の件数を表示するだけで、何も消さない(確認用)。
 * - 対象の指定(--all / --ios / --android / --member / --before のどれか)は必須。
 * - 条件を複数指定した場合は、すべてに当てはまるログだけを消す。
 * - 見出し行(1行目)は消さない。
 * - iPhone(Web版)かどうかは、端末ID(device_id)が「web-」で始まるかどうかで見分ける。
 *   Androidアプリの端末IDはUUID形式のため、「web-」では始まらない。
 * - 消したログはアプリからは戻せない(スプレッドシートの「版の履歴」からは復元できる)。
 * - 書き換えの最中にログが追加されると、その1件を取りこぼすことがある(消した直後に増える分は問題ない)。
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { google } = require("googleapis");

const LOGS_SHEET = "Logs";

function parseArgs(argv) {
  const opts = { all: false, ios: false, android: false, member: null, before: null, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") opts.all = true;
    else if (a === "--ios") opts.ios = true;
    else if (a === "--android") opts.android = true;
    else if (a === "--yes") opts.yes = true;
    else if (a === "--member") opts.member = argv[++i] || "";
    else if (a === "--before") opts.before = argv[++i] || "";
    else throw new Error(`知らないオプションです: ${a}`);
  }
  return opts;
}

/** YYYY-MM-DD(日本時間の0時)またはISO8601を、ミリ秒に変換する。 */
function parseBefore(value) {
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T00:00:00+09:00`) : Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`--before の日付が読み取れません: ${value}(例: 2026-11-20)`);
  return ms;
}

/** 消す対象かどうか。row = [at, received_at, member_id, device_id, origin, event, detail] */
function buildMatcher(opts) {
  const beforeMs = opts.before !== null ? parseBefore(opts.before) : null;
  if (opts.member !== null && opts.member.length < 8) {
    throw new Error("--member には memberId の先頭8文字以上を指定してください");
  }
  return (row) => {
    if (opts.ios && !String(row[3] || "").startsWith("web-")) return false;
    if (opts.android && String(row[3] || "").startsWith("web-")) return false;
    if (opts.member !== null && !String(row[2] || "").startsWith(opts.member)) return false;
    if (beforeMs !== null) {
      const at = Date.parse(row[0]);
      if (!Number.isFinite(at) || at >= beforeMs) return false;
    }
    return true;
  };
}

function createSheetsClient() {
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
  if (!opts.all && !opts.ios && !opts.android && opts.member === null && opts.before === null) {
    throw new Error("消す対象を指定してください(--all / --ios / --android / --member <id> / --before <日付>)");
  }
  if (opts.ios && opts.android) throw new Error("--ios と --android は同時に指定できません");
  const matches = opts.all ? () => true : buildMatcher(opts);

  const sheets = createSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${LOGS_SHEET}!A:G` });
  const rows = res.data.values || [];
  const header = rows[0];
  const body = rows.slice(1);
  const kept = body.filter((r) => !matches(r));
  const removeCount = body.length - kept.length;

  console.log(`ログ ${body.length} 件のうち、消す対象: ${removeCount} 件 / 残す: ${kept.length} 件`);
  if (removeCount === 0) {
    console.log("消す対象がありません。");
    return;
  }
  if (!opts.yes) {
    console.log("(確認のみ。実際に消すには、同じ条件に --yes を付けて実行してください)");
    return;
  }

  // 一度に書き換える: 見出し以外を空にして、残すログを書き戻す
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${LOGS_SHEET}!A2:Z` });
  if (kept.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${LOGS_SHEET}!A2`,
      valueInputOption: "RAW",
      requestBody: { values: kept },
    });
  }
  console.log(`${removeCount} 件のログを消しました。見出し: ${header ? header.slice(0, 3).join(", ") + " ..." : "(なし)"}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("失敗:", err.message);
    process.exit(1);
  });
}

module.exports = { parseArgs, buildMatcher, parseBefore };
