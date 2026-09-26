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
import { WebPushSender, NoopWebPushSender, VapidWebPushSender, WebPushSubscription } from "./webpush";
import { Member, MemberView, PresenceStatus } from "./types";
import {
  isValidBuildingRadius,
  isValidDeviceId,
  isValidHomeDetail,
  isValidInviteCode,
  isValidLatLng,
  isValidName,
  isValidNearbyLabel,
  isValidRadius,
  isValidStatus,
  isValidWebPushSubscription,
  NEARBY_LABEL_DEFAULT,
} from "./validation";

function getDeviceId(req: Request): string | undefined {
  const fromBody = req.body?.deviceId;
  const fromHeader = req.header("x-device-id");
  return fromBody ?? fromHeader ?? undefined;
}

function toMemberView(
  member: Member,
  requesterDeviceId: string | undefined,
  groupMembers: Member[],
  groupNearbyLabel: string
): MemberView {
  const isMe = member.deviceId === requesterDeviceId;
  const nameOrAnonymous = isMe || member.showName ? member.name : "メンバー";
  return {
    memberId: member.memberId,
    nameOrAnonymous,
    isMe,
    status: member.status,
    statusUpdatedAt: member.statusUpdatedAt,
    nearbyLabel: groupNearbyLabel,
    homeDetail: member.homeDetail,
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

export function createApp(
  repository: Repository,
  pushSender: PushSender,
  webPushSender: WebPushSender = new NoopWebPushSender()
) {
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
        nearbyLabel: group.nearbyLabel,
        members: members.map((m) => toMemberView(m, deviceId, members, group.nearbyLabel)),
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
      // 通知の送信に失敗しても、既に保存済みの状態更新自体は成功として返す
      try {
        const group = await repository.getGroup(member.groupId);
        await notifyGroupOfStatusChange(
          repository,
          pushSender,
          webPushSender,
          member,
          group?.nearbyLabel ?? NEARBY_LABEL_DEFAULT
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[notify] 状態変更の通知送信に失敗しました", err);
      }
      res.status(200).json({ ok: true });
    })
  );

  // F7: 名前・表示設定の変更
  app.patch(
    "/members/:memberId/profile",
    asyncHandler(async (req, res) => {
      const deviceId = getDeviceId(req);
      const { memberId } = req.params;
      const { name, showName } = req.body ?? {};
      if (!isValidDeviceId(deviceId)) {
        throw new AppError("VALIDATION_ERROR", "device_idは必須です");
      }
      if (name !== undefined && !isValidName(name)) {
        throw new AppError("VALIDATION_ERROR", "名前は1〜12文字で入力してください");
      }
      if (showName !== undefined && typeof showName !== "boolean") {
        throw new AppError("VALIDATION_ERROR", "show_nameはtrue/falseで指定してください");
      }
      await repository.updateProfile(memberId, deviceId, { name, showName });
      res.status(200).json({ ok: true });
    })
  );

  // 在宅中の詳細な状態(トイレ中など)の変更。本人のみ実行できる。
  app.patch(
    "/members/:memberId/home-detail",
    asyncHandler(async (req, res) => {
      const deviceId = getDeviceId(req);
      const { memberId } = req.params;
      const { homeDetail } = req.body ?? {};
      if (!isValidDeviceId(deviceId)) {
        throw new AppError("VALIDATION_ERROR", "device_idは必須です");
      }
      if (!isValidHomeDetail(homeDetail)) {
        throw new AppError("VALIDATION_ERROR", "詳細な状態は12文字以内で入力してください");
      }
      const member = await repository.updateHomeDetail(memberId, deviceId, homeDetail);
      res.status(200).json({ ok: true, homeDetail: member.homeDetail });
    })
  );

  // "nearby"ステータスの呼び方(グループ共通)の変更。管理者のみ実行できる。
  app.patch(
    "/groups/:groupId/nearby-label",
    asyncHandler(async (req, res) => {
      const deviceId = getDeviceId(req);
      const { groupId } = req.params;
      const { nearbyLabel } = req.body ?? {};
      if (!isValidDeviceId(deviceId)) {
        throw new AppError("VALIDATION_ERROR", "device_idは必須です");
      }
      if (!isValidNearbyLabel(nearbyLabel)) {
        throw new AppError("VALIDATION_ERROR", "呼び方は1〜12文字で入力してください");
      }
      const group = await repository.updateGroupNearbyLabel(groupId, deviceId, nearbyLabel);
      res.status(200).json({ ok: true, nearbyLabel: group.nearbyLabel });
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

  // プッシュ通知トークンの登録(ネイティブアプリ向け)
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

  // Web版のプッシュ通知(Web Push)を送るための公開鍵を返す
  app.get(
    "/push/vapid-public-key",
    (req, res) => {
      res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null });
    }
  );

  // Web版のプッシュ通知(Web Push)の購読情報の登録・解除
  app.patch(
    "/members/:memberId/web-push-subscription",
    asyncHandler(async (req, res) => {
      const deviceId = getDeviceId(req);
      const { memberId } = req.params;
      const { subscription } = req.body ?? {};
      if (!isValidDeviceId(deviceId)) {
        throw new AppError("VALIDATION_ERROR", "device_idは必須です");
      }
      if (subscription !== null && !isValidWebPushSubscription(subscription)) {
        throw new AppError("VALIDATION_ERROR", "subscriptionの形式が不正です");
      }
      await repository.updateWebPushSubscription(
        memberId,
        deviceId,
        subscription === null ? null : JSON.stringify(subscription)
      );
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

  // F11: グループからの退出。管理者が自分以外のメンバーを削除する場合もこのエンドポイントを使う。
  app.delete(
    "/members/:memberId",
    asyncHandler(async (req, res) => {
      const deviceId = getDeviceId(req);
      const { memberId } = req.params;
      if (!isValidDeviceId(deviceId)) {
        throw new AppError("VALIDATION_ERROR", "device_idは必須です");
      }
      const target = await repository.getMemberById(memberId);
      if (!target) {
        throw new AppError("NOT_FOUND", "メンバーが見つかりません");
      }
      if (target.deviceId === deviceId) {
        await repository.leaveGroup(memberId, deviceId);
      } else {
        await repository.removeMember(memberId, deviceId);
      }
      res.status(200).json({ ok: true });
    })
  );

  // 管理者によるグループ自体の削除(所属メンバー全員も削除される)
  app.delete(
    "/groups/:groupId",
    asyncHandler(async (req, res) => {
      const deviceId = getDeviceId(req);
      const { groupId } = req.params;
      if (!isValidDeviceId(deviceId)) {
        throw new AppError("VALIDATION_ERROR", "device_idは必須です");
      }
      await repository.deleteGroup(groupId, deviceId);
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
  webPushSender: WebPushSender,
  member: Member,
  nearbyLabel: string
): Promise<void> {
  const groupMembers = await repository.getMembersByGroup(member.groupId);
  const label = member.showName ? member.name : "家族の誰か";
  const body =
    member.status === "home"
      ? `${label}が帰宅しました`
      : member.status === "nearby"
      ? `${label}が${nearbyLabel}に移動しました`
      : `${label}が外出しました`;
  const targets = groupMembers.filter((m) => m.memberId !== member.memberId && m.notifyEnabled);
  const nativeTargets = targets.filter((m) => m.pushToken);
  const webTargets = targets.filter((m) => m.webPushSubscription);
  await Promise.all([
    pushSender.send(
      nativeTargets.map((m) => ({ to: m.pushToken as string, title: "タダイマップ", body }))
    ),
    webPushSender.send(
      webTargets.map((m) => ({
        subscription: JSON.parse(m.webPushSubscription as string) as WebPushSubscription,
        title: "タダイマップ",
        body,
      }))
    ),
  ]);
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

function buildProductionWebPushSender(): WebPushSender {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT) {
    return new VapidWebPushSender(VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT);
  }
  // eslint-disable-next-line no-console
  console.warn(
    "[起動] Web Push用の鍵(.env)が見つからないため、Web版へのプッシュ通知は送信されません。"
  );
  return new NoopWebPushSender();
}

/**
 * Vercel(Express向けのゼロコンフィグ実行)向けのデフォルトエクスポート。
 * ローカル開発でサーバーを起動する場合は index.ts (app.listen) を使う。
 * テストは名前付きエクスポートの createApp() を使い、依存関係を差し替える。
 */
export default createApp(buildProductionRepository(), new ExpoPushSender(), buildProductionWebPushSender());
