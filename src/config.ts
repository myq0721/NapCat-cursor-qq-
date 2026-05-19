import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

loadEnv();

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function env(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`缺少环境变量: ${key}（请复制 .env.example 为 .env）`);
  }
  return v;
}

function envOptional(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

function envBool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  root,
  dataDir: path.join(root, "data"),
  personasDir: path.join(root, "personas"),
  cursorApiKey: envOptional("CURSOR_API_KEY"),
  cursorModel: envOptional("CURSOR_MODEL", "composer-2.5"),
  cursorCwd: envOptional("CURSOR_CWD", root),
  /** 主人 QQ：可执行 /学习、/导入；日常聊天也会记入样本 */
  ownerQqId: envOptional("OWNER_QQ_ID"),
  botQqId: envOptional("BOT_QQ_ID"),
  stylePersonName: envOptional("STYLE_PERSON_NAME", "ayanami"),
  stylePersonQq: envOptional("STYLE_PERSON_QQ"),
  sucaiPath: envOptional("SUACAI_PATH", "sucai.txt"),
  importMaxSamples: envInt("IMPORT_MAX_SAMPLES", 2000),
  learnSampleCount: envInt("LEARN_SAMPLE_COUNT", 2000),
  learnBatchSize: envInt("LEARN_BATCH_SIZE", 60),
  styleExampleCount: envInt("STYLE_EXAMPLE_COUNT", 50),
  onebotWsHost: envOptional("ONEBOT_WS_HOST", "127.0.0.1"),
  onebotWsPort: envInt("ONEBOT_WS_PORT", 8080),
  onebotWsPath: envOptional("ONEBOT_WS_PATH", "/onebot/v11/ws"),
  onebotHttpUrl: envOptional("ONEBOT_HTTP_URL", "http://127.0.0.1:3000"),
  onebotToken: envOptional("ONEBOT_TOKEN"),
  /** 群聊定时扫一眼间隔，默认 20 分钟 */
  groupProactiveIntervalMs: envInt("GROUP_PROACTIVE_INTERVAL_MS", 1_200_000),
  groupHistoryLimit: envInt("GROUP_HISTORY_LIMIT", 50),
  /** @ 时用 Agent.prompt 快速单轮（通常比长 Agent 会话快） */
  chatFastMode: envBool("CHAT_FAST_MODE", true),
  maxReplyLength: envInt("MAX_REPLY_LENGTH", 3500),
  /** # 教学模式单条上限（可较长） */
  hashReplyMaxLength: envInt("HASH_REPLY_MAX_LENGTH", 4000),
  maxStyleSamples: envInt("MAX_STYLE_SAMPLES", 2500),
  minSamplesToLearn: envInt("MIN_SAMPLES_TO_LEARN", 8),
  autoImportSucaiOnStart: envBool("AUTO_IMPORT_SUACAI", true),
};
