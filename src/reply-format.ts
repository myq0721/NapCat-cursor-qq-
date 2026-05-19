export interface FormatReplyOptions {
  /** # 教学模式：允许多段换行 */
  hashMode?: boolean;
}

/** 发给 QQ 前：闲聊单行；# 模式可多段 */
export function formatReplyForQQ(text: string, options?: FormatReplyOptions): string {
  if (options?.hashMode) return formatReplyHashMode(text);
  let s = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");

  s = stripMarkdown(s);
  s = stripBracketFaces(s);
  s = restrictPunctuation(s);

  return s.replace(/\s{2,}/g, " ").trim();
}

function formatReplyHashMode(text: string): string {
  let s = text.replace(/\r\n/g, "\n").trim();
  s = stripMarkdown(s);
  s = stripBracketFaces(s);
  const lines = s
    .split("\n")
    .map((line) => restrictPunctuation(line.trim()))
    .filter(Boolean);
  return lines.join("\n").trim();
}

function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/\*([^*]*)\*/g, "$1")
    .replace(/__([^_]*)__/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

/** 去掉 [撅嘴] 等 QQ 方括号表情，保留 qwq QAQ www */
function stripBracketFaces(s: string): string {
  return s.replace(/\[[^\]]+\]/g, "").replace(/\s{2,}/g, " ").trim();
}

function restrictPunctuation(s: string): string {
  const out: string[] = [];
  for (const ch of s) {
    if (/[\u4e00-\u9fff\w\s@]/.test(ch)) {
      out.push(ch);
      continue;
    }
    if ("，。？！".includes(ch)) {
      out.push(ch);
      continue;
    }
    if (ch === ",") {
      out.push("，");
      continue;
    }
    if (ch === ".") {
      out.push("。");
      continue;
    }
    if (ch === "?" || ch === "？") {
      out.push("？");
      continue;
    }
    if (ch === "!" || ch === "！") {
      out.push("！");
      continue;
    }
    // ～ ~ … — ：；等一律去掉
  }
  return out.join("");
}
