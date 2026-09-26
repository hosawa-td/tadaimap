# タダイマップ API設計書

APIサーバーが提供するエンドポイント一覧。すべてスプレッドシート（`Groups`・`Members`）への読み書きを前提とする。

## 認証方式について

ログイン画面を持たない方針のため、パスワード等による認証は行わない。代わりに、アプリの初回起動時に生成する**端末ID（`device_id`）**を、各リクエストのヘッダー（`X-Device-Id`）に付与して送信し、サーバー側は`device_id`と`member_id`の組み合わせが一致するリクエストのみを許可する。

> 本格的なセキュリティ（なりすまし防止）が必要になった場合は、`migration`フェーズでの本番DB移行時にトークン方式へ強化することを検討する。

## エンドポイント一覧

### 1. `POST /groups` — 家族グループの作成（F1）

- リクエスト：`{ "device_id": string, "name": string }`
- レスポンス：`{ "group_id": string, "member_id": string, "invite_code": string, "invite_code_expires_at": string }`
- 処理：`Groups`に新規行を追加（招待コード発行、有効期限=現在時刻+7日）。`Members`に自分を1件追加。

### 2. `POST /groups/join` — 招待コードでの参加（F2・F18）

- リクエスト：`{ "device_id": string, "invite_code": string, "name": string }`
- レスポンス：`{ "group_id": string, "member_id": string }`
- エラー：招待コードが存在しない／期限切れ → `404 CODE_NOT_FOUND` または `410 CODE_EXPIRED`。**同じグループ**に既に参加済みの`device_id` → `409 ALREADY_JOINED`（別のグループへの参加は妨げない。1台の端末が複数グループに参加できるため）
- 処理：`Groups`から該当コードを検索し、有効期限内かつ同一グループへの重複でなければ`Members`に新規行を追加。

### 3. `GET /groups/:groupId/members` — メンバー一覧取得（F5）

- リクエスト：ヘッダーに`device_id`
- レスポンス：`{ "inviteCode": string, "nearbyLabel": string, "members": [{ "memberId", "nameOrAnonymous", "isMe", "status": "home"|"nearby"|"away", "statusUpdatedAt", "nearbyLabel", "homeDetail", "isAdmin", "home": { "lat", "lng", "homeRadiusM", "buildingRadiusM" } | null }] }`
- 処理：`Members`から該当`group_id`の行を取得。`show_name=FALSE`のメンバーは`name_or_anonymous`を`"メンバー"`とする（本人の行のみ常に本名）。各メンバーの`nearbyLabel`は個人設定ではなく、トップレベルの`nearbyLabel`（グループ共通、F13）と同じ値を複製して返す。`isAdmin`はグループ作成者かどうか（既存データとの互換性のため、`is_admin`列が無い古いグループでは作成日時が最も古いメンバーを管理者とみなす）。`home`は自宅位置・判定範囲が登録済みの場合のみ値を持ち、**他メンバーの位置情報を見せないため`isMe`の行にしか入らない**（Web版の画面を開いた瞬間の簡易自動判定、F22で使用）。

### 4. `PATCH /members/:memberId/home` — 自宅位置・判定範囲の登録/変更（F3・F8・F22）

- リクエスト：`{ "device_id": string, "homeLat": number, "homeLng": number, "homeRadiusM": number, "buildingRadiusM": number }`
- レスポンス：`{ "ok": true }`
- エラー：`buildingRadiusM`が100〜2000mの範囲外、または`homeRadiusM`未満の場合は`400 VALIDATION_ERROR`
- 処理：該当`Members`行の`home_lat`/`home_lng`/`home_radius_m`/`building_radius_m`を更新。Web版（F22）も、地図やスライダーを持たない簡易UIから同じエンドポイントを呼び出す（判定範囲は初期値の100m・300mで固定）。

### 5. `PATCH /members/:memberId/status` — ステータスの更新（F4・F6・F12）

- リクエスト：`{ "device_id": string, "status": "home" | "nearby" | "away", "source": "auto" | "manual" }`
- レスポンス：`{ "ok": true }`
- 権限：`device_id`が対象メンバー本人のものでなくても、同じグループの管理者（F12）であれば実行できる（それ以外は`403 FORBIDDEN`）
- 処理：`status`・`status_updated_at`を更新し、`home_detail`（F16）を空にリセットする。更新後、同グループの他メンバーのうち`notify_enabled=TRUE`の端末へ、ネイティブアプリには`push_token`を用いてExpo Push Notification Service経由、Web版には`web_push_subscription`を用いてWeb Push（VAPID）経由で、それぞれ独立に通知を送信する。通知の送信に失敗しても、本エンドポイントのレスポンスは`200 OK`のまま返す（状態更新自体は成立しているため）。

### 6. `PATCH /members/:memberId/profile` — 名前・表示設定の変更（F7）

- リクエスト：`{ "device_id": string, "name"?: string, "show_name"?: boolean }`
- レスポンス：`{ "ok": true }`
- 備考：「呼び方」（旧`nearby_label`）はグループ共通設定（F13）に分離されたため、本エンドポイントでは扱わない。

### 7. `PATCH /groups/:groupId/nearby-label` — 呼び方の変更（F13）

- リクエスト：`{ "device_id": string, "nearbyLabel": string }`（1〜12文字）
- レスポンス：`{ "ok": true, "nearbyLabel": string }`
- 権限：グループの管理者のみ（それ以外は`403 FORBIDDEN`）
- 処理：`Groups`行の`nearby_label`を更新。以後、全メンバーの一覧・通知文言に反映される。

### 8. `PATCH /members/:memberId/home-detail` — 在宅中の詳細な状態の変更（F16）

- リクエスト：`{ "device_id": string, "homeDetail": string }`（0〜12文字、空文字で未設定に戻す）
- レスポンス：`{ "ok": true, "homeDetail": string }`
- 権限：本人のみ（管理者による代理変更は不可）
- 処理：`Members`行の`home_detail`を更新。ステータス変更時（エンドポイント5）に自動的に空へリセットされる。

### 9. `PATCH /members/:memberId/notify` — 通知設定の変更（F9）

- リクエスト：`{ "device_id": string, "notify_enabled": boolean }`
- レスポンス：`{ "ok": true }`

### 10. `PATCH /members/:memberId/push-token` — ネイティブアプリのプッシュ通知トークンの登録

- リクエスト：`{ "device_id": string, "push_token": string }`
- レスポンス：`{ "ok": true }`
- 処理：アプリ起動時・通知許可取得時に呼び出し、`push_token`（Expo Push Token）を保存する。

### 11. `GET /push/vapid-public-key` — Web Push用の公開鍵取得（F15）

- リクエスト：なし
- レスポンス：`{ "publicKey": string | null }`（サーバー側にVAPID鍵が未設定の場合は`null`）
- 処理：Web版がブラウザのPush APIで購読を作成する際に使用する公開鍵を返す。認証不要（公開情報のため）。

### 12. `PATCH /members/:memberId/web-push-subscription` — Web Push購読情報の登録・解除（F15）

- リクエスト：`{ "device_id": string, "subscription": { "endpoint": string, "keys": { "p256dh": string, "auth": string } } | null }`
- レスポンス：`{ "ok": true }`
- 処理：`subscription`をJSON文字列化して`Members`行の`web_push_subscription`に保存する（`null`で解除）。形式が不正な場合は`400 VALIDATION_ERROR`。

### 13. `POST /groups/:groupId/invite-code/refresh` — 招待コードの再発行（F10）

- リクエスト：`{ "device_id": string }`
- レスポンス：`{ "invite_code": string, "invite_code_expires_at": string }`
- 処理：新しい6桁コードを発行し、有効期限を現在時刻+7日に更新（古いコードは無効化）。

### 14. `DELETE /members/:memberId` — グループからの退出／管理者によるメンバー削除（F11・F19）

- リクエスト：ヘッダーに`device_id`
- レスポンス：`{ "ok": true }`
- 権限：`device_id`が対象メンバー本人のものであれば無条件に許可（退出）。本人以外の場合は、同じグループの管理者であることを確認し、許可する（管理者によるメンバー削除。それ以外は`403 FORBIDDEN`）
- 処理：該当`Members`行を削除。削除の結果、そのグループの`Members`が0件になった場合は`Groups`の該当行も削除する。

### 15. `DELETE /groups/:groupId` — グループの削除（F20）

- リクエスト：ヘッダーに`device_id`
- レスポンス：`{ "ok": true }`
- 権限：グループの管理者のみ（それ以外は`403 FORBIDDEN`）
- 処理：該当グループに属する`Members`行をすべて削除したうえで、`Groups`の該当行も削除する。

### 16. `GET /memberships` — この端末が参加しているグループの一覧取得（F18）

- リクエスト：ヘッダーに`device_id`
- レスポンス：`{ "memberships": [{ "groupId": string, "memberId": string, "myName": string, "inviteCode": string | null }] }`
- 処理：`Members`シートを`device_id`で検索し、該当する全行（複数グループに参加している場合は複数件）について、それぞれの`group_id`から招待コードを引いて返す。端末内の保存内容（キャッシュ）をこの結果で置き換えるために使う（端末の保存領域が失われた場合の復元用。詳細はF18を参照）。

## Web版の配信について

上記に加え、APIサーバーは`express.static`により`server/public/`配下（`index.html`・`sw.js`・`manifest.json`・アイコン画像）を静的配信する。これらはJSON APIではなく、Web版（F14）のブラウザ画面・Service Worker本体・PWAメタデータである。

## 共通エラーレスポンス形式

```json
{ "error": { "code": "CODE_EXPIRED", "message": "招待コードの有効期限が切れています" } }
```
