import path from "node:path";
import { config } from "./config.js";
import { parseSucaiFile, sampleMessages } from "./sucai-parser.js";
import { ensureDataDir, loadSamples, saveSamplesMeta } from "./style-profile.js";

export async function importFromSucai(force = false): Promise<{
  extracted: number;
  stored: number;
  file: string;
}> {
  const filePath = path.isAbsolute(config.sucaiPath)
    ? config.sucaiPath
    : path.join(config.root, config.sucaiPath);

  const existing = await loadSamples();
  if (existing.length > 0 && !force) {
    return { extracted: existing.length, stored: existing.length, file: filePath };
  }

  console.log(`[import] 解析 ${filePath} …`);
  const parsed = await parseSucaiFile(filePath, {
    nicknameIncludes: config.stylePersonName,
    userId: config.stylePersonQq || undefined,
    onProgress: ({ lines, matched }) =>
      console.log(`[import] 已读 ${lines} 行，已提取 ${matched} 条`),
  });

  const allTexts = parsed
    .map((p) => p.text.trim())
    .filter((t) => t && t !== "[图片]");
  const stored = sampleMessages(allTexts, config.importMaxSamples);

  await saveSamplesMeta(stored, {
    source: config.sucaiPath,
    persona: config.stylePersonName,
    personaQq: config.stylePersonQq,
    totalExtracted: allTexts.length,
    importedAt: new Date().toISOString(),
  });

  console.log(
    `[import] 共提取 ${allTexts.length} 条，写入 ${stored.length} 条到 data/samples.json`,
  );
  return { extracted: allTexts.length, stored: stored.length, file: filePath };
}
