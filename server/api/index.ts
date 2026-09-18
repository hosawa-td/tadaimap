import dotenv from "dotenv";
dotenv.config();

import { createApp } from "../src/app";
import { MemoryRepository } from "../src/repository.memory";
import { SheetsRepository } from "../src/repository.sheets";
import { ExpoPushSender } from "../src/push";
import { Repository } from "../src/repository";

function buildRepository(): Repository {
  const { GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = process.env;
  if (GOOGLE_SHEET_ID && GOOGLE_SERVICE_ACCOUNT_EMAIL && GOOGLE_PRIVATE_KEY) {
    return new SheetsRepository(GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY);
  }
  return new MemoryRepository();
}

// Vercel(Node.js Serverless Functions)のエントリーポイント。
// Expressアプリはそのまま (req, res) ハンドラーとして利用できる。
export default createApp(buildRepository(), new ExpoPushSender());
