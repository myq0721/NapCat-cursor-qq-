import fs from "node:fs/promises";
import path from "node:path";
import { GLOBAL_CHAT_RULES } from "./chat-rules.js";
import { config } from "./config.js";
import {
  buildChatSystemPrompt,
  buildCompactChatPrompt,
  loadProfile as loadStyleProfile,
  type StyleProfile,
} from "./style-profile.js";

export type PersonaType = "full" | "markdown";

export interface PersonaEntry {
  id: string;
  displayName: string;
  type: PersonaType;
  description?: string;
}

interface RegistryFile {
  defaultId: string;
  personas: PersonaEntry[];
}

interface ActivePersonaFile {
  activeId: string;
}

const registryPath = () => path.join(config.personasDir, "registry.json");
const activePath = () => path.join(config.dataDir, "active-persona.json");

export function personaDir(id: string): string {
  return path.join(config.personasDir, id);
}

export async function loadRegistry(): Promise<RegistryFile> {
  const raw = await fs.readFile(registryPath(), "utf-8");
  return JSON.parse(raw) as RegistryFile;
}

export async function listPersonas(): Promise<PersonaEntry[]> {
  const reg = await loadRegistry();
  return reg.personas;
}

export async function getActivePersonaId(): Promise<string> {
  try {
    const raw = await fs.readFile(activePath(), "utf-8");
    const data = JSON.parse(raw) as ActivePersonaFile;
    const reg = await loadRegistry();
    if (reg.personas.some((p) => p.id === data.activeId)) {
      return data.activeId;
    }
  } catch {
    /* use default */
  }
  const reg = await loadRegistry();
  return reg.defaultId;
}

export async function setActivePersonaId(id: string): Promise<PersonaEntry> {
  const reg = await loadRegistry();
  const entry = reg.personas.find((p) => p.id === id);
  if (!entry) throw new Error(`未知人设: ${id}`);

  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(
    activePath(),
    JSON.stringify({ activeId: id }, null, 2),
    "utf-8",
  );
  return entry;
}

export async function getActivePersona(): Promise<PersonaEntry> {
  const id = await getActivePersonaId();
  const reg = await loadRegistry();
  const entry = reg.personas.find((p) => p.id === id);
  if (!entry) throw new Error(`active persona ${id} 未在 registry 中`);
  return entry;
}

export async function loadPersonaMarkdown(id: string): Promise<string> {
  const file = path.join(personaDir(id), "prompt.md");
  return fs.readFile(file, "utf-8");
}

export async function loadPersonaProfile(
  id: string,
): Promise<StyleProfile | null> {
  const file = path.join(personaDir(id), "profile.json");
  try {
    const raw = await fs.readFile(file, "utf-8");
    const p = JSON.parse(raw) as StyleProfile;
    if (!p.examples) p.examples = [];
    return p;
  } catch {
    return null;
  }
}

export interface BuiltPersonaPrompt {
  displayName: string;
  personaId: string;
  full: string;
  compact: string;
}

export async function buildPromptsForActive(): Promise<BuiltPersonaPrompt> {
  const entry = await getActivePersona();

  if (entry.type === "markdown") {
    const md = await loadPersonaMarkdown(entry.id);
    const body = md.replace(/^#.*\n+/m, "").trim();
    const full = `你是 QQ 聊天角色「${entry.displayName}」。\n\n${body}\n\n${GLOBAL_CHAT_RULES}`;
    const compact =
      `扮演「${entry.displayName}」。` +
      body.slice(0, 600) +
      ` ${GLOBAL_CHAT_RULES} 单行完整句。`;
    return {
      displayName: entry.displayName,
      personaId: entry.id,
      full,
      compact,
    };
  }

  const profile = await loadPersonaProfile(entry.id);
  return {
    displayName: entry.displayName,
    personaId: entry.id,
    full: buildChatSystemPrompt(profile, entry.displayName),
    compact: buildCompactChatPrompt(profile, entry.displayName),
  };
}

/** 将旧 data/ 迁移到 personas/ayanami/ */
export async function migrateLegacyPersonaData(): Promise<void> {
  const targetProfile = path.join(personaDir("ayanami"), "profile.json");
  const legacyProfile = path.join(config.dataDir, "profile.json");
  try {
    await fs.access(targetProfile);
    return;
  } catch {
    /* migrate */
  }
  try {
    await fs.mkdir(personaDir("ayanami"), { recursive: true });
    await fs.copyFile(legacyProfile, targetProfile);
    console.log("[persona] 已迁移 profile.json → personas/ayanami/");
  } catch {
    /* no legacy */
  }

  const targetSamples = path.join(personaDir("ayanami"), "samples.json");
  const legacySamples = path.join(config.dataDir, "samples.json");
  try {
    await fs.access(targetSamples);
    return;
  } catch {
    /* */
  }
  try {
    await fs.copyFile(legacySamples, targetSamples);
    console.log("[persona] 已迁移 samples.json → personas/ayanami/");
  } catch {
    /* */
  }
}

export function samplesPathFor(personaId: string): string {
  return path.join(personaDir(personaId), "samples.json");
}

export function profilePathFor(personaId: string): string {
  return path.join(personaDir(personaId), "profile.json");
}

/** 兼容旧代码：仅 Ayanami full 人设的 profile */
export async function loadActiveAyanamiProfile(): Promise<StyleProfile | null> {
  return loadPersonaProfile("ayanami");
}
