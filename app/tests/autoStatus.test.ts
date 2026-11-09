import {
  classifyWifi,
  distanceMeters,
  judgeAutoStatus,
  judgeFromGeofenceEvent,
  shouldSendStatus,
} from "../src/autoStatus";

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
    expect(classifyWifi({ enabled: true, connected: true, ssid: "home-wifi" }, null)).toBe("none");
  });

  it("Wi-Fiの状態が読めない(Android以外など)ならunknown", () => {
    expect(classifyWifi(null, "home-wifi")).toBe("unknown");
  });

  it("端末のWi-Fiがオフならunknown", () => {
    expect(classifyWifi({ enabled: false, connected: false, ssid: null }, "home-wifi")).toBe("unknown");
  });

  it("接続中だがWi-Fi名が読めない(権限不足)ならunknown", () => {
    expect(classifyWifi({ enabled: true, connected: true, ssid: null }, "home-wifi")).toBe("unknown");
  });

  it("自宅Wi-Fiに接続中ならhome", () => {
    expect(classifyWifi({ enabled: true, connected: true, ssid: "home-wifi" }, "home-wifi")).toBe("home");
  });

  it("別のWi-Fiに接続中ならother", () => {
    expect(classifyWifi({ enabled: true, connected: true, ssid: "cafe-wifi" }, "home-wifi")).toBe("other");
  });

  it("Wi-Fiはオンだがどこにも接続していないならother", () => {
    expect(classifyWifi({ enabled: true, connected: false, ssid: null }, "home-wifi")).toBe("other");
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

describe("judgeFromGeofenceEvent(現在地が取れなかったときの、範囲の出入りからの判定)", () => {
  it("自宅の範囲に入った → 在宅", () => {
    expect(judgeFromGeofenceEvent({ regionId: "home", type: "enter" }, "none")).toBe("home");
  });

  it("自宅の範囲に入ったが、登録済みの自宅Wi-Fiにつながっていない → 施設内", () => {
    expect(judgeFromGeofenceEvent({ regionId: "home", type: "enter" }, "other")).toBe("nearby");
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
