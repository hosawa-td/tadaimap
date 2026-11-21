import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * 端末側の動作ログ(F26のAndroid版)。バックグラウンドの自動判定が「動いたのか・何を判断したのか・送れたのか」を
 * 後から調べられるよう、端末内に溜めておき、通信できるときにまとめてサーバーへ送る。
 * ログの記録・送信の失敗は、本来の動作(自動判定)を妨げないよう、すべて握りつぶす。
 */

const BUFFER_KEY = "tadaimap.diagLogs";
const LAST_FLUSH_KEY = "tadaimap.diagLastFlush";
/** 端末に溜めておく最大件数(これを超えたら古いものから捨てる) */
export const DIAG_BUFFER_MAX = 300;
/** サーバーが1回に受け付ける最大件数 */
const UPLOAD_BATCH = 200;
/** 重要でないログだけが溜まっているとき、この件数を超えたら送る */
const FLUSH_COUNT_THRESHOLD = 20;
/** 重要でないログだけが溜まっているとき、前回の送信からこの時間(ミリ秒)が過ぎたら送る */
const FLUSH_INTERVAL_MS = 60 * 60 * 1000;
/** サーバー側のdetailの上限(500文字)に収める */
const DETAIL_MAX = 480;

export interface DiagEntry {
  at: string;
  event: string;
  detail: string;
}

export interface DiagUploader {
  uploadLogs(memberId: string, entries: DiagEntry[]): Promise<unknown>;
}

// 同じ実行環境内での読み書きの競合を避けるため、記録は1件ずつ順番に処理する
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
}

export function serializeDetail(detail: unknown): string {
  let text: string;
  try {
    text = typeof detail === "string" ? detail : JSON.stringify(detail ?? "");
  } catch {
    text = String(detail);
  }
  return text.length > DETAIL_MAX ? text.slice(0, DETAIL_MAX) : text;
}

async function readBuffer(): Promise<DiagEntry[]> {
  const raw = await AsyncStorage.getItem(BUFFER_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** ログを1件、端末内に記録する。失敗しても例外は投げない。 */
export function addDiagLog(event: string, detail: unknown, now: Date = new Date()): Promise<void> {
  return enqueue(async () => {
    const buffer = await readBuffer();
    buffer.push({ at: now.toISOString(), event: event.slice(0, 40), detail: serializeDetail(detail) });
    const trimmed = buffer.length > DIAG_BUFFER_MAX ? buffer.slice(buffer.length - DIAG_BUFFER_MAX) : buffer;
    await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(trimmed));
  }).catch(() => undefined);
}

/**
 * 溜まっているログをサーバーへ送る。force=falseのときは、溜まった件数が多いか、前回の送信から時間が空いたときだけ送る
 * (15分ごとの定期確認のたびに通信しないようにするため)。送れた分だけ端末から消す。
 */
export function flushDiagLogs(
  client: DiagUploader,
  memberId: string,
  options: { force?: boolean; now?: Date } = {}
): Promise<void> {
  return enqueue(async () => {
    const buffer = await readBuffer();
    if (buffer.length === 0) return;
    const nowMs = (options.now ?? new Date()).getTime();
    if (!options.force) {
      const last = Number(await AsyncStorage.getItem(LAST_FLUSH_KEY)) || 0;
      if (buffer.length < FLUSH_COUNT_THRESHOLD && nowMs - last < FLUSH_INTERVAL_MS) return;
    }
    const batch = buffer.slice(0, UPLOAD_BATCH);
    await client.uploadLogs(memberId, batch);
    // 送信中に追記された分を残すため、送れた件数だけ先頭から消す
    const latest = await readBuffer();
    await AsyncStorage.setItem(BUFFER_KEY, JSON.stringify(latest.slice(batch.length)));
    await AsyncStorage.setItem(LAST_FLUSH_KEY, String(nowMs));
  }).catch(() => undefined);
}
