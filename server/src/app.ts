import dotenv from "dotenv";
dotenv.config();

import path from "path";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { AppError } from "./errors";
import { isEffectiveAdmin, Repository } from "./repository";
import { MemoryRepository } from "./repository.memory";
import { SheetsRepository } from "./repository.sheets";
import { PushSender, ExpoPushSender } from "./push";
import { Member, MemberView, PresenceStatus } from "./types";
import {
  isValidBuildingRadius,
  isValidDeviceId,
  isValidInviteCode,
  isValidLatLng,
  isValidName,
  isValidNearbyLabel,
  isValidRadius,
  isValidStatus,
} from "./validation";

function getDeviceId(req: Request): string | undefined {
  const fromBody = req.body?.deviceId;
  const fromHeader = req.header("x-device-id");
  return fromBody ?? fromHeader ?? undefined;
}

function toMemberView(member: Member, requesterDeviceId: string | undefined, groupMembers: Member[]): MemberView {
  const isMe = member.deviceId === requesterDeviceId;
  const nameOrAnonymous = isMe || member.showName ? member.name : "メンバー";
  return {
    memberId: member.memberId,
    nameOrAnonymous,
    isMe,
    status: member.status,
    statusUpdatedAt: member.statusUpdatedAt,
    nearbyLabel: member.nearbyLabel,
    isAdmin: isEffectiveAdmin(member, groupMembers),
  };
}

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

export function createApp(repository: Repository, pushSender: PushSender) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  // ネイティブアプリを入れられない端末向けの簡易Web版(招待コード参加・一覧・手動更新のみ)
  app.use(express.static(path.join(__dirname, "..", "public")));

  // F1: 家族グループの作成
  app.post(
    "/groups",
    asyncHandler(async (req, res) => {
      const deviceId = getDeviceId(req);
      const { name } = req.body ?? {};
      if (!isValidDeviceId(deviceId)) {
        throw new AppError("VALIDATION_ERROR", "device_idは必須です");
      }
      if (!isValidName(name)) {
        throw new AppError("VALIDATION_ERROR", "名前は1〜12文字で入力してください");
      }
      const { group, member } = await repository.createGroup(deviceId, name);
      res.status(200).json({
        groupId: group.groupId,
        memberId: member.memberId,
        inviteCode: group.inviteCode,
        inviteCodeExpiresAt: group.inviteCodeExpiresAt,
      });
    })
  );

  // F2: 招待コードでのグループ参加
  app.post(
    "/groups/join",
    asyncHandler(async (req, res) => {
      const deviceId = getDeviceId(req);
      const { inviteCode, name } = req.body ?? {};
      if (!isValidDeviceId(deviceId)) {
        throw new AppError("VALIDATION_ERROR", "device_idは必須です");
      }
      if (!isValidInviteCode(inviteCode)) {
        throw new AppError("VALIDATION_ERROR", "招待コードは6桁の数字で入力してください");
      }
      if (!isValidName(name)) {
        throw new AppError("VALIDATION_ERROR", "名前は1〜12文字で入力してください");
      }
      const { group, member } = await repository.joinGroup(deviceId, inviteCode, name);
      res.status(200).json({ groupId: group.groupId, memberId: member.memberId });
    })
  );

  // F5: メンバー一覧取得
  app.get(
    "/groups/:groupId/members",
    asyncHandler(async (req, res) => {
      const deviceId = getDeviceId(req);
      const { groupId } = req.params;
      const group = await repository.getGroup(groupId);
      if (!group) {
        throw new AppError("NOT_FOUND", "グループが見つかりません");
      }
      const members = await repository.getMembersByGroup(groupId);
      res.status(200).json({
        inviteCode: group.inviteCode,
        members: members.map((m) => toMemberView(m, deviceId, members)),
      });
    })
  );

  // F3/F8: 自宅位置・判定範囲の登録/変更
  app.patch(
    "/members/:memberId/home",
    asyncHandler(async (req, res) => {
      const deviceId = getDeviceId(req);
      const { memberId } = req.params;
      const { homeLat, homeLng, homeRadiusM, buildingRadiusM } = req.body ?? {};
      if (!isValidDeviceId(deviceId)) {
        throw new AppError("VALIDATION_ERROR", "device_idは必須です");
      }
      if (!isValidLatLng(homeLat, homeLng)) {
        throw new AppError("VALIDATION_ERROR", "緯度・経度が不正です");
      }
      if (!isValidRadius(homeRadiusM)) {
        throw new AppError("VALIDATION_ERROR", "判定範囲は50m〜300mで指定してください");
      }
      if (!isValidBuildingRadius(buildingRadiusM, homeRadiusM)) {
        throw new AppError(
          "VALIDATION_ERROR",
          "施設内と判定する範囲は100m〜2000m、かつ自宅の範囲以上で指定してください"
        );
      }
      await repository.updateHome(memberId, deviceId, homeLat, homeLng, homeRadiusM, buildingRadiusM);
      res.status(200).json({ ok: true });
    })
  );

  // F4/F6: 在宅・不在ステータスの更新
  app.patch(
    "/members/:memberId/status",
    asyncHandler(async (req, res) => {
      const deviceId = getDeviceId(req);
      const { memberId } = req.params;
      const { status } = req.body ?? {};
      if (!isValidDeviceId(deviceId)) {
        throw new AppError("VALIDATION_ERROR", "device_idは必須です");
      }
      if (!isValidStatus(status)) {
        throw new AppError(
          "VALIDATION_ERROR",
          'statusは"home"・"nearby"・"away"のいずれかを指定してください'
        );
      }
      const member = await repository.updateStatus(memberId, deviceId, status as PresenceStatus);
      await notifyGroupOfStatusChange(repository, pushSender, member);
      res.status(200).json({ ok: true });
    })
  );

  // F7: 名前・表示設定の変更
  app.patch(
    "/members/:memberId/profile",
    asyncHandler(async (req, res) => {
      const deviceId = getDeviceId(req);
      const { memberId } = req.params;
      const { name, showName, nearbyLabel } = req.body ?? {};
      if (!isValidDeviceId(deviceId)) {
        throw new AppError("VALIDATION_ERROR", "device_idは必須です");
      }
      if (name !== undefined && !isValidName(name)) {
        throw new AppError("VALIDATION_ERROR", "名前は1〜12文字で入力してください");
      }
      if (showName !== undefined && typeof showName !== "boolean") {
        throw new AppError("VALIDATION_ERROR", "show_nameはtrue/falseで指定してください");
      }
      if (nearbyLabel !== undefined && !isValidNearbyLabel(nearbyLabel)) {
        throw new AppError("VALIDATION_ERROR", "呼び方は1〜12文字で入力してください");
      }
      await repository.updateProfile(memberId, deviceId, { name, showName, nearbyLabel });
      res.status(200).json({ ok: true });
    })
  );

  // F9: 通知設定の変更
  app.patch(
    "/members/:memberId/notify",
    asyncHandler(async (req, res) => {
      const deviceId = getDeviceId(req);
      const { memberId } = req.params;
      const { notifyEnabled } = req.body ?? {};
      if (!isValidDeviceId(deviceId)) {
        throw new AppError("VALIDATION_ERROR", "device_idは必須です");
      }
      if (typeof notifyEnabled !== "boolean") {
        throw new AppError("VALIDATION_ERROR", "notify_enabledはtrue/falseで指定してください");
      }
      await repository.updateNotify(memberId, deviceId, notifyEnabled);
      res.status(200).json({ ok: true });
    })
  );

  // プッシュ通知トークンの登録
  app.patch(
    "/members/:memberId/push-token",
    asyncHandler(async (req, res) => {
      const deviceId = getDeviceId(req);
      const { memberId } = req.params;
      const { pushToken } = req.body ?? {};
      if (!isValidDeviceId(deviceId)) {
        throw new AppError("VALIDATION_ERROR", "device_idは必須です");
      }
      if (typeof pushToken !== "string" || pushToken.trim().length === 0) {
        throw new AppError("VALIDATION_ERROR", "push_tokenは必須です");
      }
      await repository.updatePushToken(memberId, deviceId, pushToken);
      res.status(200).json({ ok: true });
    })
  );

  // F10: 招待コードの再発行
  app.post(
    "/groups/:groupId/invite-code/refresh",
    asyncHandler(async (req, res) => {
      const deviceId = getDeviceId(req);
      const { groupId } = req.params;
      if (!isValidDeviceId(deviceId)) {
        throw new AppError("VALIDATION_ERROR", "device_idは必須です");
      }
      const group = await repository.refreshInviteCode(groupId, deviceId);
      res.status(200).json({
        inviteCode: group.inviteCode,
        inviteCodeExpiresAt: group.inviteCodeExpiresAt,
      });
    })
  );

  // F11: グループからの退出
  app.delete(
    "/members/:memberId",
    asyncHandler(async (req, res) => {
      const deviceId = getDeviceId(req);
      const { memberId } = req.params;
      if (!isValidDeviceId(deviceId)) {
        throw new AppError("VALIDATION_ERROR", "device_idは必須です");
      }
      await repository.leaveGroup(memberId, deviceId);
      res.status(200).json({ ok: true });
    })
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "サーバーエラーが発生しました" } });
  });

  return app;
}

async function notifyGroupOfStatusChange(
  repository: Repository,
  pushSender: PushSender,
  member: Member
): Promise<void> {
  const groupMembers = await repository.getMembersByGroup(member.groupId);
  const label = member.showName ? member.name : "家族の誰か";
  const body =
    member.status === "home"
      ? `${label}が帰宅しました`
      : member.status === "nearby"
      ? `${label}が${member.nearbyLabel}に移動しました`
      : `${label}が外出しました`;
  const targets = groupMembers.filter(
    (m) => m.memberId !== member.memberId && m.notifyEnabled && m.pushToken
  );
  await pushSender.send(
    targets.map((m) => ({ to: m.pushToken as string, title: "タダイマップ", body }))
  );
}

function buildProductionRepository(): Repository {
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

/**
 * Vercel(Express向けのゼロコンフィグ実行)向けのデフォルトエクスポート。
 * ローカル開発でサーバーを起動する場合は index.ts (app.listen) を使う。
 * テストは名前付きエクスポートの createApp() を使い、依存関係を差し替える。
 */
export default createApp(buildProductionRepository(), new ExpoPushSender());
