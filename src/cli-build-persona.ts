/**
 * 不消耗 Cursor API：从 sucai.txt 统计 + 提炼提示词，写入 data/profile.json
 */
import path from "node:path";
import { config } from "./config.js";
import { importFromSucai } from "./import-sucai.js";
import { parseSucaiFile, sampleMessages } from "./sucai-parser.js";
import {
  AYANAMI_CURATED_EXAMPLES,
  AYANAMI_PERSONA_SUMMARY,
} from "./persona-ayanami.js";
import { ensureDataDir, loadSamples, saveProfile, type StyleProfile } from "./style-profile.js";
import fs from "node:fs/promises";

async function writePersonaMarkdown(profile: StyleProfile): Promise<void> {
  const md = `# ${profile.persona} — 模仿用提示词

> 由 sucai.txt 自动提炼，${profile.updatedAt}
> 样本量：${profile.sampleCount} 条发言

---

## 系统提示（复制给任意 AI 均可）

\`\`\`
你是 QQ 用户「${profile.persona}」，用以下风格回复。只输出要发送的纯文本，不要 markdown。

${profile.summary}
\`\`\`

---

## 典型例句（勿照抄，学语气）

${profile.examples.map((e) => `- ${e}`).join("\n")}
`;
  await fs.mkdir(path.join(config.personasDir, "ayanami"), { recursive: true });
  await fs.writeFile(
    path.join(config.personasDir, "ayanami", "persona-prompt.md"),
    md,
    "utf-8",
  );
}

export async function buildPersonaFromSucai(
  forceImport = false,
): Promise<StyleProfile> {
  await ensureDataDir();

  if (forceImport || (await loadSamples()).length === 0) {
    console.log("[persona] 重新导入 sucai.txt …");
    await importFromSucai(true);
  }

  const filePath = path.join(config.root, config.sucaiPath);
  console.log("[persona] 统计全量发言 …");
  const all = await parseSucaiFile(filePath, {
    nicknameIncludes: config.stylePersonName,
    userId: config.stylePersonQq || undefined,
  });
  const texts = all
    .map((m) => m.text.trim())
    .filter((t) => t && t !== "[图片]" && t.length <= 120);

  const stats = {
    total: texts.length,
    avgLen: (texts.reduce((s, t) => s + t.length, 0) / texts.length).toFixed(1),
    shortRatio:
      ((texts.filter((t) => t.length <= 15).length / texts.length) * 100).toFixed(
        1,
      ) + "%",
  };
  console.log("[persona] 统计:", stats);

  const autoExamples = sampleMessages(
    texts.filter((t) => t.length >= 2 && t.length <= 50 && !t.startsWith("2025-")),
    12,
  );
  const examples = [
    ...AYANAMI_CURATED_EXAMPLES,
    ...autoExamples.filter((e) => !AYANAMI_CURATED_EXAMPLES.includes(e)),
  ].slice(0, config.styleExampleCount);

  const profile: StyleProfile = {
    summary: AYANAMI_PERSONA_SUMMARY,
    examples,
    persona: config.stylePersonName,
    updatedAt: new Date().toISOString(),
    sampleCount: texts.length,
  };

  await saveProfile(profile);
  await writePersonaMarkdown(profile);
  return profile;
}

async function main(): Promise<void> {
  const forceImport = process.argv.includes("--import");
  const profile = await buildPersonaFromSucai(forceImport);
  console.log("\n[persona] 已写入 data/profile.json");
  console.log("[persona] 已写入 data/persona-prompt.md（可复制到别的 AI）");
  console.log(`[persona] 例句 ${profile.examples.length} 条，无需 Cursor 即可聊天`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
