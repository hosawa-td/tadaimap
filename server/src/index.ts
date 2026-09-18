import dotenv from "dotenv";
dotenv.config();

import { createApp } from "./app";
import { MemoryRepository } from "./repository.memory";
import { SheetsRepository } from "./repository.sheets";
import { ExpoPushSender } from "./push";
import { Repository } from "./repository";

function buildRepository(): Repository {
  const { GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = process.env;
  if (GOOGLE_SHEET_ID && GOOGLE_SERVICE_ACCOUNT_EMAIL && GOOGLE_PRIVATE_KEY) {
    return new SheetsRepository(GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY);
  }
  // eslint-disable-next-line no-console
  console.warn(
    "[起動] Googleスプレッドシートの設定(.env)が見つからないため、インメモリの簡易データで起動します。"
  );
  return new MemoryRepository();
}

const app = createApp(buildRepository(), new ExpoPushSender());
const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`タダイマップ APIサーバーが起動しました: http://localhost:${port}`);
});
