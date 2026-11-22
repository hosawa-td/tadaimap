# タダイマップ（APIサーバー）

Node.js / Express製のAPIサーバー。Googleスプレッドシートを簡易データベースとして利用する。

## セットアップ

```bash
npm ci
cp .env.example .env
# .env にスプレッドシートID・サービスアカウントの情報を貼り付ける
npm run dev
```

`.env` を設定しない場合は、インメモリの簡易データで起動します（開発時の一時的な動作確認用）。

## テスト

```bash
npm test
```

インメモリのリポジトリを使い、API設計書のすべてのエンドポイント（正常系・主要な異常系）を検証します。

## 接続状況ログのクリア

スプレッドシートの「Logs」シートに溜まったログを、コマンドで消せます（`.env` のスプレッドシート設定が必要）。`--yes` を付けないときは、消す件数を表示するだけで、何も消しません。

```bash
npm run clear-logs -- --ios                   # iPhone(Web版・ショートカット)のログの件数を確認
npm run clear-logs -- --ios --yes             # iPhone(Web版・ショートカット)のログだけ消す
npm run clear-logs -- --android --yes         # Androidアプリのログだけ消す
npm run clear-logs -- --all --yes             # すべて消す
npm run clear-logs -- --ios --before 2026-11-20 --yes   # 指定日(日本時間)より前のiPhoneのログだけ消す
npm run clear-logs -- --member b3e7df12 --yes           # 指定メンバー(memberIdの先頭8文字以上)だけ消す
```

- 対象の指定は必須です。条件を複数指定すると、すべてに当てはまるログだけが対象になります。
- iPhone(Web版)は端末IDが `web-` で始まるかどうかで見分けます。見出し行は消しません。
- 消したログは、アプリからは戻せません（スプレッドシートの「版の履歴」からは復元できます）。

## 接続状況ログのローテート保存

毎日0:00（日本時間）に、Vercel の定期実行（Cron）が `GET /cron/rotate-logs` を呼び出し、「Logs」シートのログを、同じスプレッドシートの「`log_YYYYMMDD`」シートへ移して、「Logs」を空にします。あわせて、7日より前の「`log_YYYYMMDD`」シートを削除して、直近7日分だけを残します。

- 例：11/22 0:00 に実行すると `log_20261122` を作成し、`log_20261115` を削除します（残るのは `log_20261116`〜`log_20261122` の7つ）。シート名の日付は「保存した日」で、11/21 0:00〜11/22 0:00ごろのログが入ります。
- 保存先の行は、記録時刻の古い順です（項目は「Logs」と同じ）。同じ日に2回実行した場合は、同じシートの末尾に追記します。
- 保存先に書き込んだ行数を確認できてから、「Logs」の行を消します（確認できないときは消しません）。消すのは読み取った行だけなので、実行中に追加されたログは残ります。
- 削除の対象は `log_` + 8桁の数字のシートだけです（`Logs`・`Members`・`Groups` などには触れません）。
- 自動実行の設定は `server/vercel.json`（`0 15 * * *`＝日本時間の0:00）です。Vercel の無料プラン（Hobby）では、実行時刻が±1時間ほどずれます（0:00〜0:59のどこかで動きます）。
- 認証：Vercel の環境変数 `CRON_SECRET` を設定すると、Vercel が `Authorization: Bearer …` を付けて呼び出します。手動で実行するときは、`DIAG_TOKEN` を使います（下の例）。どちらも未設定なら無効です。合言葉は、チャットに貼らず、ご自身の端末で入力してください。

```powershell
# 確認だけ(何も変えない): 何件を保存し、どのシートを削除する予定か
curl.exe -H "x-diag-token: 合言葉" "https://tadaimap.vercel.app/cron/rotate-logs?dryRun=1"
# いますぐ実行する
curl.exe -H "x-diag-token: 合言葉" "https://tadaimap.vercel.app/cron/rotate-logs"
```
