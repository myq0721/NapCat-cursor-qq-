import { learnStyleFromSamples } from "./cursor-agent.js";
import { importFromSucai } from "./import-sucai.js";
import { config } from "./config.js";
import { loadSamples } from "./style-profile.js";

async function main(): Promise<void> {
  let samples = await loadSamples();
  if (samples.length < config.minSamplesToLearn) {
    console.log("[learn] 样本不足，尝试从 sucai.txt 导入…");
    await importFromSucai(false);
    samples = await loadSamples();
  }
  if (samples.length < config.minSamplesToLearn) {
    console.error(
      `样本不足：${samples.length}/${config.minSamplesToLearn}`,
    );
    process.exit(1);
  }
  console.log(`[learn] 分析 ${samples.length} 条（${config.stylePersonName}）…`);
  const profile = await learnStyleFromSamples(samples);
  console.log("\n=== 风格摘要 ===\n");
  console.log(profile.summary);
  console.log("\n=== 示例句 ===\n");
  for (const e of profile.examples) console.log(`- ${e}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
