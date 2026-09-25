// タダイマップ Web版 のプッシュ通知用Service Worker。
// このファイルはオリジン直下(/sw.js)に置くことで、サイト全体に対する
// プッシュ通知を受け取れるようにする。

self.addEventListener("push", function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    // 本文が無い/JSONでない場合は空のまま扱う
  }
  var title = data.title || "タダイマップ";
  var body = data.body || "";
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: body,
        icon: "/icon.png",
        badge: "/icon.png",
      }),
      // 画面を開いたままの場合は、通知と同時にその場で一覧を最新化させる
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
        clientList.forEach(function (client) {
          client.postMessage({ type: "tadaimap-refresh" });
        });
      }),
    ])
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("/");
    })
  );
});
