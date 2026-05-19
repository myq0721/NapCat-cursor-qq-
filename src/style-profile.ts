import fs from "node:fs/promises";
import { config } from "./config.js";
import { GLOBAL_CHAT_RULES } from "./chat-rules.js";
import {
  profilePathFor,
  samplesPathFor,
} from "./persona-registry.js";
import { sampleMessages } from "./sucai-parser.js";

const AYANAMI_ID = "ayanami";

export interface StyleProfile {
  summary: string;
  examples: string[];
  persona: string;
  updatedAt: string;
  sampleCount: number;
}

export interface SamplesMeta {
  messages: string[];
  source?: string;
  persona?: string;
  personaQq?: string;
  totalExtracted?: number;
  importedAt?: string;
}

const samplesPath = () => samplesPathFor(AYANAMI_ID);
const profilePath = () => profilePathFor(AYANAMI_ID);

export async function ensureDataDir(): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
}

export async function loadSamplesMeta(): Promise<SamplesMeta> {
  try {
    const raw = await fs.readFile(samplesPath(), "utf-8");
    const data = JSON.parse(raw) as SamplesMeta;
    return {
      messages: Array.isArray(data.messages) ? data.messages : [],
      source: data.source,
      persona: data.persona,
      personaQq: data.personaQq,
      totalExtracted: data.totalExtracted,
      importedAt: data.importedAt,
    };
  } catch {
    return { messages: [] };
  }
}

export async function loadSamples(): Promise<string[]> {
  return (await loadSamplesMeta()).messages;
}

export async function saveSamplesMeta(
  messages: string[],
  meta: Partial<SamplesMeta> = {},
): Promise<void> {
  await ensureDataDir();
  const payload: SamplesMeta = {
    messages,
    persona: meta.persona ?? config.stylePersonName,
    ...meta,
  };
  await fs.writeFile(samplesPath(), JSON.stringify(payload, null, 2), "utf-8");
}

export async function addSample(text: string): Promise<number> {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("/")) {
    return (await loadSamples()).length;
  }

  const meta = await loadSamplesMeta();
  const messages = meta.messages;
  if (messages.length > 0 && messages[messages.length - 1] === trimmed) {
    return messages.length;
  }
  messages.push(trimmed);
  if (messages.length > config.maxStyleSamples) {
    messages.splice(0, messages.length - config.maxStyleSamples);
  }
  await saveSamplesMeta(messages, {
    source: meta.source,
    persona: meta.persona,
    personaQq: meta.personaQq,
    totalExtracted: meta.totalExtracted,
    importedAt: meta.importedAt,
  });
  return messages.length;
}

export async function loadProfile(): Promise<StyleProfile | null> {
  try {
    const raw = await fs.readFile(profilePath(), "utf-8");
    const p = JSON.parse(raw) as StyleProfile;
    if (!p.persona) p.persona = config.stylePersonName;
    if (!p.examples) p.examples = [];
    return p;
  } catch {
    return null;
  }
}

export async function saveProfile(profile: StyleProfile): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(profilePath(), JSON.stringify(profile, null, 2), "utf-8");
}

export function pickSamplesForLearning(all: string[]): string[] {
  return sampleMessages(all, config.learnSampleCount);
}

export function pickStyleExamples(
  all: string[],
  count = config.styleExampleCount,
): string[] {
  const short = all.filter(
    (m) =>
      m.length > 0 &&
      m.length <= 80 &&
      m !== "[图片]" &&
      !m.startsWith("2025-"),
  );
  return sampleMessages(short.length > 0 ? short : all, count);
}

/** 更短提示词，加快 Cursor 响应 */
export function buildCompactChatPrompt(
  profile: StyleProfile | null,
  displayName?: string,
): string {
  const persona = displayName ?? profile?.persona ?? config.stylePersonName;
  const brief =
    profile?.summary ?
      profile.summary.slice(0, 500)
    : `你是 QQ 群友 ${persona}，极简口语，常 1～15 字。`;
  const ex =
    profile?.examples?.slice(0, 6).join(" | ") ??
    "好呀 | ？ | 我来";
  return `扮演「${persona}」。${brief} 语气参考：${ex}。有温度、像熟人接话。${GLOBAL_CHAT_RULES}`;
}

export function buildChatSystemPrompt(
  profile: StyleProfile | null,
  displayName?: string,
): string {
  const persona = displayName ?? profile?.persona ?? config.stylePersonName;
  const styleBlock = profile?.summary
    ? profile.summary
    : `你是「${persona}」，语气自然、口语化，像日常 QQ 聊天，不要太正式。`;

  const examples =
    profile?.examples?.length ?
      `\n【${persona} 的典型发言举例（模仿语气，不要照抄内容）】\n${profile.examples.map((e) => `- ${e}`).join("\n")}`
    : "";

  return `你是 QQ 聊天机器人，扮演「${persona}」本人来回复。

【说话风格】
${styleBlock}${examples}

【硬性规则】
- 有温度、愿意接话，不要冷冰冰只回一个字（除非对方也只说了一句废话）。
- 整条回复必须是单行：禁止换行、禁止列表；多句用空格连接。
- 严禁 **加粗** 等 markdown；标点只允许 ，。？！，不要用 ～、：、… 等。
- 必须是一句说完整的话，禁止半截话。
- 表情只用 qwq、QAQ、www 等颜文字，一条最多一个；禁止 [撅嘴] 等方括号表情。
${GLOBAL_CHAT_RULES}
- 这是闲聊，不要改文件。`;
}

export function buildLearnPrompt(samples: string[], persona: string): string {
  const joined = samples.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return `以下是 QQ 用户「${persona}」的发言样本。请分析其说话风格，输出一段「风格说明」供 AI 模仿。

要求：
- 中文，500～900 字，尽量具体。
- 写清：语气、常用词、句式、表情/标点、梗、热情程度（不要冷漠）、对熟人的温度等。
- 只输出风格说明正文，不要标题编号，不要 JSON。

【发言样本】
${joined}`;
}

export function buildMergePrompt(
  partialSummaries: string[],
  persona: string,
): string {
  return `下面是对 QQ 用户「${persona}」多批聊天记录的风格分析摘要。请合并为一份完整、不重复的风格说明（中文 400～800 字），供 AI 稳定模仿此人。

${partialSummaries.map((s, i) => `--- 第 ${i + 1} 部分 ---\n${s}`).join("\n\n")}`;
}

