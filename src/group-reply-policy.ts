import { config } from "./config.js";
import { formatGroupContext } from "./group-context.js";
import { parseHashQuery } from "./hash-query.js";
import type { OneBotMessageEvent } from "./onebot.js";

export type GroupReplyReason = "mention" | "periodic";

export interface GroupReplyDecision {
  shouldReply: boolean;
  reason?: GroupReplyReason;
  contextBlock?: string;
}

/** 解析机器人 QQ：优先 .env，其次 OneBot 事件里的 self_id */
export function resolveBotQqId(event?: OneBotMessageEvent): string {
  if (config.botQqId) return config.botQqId;
  if (event?.self_id) return String(event.self_id);
  return "";
}

export function messageMentionsBot(event: OneBotMessageEvent): boolean {
  const botId = resolveBotQqId(event);
  const raw = event.raw_message ?? "";

  if (Array.isArray(event.message)) {
    const atSegs = event.message.filter((s) => s.type === "at");
    if (atSegs.length === 0) return false;
    if (!botId) return true;
    return atSegs.some(
      (s) => s.data?.qq === botId || s.data?.qq === String(event.self_id),
    );
  }

  if (typeof event.message === "string") {
    if (botId && event.message.includes(`@${botId}`)) return true;
    if (botId && event.message.includes(`[CQ:at,qq=${botId}]`)) return true;
  }

  if (botId && raw.includes(`[CQ:at,qq=${botId}]`)) return true;
  if (raw.includes("[CQ:at,")) {
    if (!botId) return true;
    return raw.includes(`qq=${botId}`);
  }

  return false;
}

function isBotSelf(event: OneBotMessageEvent): boolean {
  const botId = resolveBotQqId(event);
  return Boolean(botId && String(event.user_id) === botId);
}

/** 群消息：@ 或 # 教学模式 时立刻回复（无任何冷却） */
export function evaluateGroupReply(
  event: OneBotMessageEvent,
  text: string,
): GroupReplyDecision {
  if (event.message_type !== "group" || event.group_id === undefined) {
    return { shouldReply: true };
  }

  const groupId = event.group_id;

  if (isBotSelf(event)) {
    return { shouldReply: false };
  }

  if (messageMentionsBot(event)) {
    return {
      shouldReply: true,
      reason: "mention",
      contextBlock: formatGroupContext(groupId, 12),
    };
  }

  if (parseHashQuery(text).isHashMode) {
    return {
      shouldReply: true,
      reason: "mention",
      contextBlock: formatGroupContext(groupId, 12),
    };
  }

  return { shouldReply: false };
}

export function isProactiveReason(reason?: GroupReplyReason): boolean {
  return reason === "periodic";
}
