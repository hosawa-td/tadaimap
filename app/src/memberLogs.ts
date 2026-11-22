/** サーバーが返すログ1件(端末IDなどは含まない)。 */
export interface MemberLogEntry {
  at: string;
  origin: "client" | "server";
  event: string;
  detail: string;
}

export type LogKind = "status" | "technical";

export interface DescribedLog {
  at: string;
  /** 日本時間の日付(YYYY/MM/DD(曜)) */
  dateLabel: string;
  /** 日本時間の時刻(HH:mm:ss) */
  timeLabel: string;
  /** status=状態の履歴(状態の変化・無視された更新) / technical=技術的なログ */
  kind: LogKind;
  title: string;
  /** 補足(きっかけ・理由など)。無ければ空文字 */
  note: string;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 日本時間(+9時間)に直した日付・時刻の文字列を返す。端末の時間帯設定に左右されない。 */
export function formatJst(iso: string): { dateLabel: string; timeLabel: string } {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return { dateLabel: "日時不明", timeLabel: "" };
  const d = new Date(ms + 9 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    dateLabel: `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}(${WEEKDAYS[d.getUTCDay()]})`,
    timeLabel: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
  };
}

function parseDetail(detail: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(detail);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function statusName(value: unknown, nearbyLabel: string): string {
  if (value === "home") return "在宅";
  if (value === "nearby") return nearbyLabel;
  if (value === "away") return "外出中";
  return "不明";
}

const SOURCE_LABEL: Record<string, string> = { auto: "自動", manual: "手動" };
const TRIGGER_LABEL: Record<string, string> = {
  geofence: "位置の出入り",
  wifi: "Wi-Fi接続",
  periodic: "定期確認",
  foreground: "アプリを開いた",
  wifi_connect: "Wi-Fi接続(ショートカット)",
  wifi_disconnect: "Wi-Fi切断(ショートカット)",
};
const WIFI_LABEL: Record<string, string> = {
  home: "自宅",
  room: "別の部屋",
  other: "他のWi-Fi・未接続",
  unknown: "不明",
  none: "未登録",
};
const POS_LABEL: Record<string, string> = {
  fresh: "取得",
  lastKnown: "直近の記録",
  none: "取得できず",
  skipped: "取得せず",
};
const SENT_LABEL: Record<string, string> = { ok: "送信", same: "変更なし", error: "失敗" };
const IGNORE_REASON_LABEL: Record<string, string> = {
  same_status: "すでに同じ状態",
  duplicate: "直前の重複",
  flip_flop: "直前の変更から60秒以内の外出",
};

function join(parts: (string | undefined)[], separator: string): string {
  return parts.filter((p): p is string => !!p).join(separator);
}

function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}秒`;
  if (sec < 3600) return `${Math.floor(sec / 60)}分`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return m > 0 ? `${h}時間${m}分` : `${h}時間`;
}

/** ログ1件を、画面に出す文章にする。 */
export function describeLog(entry: MemberLogEntry, nearbyLabel: string): DescribedLog {
  const { dateLabel, timeLabel } = formatJst(entry.at);
  const base = { at: entry.at, dateLabel, timeLabel };
  const d = parseDetail(entry.detail);

  if (entry.event === "status_change" && d) {
    const source = str(d.source);
    const trigger = str(d.trigger);
    const elapsed = typeof d.sinceLastChangeSec === "number" ? `前回の変更から${formatElapsed(d.sinceLastChangeSec)}` : undefined;
    return {
      ...base,
      kind: "status",
      title: `${statusName(d.from, nearbyLabel)} → ${statusName(d.to, nearbyLabel)}`,
      note: join(
        [
          d.byAdmin === true ? "管理者による変更" : source ? SOURCE_LABEL[source] ?? source : undefined,
          trigger ? TRIGGER_LABEL[trigger] ?? trigger : undefined,
          elapsed,
        ],
        " ・ "
      ),
    };
  }

  if (entry.event === "status_ignored" && d) {
    const reason = str(d.reason);
    const trigger = str(d.trigger);
    return {
      ...base,
      kind: "status",
      title: `無視：${statusName(d.to, nearbyLabel)}への自動更新`,
      note: join(
        [
          `理由：${reason ? IGNORE_REASON_LABEL[reason] ?? reason : "不明"}`,
          trigger ? TRIGGER_LABEL[trigger] ?? trigger : undefined,
        ],
        " ・ "
      ),
    };
  }

  if (entry.event === "auto_check" && d) {
    const trigger = str(d.trigger);
    const mode = d.mode === "wifi_only" ? "Wi-Fiのみ" : "位置情報あり";
    const wifi = str(d.wifi);
    const pos = str(d.pos);
    const sent = str(d.sent);
    const judged = str(d.judged);
    const dist = typeof d.distM === "number" ? `(${d.distM}m)` : "";
    return {
      ...base,
      kind: "technical",
      title: `自動判定（${trigger ? TRIGGER_LABEL[trigger] ?? trigger : "不明"}・${mode}）`,
      note: join(
        [
          `Wi-Fi：${wifi ? WIFI_LABEL[wifi] ?? wifi : "不明"}${d.wifiOn === false ? "（端末のWi-Fiはオフ）" : ""}`,
          pos ? `位置：${POS_LABEL[pos] ?? pos}${dist}` : undefined,
          d.geo ? `範囲の出入り：${String(d.geo)}` : undefined,
          `判定：${judged && judged !== "none" ? statusName(judged, nearbyLabel) : "判断できず"}`,
          sent ? `結果：${SENT_LABEL[sent] ?? sent}` : undefined,
          str(d.err) ? `エラー：${str(d.err)}` : undefined,
        ],
        " ／ "
      ),
    };
  }

  // それ以外(boot・hidden・gap・task_errorなど)は、そのまま技術的なログとして出す
  return {
    ...base,
    kind: "technical",
    title: entry.event,
    note: entry.detail.length > 200 ? `${entry.detail.slice(0, 200)}…` : entry.detail,
  };
}

export interface LogDayGroup {
  dateLabel: string;
  items: DescribedLog[];
}

/** 新しい順のログを、日付ごとにまとめる(各日の中も新しい順)。onlyStatus=trueなら状態の履歴だけ。 */
export function groupLogsByDay(
  entries: MemberLogEntry[],
  nearbyLabel: string,
  options: { onlyStatus?: boolean } = {}
): LogDayGroup[] {
  const groups: LogDayGroup[] = [];
  const sorted = [...entries].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  for (const entry of sorted) {
    const described = describeLog(entry, nearbyLabel);
    if (options.onlyStatus && described.kind !== "status") continue;
    const last = groups[groups.length - 1];
    if (last && last.dateLabel === described.dateLabel) {
      last.items.push(described);
    } else {
      groups.push({ dateLabel: described.dateLabel, items: [described] });
    }
  }
  return groups;
}
