import { retryWithBackoff } from "../src/retry";

const noSleep = async () => {};

describe("retryWithBackoff", () => {
  it("最初で成功すれば1回で終わる", async () => {
    let n = 0;
    const r = await retryWithBackoff(async () => { n++; }, { sleep: noSleep });
    expect(r.attempts).toBe(1);
    expect(n).toBe(1);
  });

  it("失敗しても、通信が回復すれば成功する(間隔を空けて再試行)", async () => {
    let n = 0;
    const waits: number[] = [];
    const r = await retryWithBackoff(
      async () => {
        n++;
        if (n < 3) throw new Error("Unable to resolve host");
      },
      { delaysMs: [10, 20, 30], sleep: async (ms) => { waits.push(ms); } }
    );
    expect(r.attempts).toBe(3);
    expect(waits).toEqual([10, 20]);
  });

  it("ずっと失敗したら、再試行を使い切って最後のエラーを投げる", async () => {
    let n = 0;
    await expect(
      retryWithBackoff(async () => { n++; throw new Error("down"); }, { delaysMs: [1, 1], sleep: noSleep })
    ).rejects.toThrow("down");
    expect(n).toBe(3);
  });

  it("再試行すべきでないエラーは、すぐ投げる", async () => {
    let n = 0;
    await expect(
      retryWithBackoff(async () => { n++; throw new Error("403"); }, { sleep: noSleep, shouldRetry: () => false })
    ).rejects.toThrow("403");
    expect(n).toBe(1);
  });
});
