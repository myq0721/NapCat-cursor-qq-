import { WebSocketServer, type WebSocket } from "ws";
import { config } from "./config.js";
import { formatReplyForQQ } from "./reply-format.js";

export interface OneBotMessageEvent {
  post_type: "message";
  message_type: "private" | "group";
  sub_type?: string;
  message_id: number;
  user_id: number;
  self_id?: number;
  group_id?: number;
  raw_message?: string;
  message: string | Array<{ type: string; data?: Record<string, string> }>;
  sender?: { nickname?: string; card?: string };
}

type MessageHandler = (event: OneBotMessageEvent) => void | Promise<void>;

function parseMessageText(
  message: OneBotMessageEvent["message"],
  raw?: string,
): string {
  if (typeof raw === "string" && raw.length > 0) return raw;
  if (typeof message === "string") return message;
  return message
    .map((seg) => {
      if (seg.type === "text") return seg.data?.text ?? "";
      if (seg.type === "at") return `@${seg.data?.qq ?? ""}`;
      if (seg.type === "face") return `[表情]`;
      if (seg.type === "image") return `[图片]`;
      return "";
    })
    .join("")
    .trim();
}

export function messageMentionsBot(event: OneBotMessageEvent): boolean {
  if (!config.botQqId) return true;
  const botId = config.botQqId;
  if (typeof event.message === "string") {
    return event.message.includes(`@${botId}`);
  }
  return event.message.some((seg) => seg.type === "at" && seg.data?.qq === botId);
}

function stripBotAt(text: string): string {
  if (!config.botQqId) return text;
  return text.replace(new RegExp(`@?${config.botQqId}\\s*`, "g"), "").trim();
}

export function normalizeIncomingText(event: OneBotMessageEvent): string {
  const text = parseMessageText(event.message, event.raw_message);
  return event.message_type === "group" ? stripBotAt(text) : text;
}

async function callOneBotApi(
  action: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.onebotToken) {
    headers.Authorization = `Bearer ${config.onebotToken}`;
  }

  const base = config.onebotHttpUrl.replace(/\/$/, "");
  const pathUrl = `${base}/${action}`;
  let res = await fetch(pathUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    res = await fetch(base, {
      method: "POST",
      headers,
      body: JSON.stringify({ action, params }),
    });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OneBot API ${action} 失败: ${res.status} ${body}`);
  }
  return res.json().catch(() => ({}));
}

export async function sendPrivateMsg(userId: number, message: string): Promise<void> {
  await callOneBotApi("send_private_msg", { user_id: userId, message });
}

export async function sendGroupMsg(groupId: number, message: string): Promise<void> {
  await callOneBotApi("send_group_msg", { group_id: groupId, message });
}

export async function replyToEvent(
  event: OneBotMessageEvent,
  message: string,
  options?: { hashMode?: boolean },
): Promise<void> {
  const hashMode = options?.hashMode === true;
  const formatted = formatReplyForQQ(message, { hashMode });
  const limit = hashMode ? config.hashReplyMaxLength : config.maxReplyLength;
  const clipped =
    formatted.length > limit
      ? formatted.slice(0, limit - 20) + "…(已截断)"
      : formatted;

  if (event.message_type === "group" && event.group_id !== undefined) {
    await sendGroupMsg(event.group_id, clipped);
  } else {
    await sendPrivateMsg(event.user_id, clipped);
  }
}

export function startOneBotWs(onMessage: MessageHandler): WebSocketServer {
  const wss = new WebSocketServer({
    host: config.onebotWsHost,
    port: config.onebotWsPort,
    path: config.onebotWsPath,
  });

  wss.on("connection", (ws: WebSocket) => {
    console.log("[onebot] NapCat 已连接");
    ws.on("message", (raw) => {
      void (async () => {
        try {
          const data = JSON.parse(raw.toString()) as Record<string, unknown>;
          if (data.post_type !== "message") return;
          await onMessage(data as unknown as OneBotMessageEvent);
        } catch (err) {
          console.error("[onebot] 解析消息失败", err);
        }
      })();
    });
    ws.on("close", () => console.log("[onebot] 连接断开"));
  });

  console.log(
    `[onebot] 监听 ws://${config.onebotWsHost}:${config.onebotWsPort}${config.onebotWsPath}`,
  );
  console.log(`[onebot] 发消息 HTTP: ${config.onebotHttpUrl}`);
  return wss;
}
