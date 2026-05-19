import { config } from "./config.js";
import type { OneBotMessageEvent } from "./onebot.js";
import { resolveBotQqId } from "./group-reply-policy.js";

export interface GroupChatLine {
  userId: string;
  nick: string;
  text: string;
  at: number;
}

interface GroupState {
  lines: GroupChatLine[];
  lastReplyAt: number;
  lastPeriodicAt: number;
}

const states = new Map<number, GroupState>();

function getState(groupId: number): GroupState {
  let s = states.get(groupId);
  if (!s) {
    s = { lines: [], lastReplyAt: 0, lastPeriodicAt: 0 };
    states.set(groupId, s);
  }
  return s;
}

export function recordGroupLine(
  groupId: number,
  event: OneBotMessageEvent,
  text: string,
): void {
  const botId = resolveBotQqId(event);
  if (botId && String(event.user_id) === botId) return;

  const s = getState(groupId);
  const nick =
    event.sender?.card || event.sender?.nickname || String(event.user_id);
  s.lines.push({
    userId: String(event.user_id),
    nick,
    text,
    at: Date.now(),
  });
  if (s.lines.length > config.groupHistoryLimit) {
    s.lines.splice(0, s.lines.length - config.groupHistoryLimit);
  }
}

export function markGroupReplied(groupId: number, periodic: boolean): void {
  const s = getState(groupId);
  const now = Date.now();
  s.lastReplyAt = now;
  if (periodic) s.lastPeriodicAt = now;
}

export function getRecentLines(
  groupId: number,
  maxAgeMs = 20 * 60 * 1000,
): GroupChatLine[] {
  const cutoff = Date.now() - maxAgeMs;
  return getState(groupId).lines.filter((l) => l.at >= cutoff);
}

export function formatGroupContext(groupId: number, maxLines = 12): string {
  const lines = getRecentLines(groupId).slice(-maxLines);
  if (lines.length === 0) return "";
  return lines.map((l) => `${l.nick}：${l.text}`).join("\n");
}

export function getActiveGroupIds(): number[] {
  return [...states.keys()];
}

/** 定时扫群：取近期最后一条有效发言（非 [图片]） */
export function pickLineForPeriodicReply(
  groupId: number,
): GroupChatLine | null {
  const lines = getRecentLines(groupId, config.groupProactiveIntervalMs).filter(
    (l) => l.text && l.text !== "[图片]" && l.text.length >= 1,
  );
  if (lines.length === 0) return null;
  return lines[lines.length - 1]!;
}

export function shouldRunPeriodicNow(groupId: number): boolean {
  const s = getState(groupId);
  return Date.now() - s.lastPeriodicAt >= config.groupProactiveIntervalMs;
}
