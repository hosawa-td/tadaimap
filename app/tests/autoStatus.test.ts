import {
  classifyWifi,
  distanceMeters,
  judgeAutoStatus,
  judgeFromGeofenceEvent,
  judgeWifiOnly,
  shouldSendStatus,
} from "../src/autoStatus";

const homeOnly = [{ ssid: "home-wifi", kind: "home" as const }];
const config = { homeRadiusM: 100, buildingRadiusM: 300 };

describe("distanceMeters", () => {
  it("同じ地点なら0m", () => {
    expect(distanceMeters(35.68, 139.76, 35.68, 139.76)).toBe(0);
  });

  it("緯度0.001度の差はおよそ111m", () => {
    const d = distanceMeters(35.68, 139.76, 35.681, 139.76);
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(117);
  });
});

describe("classifyWifi", () => {
  it("自宅Wi-Fiが未登録ならnone", () => {
    expect(classifyWifi({ enabled: true, connected: true, ssid: "home-wifi" }, [])).toBe("none");
  });

  it("Wi-Fiの状態が読めない(Android以外など)ならunknown", () => {
    expect(classifyWifi(null, homeOnly)).toBe("unknown");
  });

  it("端末のWi-Fiがオフならunknown", () => {
    expect(classifyWifi({ enabled: false, connected: false, ssid: null }, homeOnly)).toBe("unknown");
  });

  it("接続中だがWi-Fi名が読めない(権限不足)ならunknown", () => {
    expect(classifyWifi({ enabled: true, connected: true, ssid: null }, homeOnly)).toBe("unknown");
  });

  it("自宅Wi-Fiに接続中ならhome", () => {
    expect(classifyWifi({ enabled: true, connected: true, ssid: "home-wifi" }, homeOnly)).toBe("home");
  });

  it("別のWi-Fiに接続中ならother", () => {
    expect(classifyWifi({ enabled: true, connected: true, ssid: "cafe-wifi" }, homeOnly)).toBe("other");
  });

  it("Wi-Fiはオンだがどこにも接続していないならother", () => {
    expect(classifyWifi({ enabled: true, connected: false, ssid: null }, homeOnly)).toBe("other");
  });
});

describe("classifyWifi: 別の部屋のWi-Fi・複数登録", () => {
  const wifis = [
    { ssid: "home-2g", kind: "home" as const },
    { ssid: "home-5g", kind: "home" as const },
    { ssid: "room-303", kind: "room" as const },
  ];
  const on = (ssid: string) => ({ enabled: true, connected: true, ssid });
  it("自宅のWi-Fiを複数登録でき、どれでもhome", () => {
    expect(classifyWifi(on("home-2g"), wifis)).toBe("home");
    expect(classifyWifi(on("home-5g"), wifis)).toBe("home");
  });
  it("別の部屋のWi-Fiに接続中ならroom", () => {
    expect(classifyWifi(on("room-303"), wifis)).toBe("room");
  });
  it("登録していないWi-Fiならother", () => {
    expect(classifyWifi(on("cafe"), wifis)).toBe("other");
  });
  it("別の部屋のWi-Fiだけ登録している場合、それ以外は距離だけで判定(none)", () => {
    const roomOnly = [{ ssid: "room-303", kind: "room" as const }];
    expect(classifyWifi(on("room-303"), roomOnly)).toBe("room");
    expect(classifyWifi(on("cafe"), roomOnly)).toBe("none");
    expect(classifyWifi({ enabled: false, connected: false, ssid: null }, roomOnly)).toBe("none");
  });
});

describe("別の部屋のWi-Fiに接続中(room)は、距離に関係なく「近くにいる」", () => {
  it("在宅判定の範囲内・遠く・現在地なしのいずれでもnearby", () => {
    expect(judgeAutoStatus({ ...config, distanceM: 10, wifi: "room" })).toBe("nearby");
    expect(judgeAutoStatus({ ...config, distanceM: 800, wifi: "room" })).toBe("nearby");
    expect(judgeAutoStatus({ ...config, distanceM: null, wifi: "room" })).toBe("nearby");
  });
  it("ジオフェンスのイベントからの判定でもnearby", () => {
    expect(judgeFromGeofenceEvent({ regionId: "home", type: "enter" }, "room")).toBe("nearby");
  });
});

describe("judgeAutoStatus", () => {
  describe("自宅Wi-Fiが未登録・判定できない場合は、従来どおり距離だけで判定する", () => {
    it.each(["none", "unknown"] as const)("%s: 在宅判定の半径以内ならhome", (wifi) => {
      expect(judgeAutoStatus({ ...config, distanceM: 50, wifi })).toBe("home");
    });

    it.each(["none", "unknown"] as const)("%s: 施設内判定の半径以内ならnearby", (wifi) => {
      expect(judgeAutoStatus({ ...config, distanceM: 200, wifi })).toBe("nearby");
    });

    it.each(["none", "unknown"] as const)("%s: それより外ならaway", (wifi) => {
      expect(judgeAutoStatus({ ...config, distanceM: 500, wifi })).toBe("away");
    });

    it("現在地も取れなければ判定しない(null)", () => {
      expect(judgeAutoStatus({ ...config, distanceM: null, wifi: "none" })).toBeNull();
    });
  });

  describe("自宅Wi-Fiが登録済みの場合", () => {
    it("自宅Wi-Fiに接続中なら、距離に関係なくhome(屋内でGPSがずれても在宅と判定する)", () => {
      expect(judgeAutoStatus({ ...config, distanceM: 50, wifi: "home" })).toBe("home");
      expect(judgeAutoStatus({ ...config, distanceM: 800, wifi: "home" })).toBe("home");
      expect(judgeAutoStatus({ ...config, distanceM: null, wifi: "home" })).toBe("home");
    });

    it("自宅Wi-Fiに接続していなければ、在宅判定の半径以内でもnearby(1Fロビー等)", () => {
      expect(judgeAutoStatus({ ...config, distanceM: 10, wifi: "other" })).toBe("nearby");
    });

    it("自宅Wi-Fiに接続しておらず、施設内判定の半径以内ならnearby", () => {
      expect(judgeAutoStatus({ ...config, distanceM: 250, wifi: "other" })).toBe("nearby");
    });

    it("自宅Wi-Fiに接続しておらず、施設内判定の半径より外ならaway", () => {
      expect(judgeAutoStatus({ ...config, distanceM: 500, wifi: "other" })).toBe("away");
    });

    it("自宅Wi-Fiに接続しておらず、現在地も取れなければ判定しない(null)", () => {
      expect(judgeAutoStatus({ ...config, distanceM: null, wifi: "other" })).toBeNull();
    });
  });
});

describe("judgeAutoStatus: 別の階・別の部屋を区別する厳密モード", () => {
  it("自宅Wi-Fiがオフ・読めない場合、厳密モードなら自宅の範囲内でも施設内", () => {
    expect(judgeAutoStatus({ ...config, distanceM: 10, wifi: "unknown", strictWifi: true })).toBe("nearby");
  });
  it("厳密モードでなければ従来どおり距離で在宅", () => {
    expect(judgeAutoStatus({ ...config, distanceM: 10, wifi: "unknown", strictWifi: false })).toBe("home");
  });
  it("厳密モードでも、自宅Wi-Fiにつながっていれば在宅・遠ければ外出", () => {
    expect(judgeAutoStatus({ ...config, distanceM: 10, wifi: "home", strictWifi: true })).toBe("home");
    expect(judgeAutoStatus({ ...config, distanceM: 800, wifi: "unknown", strictWifi: true })).toBe("away");
  });
  it("Wi-Fi未登録(none)なら厳密モードでも距離だけで判定", () => {
    expect(judgeAutoStatus({ ...config, distanceM: 10, wifi: "none", strictWifi: true })).toBe("home");
  });
});

describe("judgeFromGeofenceEvent(現在地が取れなかったときの、範囲の出入りからの判定)", () => {
  it("自宅の範囲に入った → 在宅", () => {
    expect(judgeFromGeofenceEvent({ regionId: "home", type: "enter" }, "none")).toBe("home");
  });

  it("自宅の範囲に入ったが、登録済みの自宅Wi-Fiにつながっていない → 施設内", () => {
    expect(judgeFromGeofenceEvent({ regionId: "home", type: "enter" }, "other")).toBe("nearby");
  });

  it("厳密モード: Wi-Fiの状態が分からない(オフ等)なら、自宅の範囲に入っても施設内", () => {
    expect(judgeFromGeofenceEvent({ regionId: "home", type: "enter" }, "unknown", true)).toBe("nearby");
    expect(judgeFromGeofenceEvent({ regionId: "home", type: "enter" }, "unknown")).toBe("home");
  });

  it("自宅の範囲から出た → 施設内", () => {
    expect(judgeFromGeofenceEvent({ regionId: "home", type: "exit" }, "none")).toBe("nearby");
  });

  it("建物の範囲に入った → 施設内", () => {
    expect(judgeFromGeofenceEvent({ regionId: "building", type: "enter" }, "unknown")).toBe("nearby");
  });

  it("建物の範囲から出た → 外出中", () => {
    expect(judgeFromGeofenceEvent({ regionId: "building", type: "exit" }, "none")).toBe("away");
  });

  it("自宅Wi-Fiにつながっていれば、イベントに関係なく在宅", () => {
    expect(judgeFromGeofenceEvent({ regionId: "building", type: "exit" }, "home")).toBe("home");
  });
});

describe("shouldSendStatus(サーバー上の状態と比べて送るかどうか)", () => {
  it("サーバー上の状態と同じなら送らない", () => {
    expect(shouldSendStatus("home", "home")).toBe(false);
  });

  it("手動で外出中に変えた後に帰宅した場合は送る(端末の前回値が在宅のままでもサーバーと比べる)", () => {
    expect(shouldSendStatus("home", "away")).toBe(true);
  });

  it("サーバー上の状態が分からなければ送る", () => {
    expect(shouldSendStatus("nearby", null)).toBe(true);
  });

  it("判定できなかった(null)なら送らない", () => {
    expect(shouldSendStatus(null, "away")).toBe(false);
  });
});

describe("judgeWifiOnly(位置情報を使わない判定)", () => {
  it("自宅Wi-Fiに接続中なら在宅", () => {
    expect(judgeWifiOnly("home")).toBe("home");
  });

  it("別の部屋のWi-Fiなら施設内", () => {
    expect(judgeWifiOnly("room")).toBe("nearby");
  });

  it("自宅Wi-Fiにつながっていない(切断・登録外のWi-Fi)なら外出", () => {
    expect(judgeWifiOnly("other")).toBe("away");
    // 切断された状態は、自宅Wi-Fi登録済みなら other に分類される
    expect(judgeWifiOnly(classifyWifi({ enabled: true, connected: false, ssid: null }, homeOnly))).toBe("away");
  });

  it("Wi-Fiがオフ・名前が読めない・未登録のときは判断せず、状態を変えない", () => {
    expect(judgeWifiOnly("unknown")).toBeNull();
    expect(judgeWifiOnly("none")).toBeNull();
    expect(judgeWifiOnly(classifyWifi({ enabled: false, connected: false, ssid: null }, homeOnly))).toBeNull();
  });
});
