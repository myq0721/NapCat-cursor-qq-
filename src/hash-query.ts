/** 解析 # 教学模式：#内容 或 #内容# */

export interface HashQueryParse {
  isHashMode: boolean;
  /** 去掉 # 后的实际问题 */
  query: string;
}

export function parseHashQuery(raw: string): HashQueryParse {
  const text = raw.trim();
  if (!text) return { isHashMode: false, query: text };

  if (text.startsWith("/")) {
    return { isHashMode: false, query: text };
  }

  const wrapped = /^#([\s\S]+)#$/u.exec(text);
  if (wrapped) {
    const q = wrapped[1]!.trim();
    return { isHashMode: q.length > 0, query: q || text };
  }

  if (text.startsWith("#")) {
    const q = text.slice(1).trim();
    return { isHashMode: q.length > 0, query: q };
  }

  return { isHashMode: false, query: text };
}

export function buildHashModeInstruction(displayName: string): string {
  return `【# 教学模式】对方以 # 开头提问，请用「${displayName}」的口吻认真讲解或回答，可以写长一些（约 200～1200 字），可分多段，段之间空一行。
像熟人在教对方，不要暴露是 AI，不要说「作为语言模型」。
不要 markdown 和 ** 加粗；可用 1. 2. 3. 或「首先」「然后」组织教程。
日常闲聊规则里的「单行极简」在本模式不适用，但语气、人设、擦边尺度仍要遵守。`;
}
