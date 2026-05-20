# qqbot-cursor

QQ 聊天机器人：通过 [NapCat](https://github.com/NapNeko/NapCatQQ)（OneBot v11）收发消息，用 [Cursor Agent API](https://cursor.com/docs)（`@cursor/sdk`）生成回复。支持多人设切换、`#` 教学模式、群聊 @ 与定时接话。

> **合规**：个人号挂协议端有封号风险，请用小号自用。每条消息会消耗 Cursor API 额度。

---

## 架构

```
QQ 用户 ── NapCat ──► WS (本机 :8080) ──► index.ts
                              ▲              │
                              │              ├── group-reply-policy（@ / # / 定时）
                              │              ├── persona-registry（人设）
                              │              └── cursor-agent.ts ──► Cursor API
                              │
                         HTTP (:3000) ◄── 发消息 send_*_msg
```

| 模块 | 文件 | 职责 |
|------|------|------|
| 入口 | `src/index.ts` | WS 监听、命令、定时扫群 |
| OneBot | `src/onebot.ts` | 反向 WS + HTTP 发消息 |
| Cursor | `src/cursor-agent.ts` | `Agent.create` / `Agent.prompt`、风格学习 |
| 人设 | `src/persona-registry.ts` | `personas/registry.json`、profile / prompt.md |
| 群策略 | `src/group-reply-policy.ts` | 群聊仅 @ 或 `#` 触发即时回复 |
| 群上下文 | `src/group-context.ts` | 内存保留最近 N 条群消息 |
| 定时 | `src/group-timer.ts` | 默认每 20 分钟接话茬 |
| `#` 教学 | `src/hash-query.ts` | `#问题` 长文讲解模式 |
| 素材 | `src/sucai-parser.ts`, `import-sucai.ts` | 解析 QQ 导出 txt |

---

## 环境要求

- Node.js **20+**
- [NapCat](https://github.com/NapNeko/NapCatQQ)（或其它 OneBot v11 实现）
- Cursor **User API Key**（[Dashboard → Integrations](https://cursor.com/dashboard/integrations)）

---

## 快速开始

```powershell
git clone <your-repo-url> qqbot
cd qqbot
npm install
copy .env.example .env
# 编辑 .env：至少填写 CURSOR_API_KEY、OWNER_QQ_ID、BOT_QQ_ID、ONEBOT_HTTP_URL
```

### 1. 准备人设（二选一）

**A. 不耗 Cursor（推荐首次）**

```powershell
copy personas\ayanami\profile.example.json personas\ayanami\profile.json
# 或：放好 sucai.txt 后执行
npm run persona:build
```

**B. 用 Cursor 从聊天记录学习（耗 API）**

```powershell
# 将 QQ 导出 txt 放到项目根 sucai.txt，配置 STYLE_PERSON_NAME / STYLE_PERSON_QQ
npm run import:sucai
npm run style:learn
```

### 2. 配置 NapCat

| 类型 | 地址 |
|------|------|
| WebSocket 客户端（反向） | `ws://127.0.0.1:8080/onebot/v11/ws` |
| HTTP 服务 | 如 `http://127.0.0.1:3000` → 写入 `ONEBOT_HTTP_URL` |

先启动机器人，再在 NapCat 里连接反向 WS。

### 3. 启动

```powershell
npm run start
# 或开发热重载
npm run dev
```

---

## 配置说明（`.env`）

| 变量 | 说明 |
|------|------|
| `CURSOR_API_KEY` | Cursor API 密钥 |
| `OWNER_QQ_ID` | 主人 QQ；`/学习`、`/切换模型` 等 |
| `BOT_QQ_ID` | 机器人 QQ；群 @ 检测 |
| `ONEBOT_HTTP_URL` | NapCat HTTP 基址 |
| `ONEBOT_WS_*` | 本机 WS 监听（默认 8080） |
| `CHAT_FAST_MODE` | `true` 时 @ 走 `Agent.prompt` 单轮（更快） |
| `GROUP_PROACTIVE_INTERVAL_MS` | 定时扫群间隔（默认 20 分钟） |
| `AUTO_IMPORT_SUACAI` | 启动时无样本则自动导入 `sucai.txt` |
| `STYLE_PERSON_*` / `SUACAI_PATH` | 素材导入目标用户 |

完整列表见 [.env.example](./.env.example)。

---

## 人设系统

`personas/registry.json` 注册人设：

| `type` | 目录 | 说明 |
|--------|------|------|
| `full` | `personas/<id>/profile.json` | 风格摘要 + 例句（可 `persona:build`） |
| `markdown` | `personas/<id>/prompt.md` | 整段 Markdown 提示词 |

运行时当前人设保存在 `data/active-persona.json`（本地，不进 Git）。

QQ 命令：`/当前模型`、`/切换模型`（主人）、`/风格`。

---


- 立刻回复（仅这几种）
触发	示例
@ 机器人
@綾波...です ？
#教学模式
#unity是什么
叫名字
含 绫波、Ayanami 等（当前人设关键词）
接话
@ 过机器人后的延续，如「教我游戏开发」

- 不立刻回复
情况	行为
只 @ 别人
如 @高价回收旧手机 520快乐 → 不立刻回，等定时扫群
普通闲聊
同上，走 20 分钟扫群（已修正间隔）
定时扫群时会：

优先挑带「绫波 / Ayanami」等关键词的消息
跳过「只 @ 别人、没提机器人」的消息（避免再误接 520 祝福这类）

---

## npm 脚本

| 命令 | 作用 |
|------|------|
| `npm run start` | 启动机器人 |
| `npm run dev` | `tsx watch` 开发模式 |
| `npm run build` | `tsc` 编译到 `dist/` |
| `npm run persona:build` | 从 `sucai.txt` 本地提炼 `profile.json`（**不调用 Cursor**） |
| `npm run persona:build:full` | 同上并强制重新导入样本 |
| `npm run import:sucai` | 从 `sucai.txt` 导入 `personas/ayanami/samples.json` |
| `npm run import:sucai:force` | 覆盖已有样本 |
| `npm run style:learn` | 用 Cursor 分批学习风格 → `profile.json` |

---

## QQ 命令

| 命令 | 权限 | 说明 |
|------|------|------|
| `/帮助` | 所有人 | 简要说明 |
| `/当前模型` | 所有人 | 当前人设 |
| `/切换模型` | 主人 | 切换 ayanami / lingbo 等 |
| `/风格` | 所有人 | 查看当前人设摘要 |
| `/样本数` `/提炼` `/导入素材` `/学习` | 主人 | 仅 `ayanami` 人设 |

---

## 功能

#群聊消息汇总

---

## 开发

```powershell
npm run dev
```

- **ESM** + **TypeScript**，入口 `src/index.ts`，编译目标 `ES2022`。
- 修改人设后建议 `/切换模型` 或重启；`/提炼`、`/学习` 会 `clearChatSessions()`。
- 扩展新人设：在 `personas/` 下新建目录，并编辑 `registry.json`。

### 扩展为「改代码机器人」

将 `CURSOR_CWD` 指向目标仓库，并调整 `style-profile.ts` / `chat-rules.ts` 中「不要改文件」类约束。
