import fs from "node:fs";
import readline from "node:readline";

/** QQ 导出文本：行首 `2025-07-02 9:49:08 昵称(qq号)` */
const HEADER_RE =
  /^(\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}:\d{2}) (.+?)\((\d+)\)\s*$/;

export interface ParsedMessage {
  time: string;
  nickname: string;
  userId: string;
  text: string;
}

export interface ParseSucaiOptions {
  /** 昵称须包含该字符串，默认 Ayanami绫 */
  nicknameIncludes?: string;
  /** 若设置则 QQ 号须完全匹配 */
  userId?: string;
  onProgress?: (stats: { lines: number; matched: number }) => void;
}

function normalizeMessageText(lines: string[]): string {
  return lines.join("\n").trim();
}

function isUsefulMessage(text: string): boolean {
  if (!text) return false;
  if (text.length > 800) return false;
  if (text === "[图片]") return false;
  if (/^20\d{2}-\d{2}-\d{2}/.test(text)) return false;
  return true;
}

export async function parseSucaiFile(
  filePath: string,
  options: ParseSucaiOptions = {},
): Promise<ParsedMessage[]> {
  const nicknameNeedle = options.nicknameIncludes ?? "Ayanami绫";
  const results: ParsedMessage[] = [];
  let lines = 0;
  let matched = 0;

  let capturing = false;
  let bodyLines: string[] = [];
  let meta: Omit<ParsedMessage, "text"> | null = null;

  const flush = (): void => {
    if (!capturing || !meta) return;
    const text = normalizeMessageText(bodyLines);
    if (isUsefulMessage(text)) {
      results.push({ ...meta, text });
      matched++;
    }
    capturing = false;
    bodyLines = [];
    meta = null;
  };

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const raw of rl) {
    lines++;
    const line = raw.trimEnd();
    const header = HEADER_RE.exec(line.trim());

    if (header) {
      flush();
      const [, time, nickname, userId] = header;
      const nameOk = nickname.includes(nicknameNeedle);
      const idOk = !options.userId || userId === options.userId;
      if (nameOk && idOk) {
        capturing = true;
        meta = { time, nickname, userId };
        bodyLines = [];
      }
    } else if (capturing) {
      bodyLines.push(line);
    }

    if (options.onProgress && lines % 50000 === 0) {
      options.onProgress({ lines, matched });
    }
  }
  flush();
  options.onProgress?.({ lines, matched });
  return results;
}

/** 从大量发言中抽取用于学习的代表性样本 */
export function sampleMessages(
  messages: string[],
  maxCount: number,
  seed = 42,
): string[] {
  const unique = [...new Set(messages.map((m) => m.trim()).filter(Boolean))];
  if (unique.length <= maxCount) return unique;

  const buckets: Record<string, string[]> = {
    short: [],
    medium: [],
    long: [],
  };
  for (const m of unique) {
    const len = m.length;
    if (len <= 12) buckets.short.push(m);
    else if (len <= 60) buckets.medium.push(m);
    else buckets.long.push(m);
  }

  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  const pick = (arr: string[], n: number): string[] => {
    const copy = [...arr];
    const out: string[] = [];
    while (out.length < n && copy.length > 0) {
      const i = Math.floor(rand() * copy.length);
      out.push(copy.splice(i, 1)[0]!);
    }
    return out;
  };

  const shortN = Math.min(buckets.short.length, Math.ceil(maxCount * 0.35));
  const longN = Math.min(buckets.long.length, Math.ceil(maxCount * 0.2));
  const mediumN = maxCount - shortN - longN;

  const picked = [
    ...pick(buckets.short, shortN),
    ...pick(buckets.medium, mediumN),
    ...pick(buckets.long, longN),
  ];

  if (picked.length < maxCount) {
    const rest = unique.filter((m) => !picked.includes(m));
    picked.push(...pick(rest, maxCount - picked.length));
  }
  return picked.slice(0, maxCount);
}
