/**
 * 接続状況ログのローテート保存(F26)の、日付・名前まわりの判定。
 * 毎日0:00(日本時間)に「Logs」シートのログを、同じスプレッドシートの「log_YYYYMMDD」シートへ移し、
 * 7日より前の「log_YYYYMMDD」シートを削除して、常に直近7日分だけを残す。
 */

/** 残す日数(実行日を含む) */
export const LOG_KEEP_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const ARCHIVE_TAB_PATTERN = /^log_(\d{8})$/;

export interface RotateLogsResult {
  /** 保存先のシート名(例: log_20261122) */
  tab: string;
  /** 保存した(確認のみの場合は、保存する予定の)ログの件数 */
  saved: number;
  /** Logsシートから消した行数(確認のみの場合は0) */
  clearedRows: number;
  /** 削除した(確認のみの場合は、削除する予定の)古い保存シート名 */
  deletedTabs: string[];
  dryRun: boolean;
}

/** 「log_YYYYMMDD」形式のシート名かどうか。 */
export function isArchiveTabName(name: string): boolean {
  return ARCHIVE_TAB_PATTERN.test(name);
}

/** 日本時間の日付を YYYYMMDD で返す。 */
export function jstYmd(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
}

export function archiveTabName(date: Date): string {
  return `log_${jstYmd(date)}`;
}

function ymdToUtcMs(ymd: string): number {
  return Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)));
}

/**
 * 削除する保存シート名。今日から数えて LOG_KEEP_DAYS 日より前の「log_YYYYMMDD」だけが対象で、
 * 「Logs」「Members」など、それ以外のシートには決して触れない。
 */
export function archiveTabsToDelete(tabNames: string[], now: Date, keepDays: number = LOG_KEEP_DAYS): string[] {
  const oldestKeptMs = ymdToUtcMs(jstYmd(now)) - (keepDays - 1) * DAY_MS;
  return tabNames.filter((name) => {
    const m = ARCHIVE_TAB_PATTERN.exec(name);
    return !!m && ymdToUtcMs(m[1]) < oldestKeptMs;
  });
}

/** ログの行を、記録時刻(row[0])の古い順に並べる(時刻が空の行は捨て、読めない行は元の順序のまま後ろに置く)。 */
export function sortLogRows(rows: string[][]): string[][] {
  const keyed = rows
    .filter((r) => r[0])
    .map((row, index) => ({ row, index, ms: Date.parse(row[0]) }));
  keyed.sort((a, b) => {
    const am = Number.isFinite(a.ms) ? a.ms : Infinity;
    const bm = Number.isFinite(b.ms) ? b.ms : Infinity;
    return am - bm || a.index - b.index;
  });
  return keyed.map((k) => k.row);
}
