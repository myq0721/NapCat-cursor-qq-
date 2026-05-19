import {
  getActivePersona,
  listPersonas,
  setActivePersonaId,
  type PersonaEntry,
} from "./persona-registry.js";

let pendingSwitch = false;

export function isAwaitingSwitchChoice(): boolean {
  return pendingSwitch;
}

export function beginSwitchFlow(): void {
  pendingSwitch = true;
}

export function cancelSwitchFlow(): void {
  pendingSwitch = false;
}

export function formatPersonaListMessage(): string {
  return `发送 /切换模型 可查看列表。`;
}

export async function buildSwitchListMessage(): Promise<string> {
  const active = await getActivePersona();
  const list = await listPersonas();
  const lines = list.map(
    (p, i) => `${i + 1}. ${p.displayName}（${p.id}）`,
  );
  beginSwitchFlow();
  return [
    `当前模型：${active.displayName}`,
    "可选：",
    ...lines,
    "请回复数字或名称（如 绫波 / lingbo）完成切换，仅主人可用",
  ].join("\n");
}

function matchPersonaChoice(
  text: string,
  list: PersonaEntry[],
): PersonaEntry | null {
  const t = text.trim();
  const n = Number.parseInt(t, 10);
  if (Number.isFinite(n) && n >= 1 && n <= list.length) {
    return list[n - 1]!;
  }
  const lower = t.toLowerCase();
  return (
    list.find(
      (p) =>
        p.displayName === t ||
        p.id === lower ||
        p.displayName.toLowerCase() === lower,
    ) ?? null
  );
}

export async function switchToChoice(
  text: string,
): Promise<{ ok: true; name: string } | { ok: false; hint: string }> {
  const list = await listPersonas();
  const picked = matchPersonaChoice(text, list);
  if (!picked) {
    return {
      ok: false,
      hint: `未识别。请再发 /切换模型，然后回复 1～${list.length} 或名称`,
    };
  }

  await setActivePersonaId(picked.id);
  return { ok: true, name: picked.displayName };
}

export async function tryCompleteSwitch(
  text: string,
): Promise<{ ok: true; name: string } | { ok: false; hint: string } | null> {
  if (!pendingSwitch) return null;
  pendingSwitch = false;
  return switchToChoice(text);
}
