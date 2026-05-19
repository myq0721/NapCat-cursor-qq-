import { config } from "./config.js";
import {
  chatReply,
  clearChatSessions,
  disposeAllAgents,
  learnStyleFromSamples,
} from "./cursor-agent.js";
import {
  formatGroupContext,
  markGroupReplied,
  recordGroupLine,
} from "./group-context.js";
import {
  evaluateGroupReply,
  isProactiveReason,
  messageMentionsBot,
  resolveBotQqId,
  type GroupReplyReason,
} from "./group-reply-policy.js";
import { startGroupProactiveTimer } from "./group-timer.js";
import {
  normalizeIncomingText,
  replyToEvent,
  sendGroupMsg,
  startOneBotWs,
  type OneBotMessageEvent,
} from "./onebot.js";
import { importFromSucai } from "./import-sucai.js";
import {
  buildPromptsForActive,
  getActivePersona,
  loadPersonaMarkdown,
  loadPersonaProfile,
  migrateLegacyPersonaData,
} from "./persona-registry.js";
import { parseHashQuery } from "./hash-query.js";
import {
  buildSwitchListMessage,
  cancelSwitchFlow,
  isAwaitingSwitchChoice,
  switchToChoice,
  tryCompleteSwitch,
} from "./persona-switch.js";
import {
  addSample,
  ensureDataDir,
  loadProfile,
  loadSamples,
  loadSamplesMeta,
} from "./style-profile.js";

const REPLY_HINTS: Record<GroupReplyReason, string> = {
  mention: "对方 @ 了你，热情接话，一行完整句；禁止**；标点仅，。？！",
  periodic: "接话茬，一行完整句；禁止**；标点仅，。？！",
};

async function generateReply(
  messageType: "private" | "group",
  userId: string,
  text: string,
  groupId: number | undefined,
  reason: GroupReplyReason | "private",
  contextBlock?: string,
  hashMode = false,
): Promise<string> {
  const hints: string[] = [];
  if (reason !== "private") hints.push(REPLY_HINTS[reason]);

  return chatReply(messageType, userId, text, groupId, {
    groupContext: contextBlock,
    replyHint: hints.length ? hints.join("\n") : undefined,
    noWaitForInflight: true,
    preferFast: hashMode ? false : config.chatFastMode,
    hashMode,
  });
}

function isOwner(event: OneBotMessageEvent): boolean {
  return String(event.user_id) === config.ownerQqId;
}

async function handleCommand(
  event: OneBotMessageEvent,
  text: string,
): Promise<boolean> {
  const cmd = text.split(/\s+/)[0]?.toLowerCase();
  const active = await getActivePersona();

  if (cmd === "/帮助" || cmd === "/help") {
    await replyToEvent(
      event,
      [
        "命令：/帮助 /当前模型 /切换模型 /风格",
        "Ayanami专用：/样本数 /提炼 /导入素材 /学习",
        "#开头=教学模式，可长文讲解，如 #unity是什么",
        `群聊：@ 或 #开头 立即回；每 ${config.groupProactiveIntervalMs / 60_000} 分钟扫群`,
      ].join("\n"),
    );
    return true;
  }

  if (cmd === "/当前模型") {
    await replyToEvent(event, `当前模型：${active.displayName}（${active.id}）`);
    return true;
  }

  if (cmd === "/切换模型") {
    if (!isOwner(event)) {
      await replyToEvent(event, "仅主人可切换模型");
      return true;
    }
    const arg = text.replace(/^\/切换模型\s*/i, "").trim();
    if (arg) {
      const result = await switchToChoice(arg);
      if (result.ok) {
        await clearChatSessions();
        await replyToEvent(event, `已切换到：${result.name}`);
      } else {
        await replyToEvent(event, result.hint);
      }
      cancelSwitchFlow();
      return true;
    }
    await replyToEvent(event, await buildSwitchListMessage());
    return true;
  }

  if (cmd === "/风格") {
    if (active.type === "markdown") {
      const md = await loadPersonaMarkdown(active.id);
      await replyToEvent(
        event,
        `【${active.displayName}】prompt.md\n\n${md.slice(0, 900)}`,
      );
      return true;
    }
    const profile = await loadPersonaProfile(active.id);
    if (!profile) {
      await replyToEvent(event, "还没有风格档案。运行 npm run persona:build");
      return true;
    }
    await replyToEvent(
      event,
      `【${active.displayName}】${profile.updatedAt}\n\n${profile.summary.slice(0, 800)}`,
    );
    return true;
  }

  if (cmd === "/样本数") {
    const n = (await loadSamples()).length;
    await replyToEvent(event, `样本 ${n} 条`);
    return true;
  }

  if (cmd === "/提炼") {
    if (!isOwner(event)) {
      await replyToEvent(event, "仅主人");
      return true;
    }
    if (active.id !== "ayanami") {
      await replyToEvent(event, "提炼仅用于 Ayanami，请先 /切换模型 到 Ayanami");
      return true;
    }
    const { buildPersonaFromSucai } = await import("./cli-build-persona.js");
    await buildPersonaFromSucai(true);
    await clearChatSessions();
    await replyToEvent(event, "提炼完成");
    return true;
  }

  if (cmd === "/导入素材") {
    if (!isOwner(event)) {
      await replyToEvent(event, "仅主人");
      return true;
    }
    if (active.id !== "ayanami") {
      await replyToEvent(event, "导入素材仅用于 Ayanami");
      return true;
    }
    const r = await importFromSucai(true);
    await clearChatSessions();
    await replyToEvent(event, `导入 ${r.stored} 条`);
    return true;
  }

  if (cmd === "/学习") {
    if (!isOwner(event)) {
      await replyToEvent(event, "仅主人");
      return true;
    }
    if (active.id !== "ayanami") {
      await replyToEvent(event, "学习仅用于 Ayanami");
      return true;
    }
    const profile = await learnStyleFromSamples(await loadSamples());
    await clearChatSessions();
    await replyToEvent(event, `学习完成 ${profile.sampleCount} 条`);
    return true;
  }

  return false;
}

async function onMessage(event: OneBotMessageEvent): Promise<void> {
  if (event.post_type !== "message") return;

  const rawText = normalizeIncomingText(event).trim();
  if (!rawText) return;

  const hashParsed = parseHashQuery(rawText);
  const text = rawText;
  const queryForAi = hashParsed.isHashMode ? hashParsed.query : rawText;

  if (event.message_type === "group" && event.group_id !== undefined) {
    recordGroupLine(event.group_id, event, rawText);
  }

  const decision = evaluateGroupReply(event, rawText);
  if (!decision.shouldReply) {
    if (event.message_type === "group") {
      const at = messageMentionsBot(event);
      if (at) {
        console.warn(
          `[group] 检测到 @ 但未回复 botId=${resolveBotQqId(event)} self=${event.self_id}`,
        );
      }
    }
    return;
  }

  if (isOwner(event) && isAwaitingSwitchChoice()) {
    const result = await tryCompleteSwitch(text);
    if (result) {
      if (result.ok) {
        await clearChatSessions();
        await replyToEvent(event, `已切换到：${result.name}`);
      } else {
        await replyToEvent(event, result.hint);
      }
      return;
    }
  }

  if (isOwner(event)) {
    const active = await getActivePersona();
    if (active.id === "ayanami") await addSample(text);
  }

  if (await handleCommand(event, text)) return;

  const nick = event.sender?.card || event.sender?.nickname || String(event.user_id);
  const reason = decision.reason ?? "private";
  const modeTag = hashParsed.isHashMode ? "hash" : reason;
  console.log(
    `[msg] ${event.message_type} ${nick} (${modeTag}): ${queryForAi.slice(0, 80)}`,
  );

  try {
    const reply = await generateReply(
      event.message_type,
      String(event.user_id),
      queryForAi,
      event.group_id,
      reason === "mention" ? "mention" : "private",
      decision.contextBlock,
      hashParsed.isHashMode,
    );
    await replyToEvent(event, reply, { hashMode: hashParsed.isHashMode });
    if (event.group_id !== undefined) {
      markGroupReplied(event.group_id, isProactiveReason(decision.reason));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cursor]", msg);
    await replyToEvent(event, `出错了：${msg}`);
  }
}

async function bootstrapData(): Promise<void> {
  await ensureDataDir();
  await migrateLegacyPersonaData();
  const samples = await loadSamples();
  if (samples.length === 0 && config.autoImportSucaiOnStart) {
    try {
      await importFromSucai(false);
    } catch {
      /* ignore */
    }
  }
}

async function main(): Promise<void> {
  await bootstrapData();
  const active = await getActivePersona();
  const prompts = await buildPromptsForActive();
  const botHint = config.botQqId ? config.botQqId : "（启动后从 NapCat 自动识别 self_id）";

  console.log("=== QQ × Cursor 机器人 ===");
  console.log(`机器人 QQ: ${botHint}`);
  console.log(`当前人设: ${active.displayName} (${active.id})`);
  console.log(`快速回复 CHAT_FAST_MODE: ${config.chatFastMode}`);
  console.log(
    `群聊: @ 无冷却立即回；每 ${config.groupProactiveIntervalMs / 60_000} 分钟扫群`,
  );
  console.log(`提示词长度: full=${prompts.full.length} compact=${prompts.compact.length}`);

  startOneBotWs(onMessage);

  startGroupProactiveTimer(async ({ groupId, text, userId, contextBlock }) => {
    console.log(`[group-timer] 群 ${groupId} 定时接话: ${text.slice(0, 40)}`);
    const reply = await generateReply(
      "group",
      userId,
      text,
      groupId,
      "periodic",
      contextBlock,
      false,
    );
    await sendGroupMsg(groupId, reply);
    markGroupReplied(groupId, true);
  });

  const shutdown = async () => {
    await disposeAllAgents();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
