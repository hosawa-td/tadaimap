# タダイマップ（アプリ）

React Native (Expo) 製のスマートフォンアプリ本体。

## セットアップ

```bash
npm ci
cp .env.example .env
# .env の EXPO_PUBLIC_API_BASE_URL に、起動中のAPIサーバーのURLを設定する
npm start
```

Expo Goアプリ、またはAndroid/iOSシミュレータで動作確認できます。

## テスト

```bash
npm test
```

API通信・在宅表示のロジックなど、UIを介さないテストのみを含みます（`tests/`）。
画面の見た目・操作感の確認は、`test-runner`または実機での動作確認で行ってください。
