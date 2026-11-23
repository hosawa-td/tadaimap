/**
 * 通信に失敗したとき、少し待って何回かやり直す。
 * 外出直後はWi-Fiが切れてもモバイル通信がまだ使えず、「通信先の名前を引けない」エラーで一度失敗しやすいため、
 * 通信が回復するまで数十秒ほど粘る(自動の外出判定が送れずに、状態が古いまま残るのを防ぐ)。
 */
export const RETRY_DELAYS_MS = [2000, 5000, 10000, 20000];

export interface RetryResult {
  /** 実際に試した回数(最初の1回を含む) */
  attempts: number;
}

/**
 * action を実行し、失敗したら delays の間隔で再試行する。最終的に失敗したら最後のエラーを投げる。
 * shouldRetry が false を返したエラー(サーバーが明確に断った場合など)は、再試行せずすぐ投げる。
 */
export async function retryWithBackoff(
  action: () => Promise<void>,
  options: {
    delaysMs?: number[];
    shouldRetry?: (err: unknown) => boolean;
    sleep?: (ms: number) => Promise<void>;
  } = {}
): Promise<RetryResult> {
  const delays = options.delaysMs ?? RETRY_DELAYS_MS;
  const shouldRetry = options.shouldRetry ?? (() => true);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let attempts = 0;
  for (;;) {
    attempts++;
    try {
      await action();
      return { attempts };
    } catch (err) {
      if (attempts > delays.length || !shouldRetry(err)) throw err;
      await sleep(delays[attempts - 1]);
    }
  }
}
