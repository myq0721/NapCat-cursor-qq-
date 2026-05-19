import { config } from "./config.js";
import {
  formatGroupContext,
  getActiveGroupIds,
  pickLineForPeriodicReply,
  shouldRunPeriodicNow,
} from "./group-context.js";

export type PeriodicHandler = (payload: {
  groupId: number;
  text: string;
  userId: string;
  nick: string;
  contextBlock: string;
}) => Promise<void>;

export function startGroupProactiveTimer(onTick: PeriodicHandler): void {
  const intervalMs = config.groupProactiveIntervalMs;
  const minutes = Math.round(intervalMs / 60_000);

  const run = () => {
    void (async () => {
      for (const groupId of getActiveGroupIds()) {
        if (!shouldRunPeriodicNow(groupId)) continue;
        const line = pickLineForPeriodicReply(groupId);
        if (!line) continue;
        try {
          await onTick({
            groupId,
            text: line.text,
            userId: line.userId,
            nick: line.nick,
            contextBlock: formatGroupContext(groupId, 15),
          });
        } catch (err) {
          console.error(`[group-timer] 群 ${groupId} 定时回复失败`, err);
        }
      }
    })();
  };

  setInterval(run, intervalMs);
  console.log(`[group] 每 ${minutes} 分钟自动扫群接话（无冷却）`);
}
