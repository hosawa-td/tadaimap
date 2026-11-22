const store = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: async (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: async (k: string) => {
      store.delete(k);
    },
    multiRemove: async (keys: string[]) => {
      keys.forEach((k) => store.delete(k));
    },
  },
}));

import { clearAllMemberships, loadNearbyGpsEnabled, saveNearbyGpsEnabled } from "../src/storage";

beforeEach(() => store.clear());

describe("「近くにいる」GPS判定の設定の保存(F29)", () => {
  it("保存が無い端末(以前の版を含む)は、オン(初期値)", async () => {
    expect(await loadNearbyGpsEnabled()).toBe(true);
  });

  it("オフにして保存すると、読み直してもオフのまま残る(画面を移っても、アプリを開き直しても)", async () => {
    await saveNearbyGpsEnabled(false);
    expect(await loadNearbyGpsEnabled()).toBe(false);
    expect(await loadNearbyGpsEnabled()).toBe(false);
  });

  it("オンに戻すと、オンになる", async () => {
    await saveNearbyGpsEnabled(false);
    await saveNearbyGpsEnabled(true);
    expect(await loadNearbyGpsEnabled()).toBe(true);
  });

  it("グループから退出して端末のデータを消すと、初期値(オン)に戻る", async () => {
    await saveNearbyGpsEnabled(false);
    await clearAllMemberships();
    expect(await loadNearbyGpsEnabled()).toBe(true);
  });
});
