import { Agent, CursorAgentError, type SDKMessage } from "@cursor/sdk";
import { config } from "./config.js";

function requireApiKey(): string {
  if (!config.cursorApiKey) {
    throw new Error("未配置 CURSOR_API_KEY，请在 .env 中填写");
  }
  return config.cursorApiKey;
}
import { buildPromptsForActive } from "./persona-registry.js";
import {
  buildLearnPrompt,
  buildMergePrompt,
  loadProfile,
  pickSamplesForLearning,
  pickStyleExamples,
  saveProfile,
  type StyleProfile,
} from "./style-profile.js";
import { formatReplyForQQ } from "./reply-format.js";
import { buildHashModeInstruction } from "./hash-query.js";
import { getActivePersona } from "./persona-registry.js";

type SdkAgent = Awaited<ReturnType<typeof Agent.create>>;

const chatAgents = new Map<string, SdkAgent>();
const pending = new Map<string, Promise<string>>();

async function sessionKey(
  messageType: string,
  userId: string,
  groupId?: number,
): Promise<string> {
  const prompts = await buildPromptsForActive();
  const prefix = prompts.personaId;
  if (messageType === "group" && groupId !== undefined) {
    return `${prefix}:g:${groupId}:u:${userId}`;
  }
  return `${prefix}:p:${userId}`;
}

async function getChatAgent(key: string): Promise<SdkAgent> {
  const existing = chatAgents.get(key);
  if (existing) return existing;

  const agent = await Agent.create({
    apiKey: requireApiKey(),
    model: { id: config.cursorModel },
    local: { cwd: config.cursorCwd, settingSources: [] },
  });
  chatAgents.set(key, agent);
  return agent;
}

async function extractAssistantText(
  events: AsyncIterable<SDKMessage>,
): Promise<string> {
  let text = "";
  for await (const event of events) {
    if (event.type !== "assistant") continue;
    for (const block of event.message.content) {
      if (block.type === "text" && block.text) text += block.text;
    }
  }
  return text.trim();
}

async function runOneShotPrompt(prompt: string): Promise<string> {
  const result = await Agent.prompt(prompt, {
    apiKey: requireApiKey(),
    model: { id: config.cursorModel },
    local: { cwd: config.cursorCwd, settingSources: [] },
  });

  if (result.status === "error") {
    throw new Error("Cursor 风格分析失败");
  }
  const text = (result.result ?? "").trim();
  if (!text) throw new Error("Cursor 未返回文本");
  return text;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/** 单轮 prompt，@ 等场景更快 */
export async function chatReplyFast(
  userMessage: string,
  options?: { groupContext?: string; replyHint?: string },
): Promise<string> {
  const prompts = await buildPromptsForActive();
  const compact = prompts.compact;
  const contextPart = options?.groupContext
    ? `\n【群聊】\n${options.groupContext}\n`
    : "";
  const hint = options?.replyHint ? `\n${options.replyHint}` : "";

  const result = await Agent.prompt(
    `${compact}${contextPart}\n【消息】${userMessage}${hint}`,
    {
      apiKey: requireApiKey(),
      model: { id: config.cursorModel },
      local: { cwd: config.cursorCwd, settingSources: [] },
    },
  );

  if (result.status === "error") throw new Error("Cursor 运行失败");
  const text = formatReplyForQQ((result.result ?? "").trim());
  return text || "嗯嗯咋了";
}

export async function chatReply(
  messageType: string,
  userId: string,
  userMessage: string,
  groupId?: number,
  options?: {
    groupContext?: string;
    replyHint?: string;
    noWaitForInflight?: boolean;
    preferFast?: boolean;
    hashMode?: boolean;
  },
): Promise<string> {
  const key = await sessionKey(messageType, userId, groupId);
  const inflight = pending.get(key);
  if (inflight && !options?.noWaitForInflight) {
    await inflight.catch(() => undefined);
  }

  const task = (async () => {
    const hashMode = options?.hashMode === true;
    if (config.chatFastMode && options?.preferFast && !hashMode) {
      return chatReplyFast(userMessage, {
        groupContext: options.groupContext,
        replyHint: options.replyHint,
      });
    }

    const prompts = await buildPromptsForActive();
    const active = await getActivePersona();
    const systemPrompt = prompts.full;
    const agent = await getChatAgent(key);

    const contextPart = options?.groupContext
      ? `\n\n【近期群聊记录】\n${options.groupContext}`
      : "";
    const hashBlock = hashMode ? `\n\n${buildHashModeInstruction(active.displayName)}` : "";
    const hintPart = options?.replyHint
      ? `\n\n【说明】${options.replyHint}`
      : "";

    const userBlock = hashMode
      ? `【# 提问内容】\n${userMessage}`
      : `【对方 QQ 消息】\n${userMessage}`;

    const tail = hashMode
      ? "请按角色口吻详细回答（可多段，正文）："
      : "请按上述风格直接回复（仅正文）：";

    const run = await agent.send(
      `${systemPrompt}${hashBlock}${contextPart}\n\n${userBlock}${hintPart}\n\n${tail}`,
    );

    let text = await extractAssistantText(run.stream());
    const result = await run.wait();

    if (result.status === "error") throw new Error("Cursor 运行失败");
    if (!text && result.result) text = result.result.trim();
    if (!text) text = hashMode ? "想一下再说的说" : "嗯嗯咋了";
    return formatReplyForQQ(text, { hashMode });
  })();

  pending.set(key, task);
  try {
    return await task;
  } catch (err) {
    if (err instanceof CursorAgentError) {
      throw new Error(`Cursor 启动失败: ${err.message}`);
    }
    throw err;
  } finally {
    if (pending.get(key) === task) pending.delete(key);
  }
}

export async function learnStyleFromSamples(
  allSamples: string[],
): Promise<StyleProfile> {
  const persona = config.stylePersonName;
  const picked = pickSamplesForLearning(allSamples);
  const mergedHint =
    "\n\n补充：口语短句多但有温度，会对熟人调侃关心，不要分析成冷漠型；QQ 单行发言，不爱换行。";
  const batches = chunk(picked, config.learnBatchSize);

  console.log(
    `[learn] ${persona}：${allSamples.length} 条样本 → 学习用 ${picked.length} 条，分 ${batches.length} 批`,
  );

  const partials: string[] = [];
  for (let i = 0; i < batches.length; i++) {
    console.log(`[learn] 批次 ${i + 1}/${batches.length}…`);
    const summary = await runOneShotPrompt(
      buildLearnPrompt(batches[i]!, persona) +
        (i === 0 ? mergedHint : ""),
    );
    partials.push(summary);
  }

  const summary =
    partials.length === 1 ?
      partials[0]!
    : await runOneShotPrompt(buildMergePrompt(partials, persona));

  const profile: StyleProfile = {
    summary,
    examples: pickStyleExamples(picked),
    persona,
    updatedAt: new Date().toISOString(),
    sampleCount: allSamples.length,
  };
  await saveProfile(profile);
  return profile;
}

export async function clearChatSessions(): Promise<void> {
  const agents = [...chatAgents.values()];
  chatAgents.clear();
  await Promise.all(agents.map((a) => a[Symbol.asyncDispose]()));
}

export async function disposeAllAgents(): Promise<void> {
  await clearChatSessions();
}
