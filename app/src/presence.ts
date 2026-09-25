import { MemberView } from "./api";

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

export function statusLabel(member: MemberView): string {
  if (member.status === "home") return "在宅";
  if (member.status === "nearby") return member.nearbyLabel;
  return "外出中";
}

export function formatStatusLine(member: MemberView): string {
  const time = formatTime(member.statusUpdatedAt);
  if (member.status === "home") return `在宅 · ${time}に帰宅`;
  if (member.status === "nearby") return `${member.nearbyLabel} · ${time}から`;
  return `外出中 · ${time}に外出`;
}

/** 在宅中に本人が設定した詳細な状態(例:「トイレ中」)。無ければnull。 */
export function homeDetailText(member: MemberView): string | null {
  if (member.status !== "home" || !member.homeDetail) return null;
  const trimmed = member.homeDetail.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function countHome(members: MemberView[]): { home: number; total: number } {
  return {
    home: members.filter((m) => m.status === "home").length,
    total: members.length,
  };
}

export function summaryText(members: MemberView[]): string {
  const { home, total } = countHome(members);
  return `現在${home}/${total}人 在宅中`;
}
