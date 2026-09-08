# Harness 兼容性检查（2026-09-08）

> 修复进度：以下保留初次审计证据。后续本地修复已将 Cline 改为逐消息 afterModel 采集，修复模型切换、缓存／推理重复计数及重放；新增 `ingest --upload` 的幂等云导入和能力诊断，并补齐 Gemini 上下文打包。当前使用方式见 [usage-import.md](usage-import.md)。自动适配尚未实现的 harness 仍明确标为显式导入；没有部署或重建已有历史总量。

结论：框架能容纳其他 harness 的名称及聚合数据，但目前不能把 Codex、Claude Code 之外的接入统一标为“自动统计正常”。Gemini / Copilot 只有工作流入口，Cline 有上传代码但存在可复现的重复计数，OpenCode / Cursor / Aider 尚无专用采集适配器。尤其是 README 所说的显式 CLI import，目前只进入本地统计，未接到云卡片。

范围：本次检查 Burn 和 TokensBurned-Cloud 的当前工作区代码、官方文档与隔离的合成数据；没有安装这些 harness，没有访问真实用户凭据、导入真实会话或发布服务。两个仓库原有未提交更改保留。以下是源代码层面的结论，不代表线上部署状态。

## 兼容性矩阵

| Harness | 现有入口 | 当前自动统计 | 缺口与下一步 |
| --- | --- | --- | --- |
| Gemini CLI | `gemini-extension.json`、GEMINI.md、commands、skills | 未打通 | `scripts/hook.js` 能识别 `gemini-cli`，但 `adapterFor()` 无此适配器；`handleHook()` 立即返回。需要 AfterModel 的 usage allowlist、流式去重和 v2 outbox 桥接。 |
| GitHub Copilot CLI | `.plugin/plugin.json`、共享 hooks、skills | 未打通 | `copilot` 无适配器。生命周期 hook 存在并不说明含有用量；需确认目标版本的权威用量事件及插件 hook 方言。 |
| Cline CLI / SDK | `package.json` 的 cline 注册、`integrations/cline/plugin.js` 的 afterRun | 有独立路径，但不能视为准确 | 同一 bucket 切换模型重复计数；runId 未去重；provider/model 来源未按目标 SDK 类型验证。 |
| Cline IDE 扩展 | 无独立适配 | 未打通 | 不应把 CLI / SDK 插件路径等同于 VS Code / JetBrains 覆盖。 |
| OpenCode | 通用 CLI | 未打通 | 官方有插件事件订阅，适合新增本地 adapter；目前仓库无 OpenCode 插件导出及 session/message 读取器。 |
| Cursor | 通用 CLI | 未打通 | 当前无 adapter；需分别验证 IDE、CLI、Cloud、SDK 的字段及父子 agent 覆盖，不能根据某一 surface 推断全部。 |
| Aider | 通用 CLI | 未打通 | 当前无 adapter；须使用 provider 实测 usage，不能把 `/tokens` 当前上下文大小当成累计消耗。 |

所有这些 harness id 都能通过 `normalizeEvent()`。这证明数据模型可扩展，不证明采集、去重、上传已经接通。`historyRoots()`、`doctor()`、`backfill` 与自动同步扫描当前也只覆盖已注册的两个适配器。

## 已确认的问题

### P1：显式 ingest 没有云上传桥接

证据：`src/cli.js` 的 `ingest()` 只调用 `readStats()`、`addEvent()`、`writeStats()`。`sync()` 是旧的 GitHub 分支同步路径；云日聚合需要另走 `syncUsageEntries()`。执行隔离 fixture 后有 `stats.json`，没有 `server-outbox.json`。

影响：Gemini、Copilot、OpenCode 等按 README 使用手动 import，不能据此期待 `api.tokensburned.com` 的卡片随之更新。本地渲染／旧 GitHub sync 与云卡片是两条路径。

修复方向：提供显式 v2 import，把有稳定事件标识、真实时间、独立 token counters 的输入写入日聚合队列。先明确输入是单次增量还是累计快照，再定义重导幂等性；不能把现有 stats 总额重复作为增量上传。

### P1：Cline 切换模型时重复计数

证据：`integrations/cline/plugin.js` 的 `snapshots` 仅以 bucket 为 key，累积时不区分模型。`src/server-outbox.js` 则以 session + bucket + harness + model 区分源。

合成复现（调用原插件的 afterRun，只有 I/O 被替换为内存 fake）：

| 调用 | 实际输入 | 插件生成快照 |
| --- | ---: | ---: |
| model-a | 100 | model-a = 100 |
| model-b，同一 bucket | 200 | model-b = 300 |
| 合计 | **300** | **400** |

修复方向：按稳定的 run/message 身份、模型和 provider 分组，保持 token 语义互斥。若需要 provider 进入唯一性范围，也要同步检查 outbox 源键，不能只改内存 Map。

### P2：Cline 重放与统计粒度不足

`result.runId` 没有用于去重，重复 afterRun 会再次累加；进程级 session 每次随机生成，不具备跨重启的重放身份。`requests += 1` 统计的是 run 次数，而 afterRun 一次可能包含多个模型请求。整次用量按完成时刻落入一个 bucket，因此长任务的小时分布不精确。身份字段取 `result.providerId/modelId` 或顶层 context，但官方 AgentRunResult 列出的字段没有这两个值；需要核对目标版本的 hook context 配置，不能宣称来源识别已经可靠。

这些是代码行为或契约缺口；真实 harness 是否重复投递、哪些上下文含模型身份、usage 是否含累计 cache/reasoning，仍需受控 fixture 或后续小规模运行验证。

### P2：入口文案、诊断与实际能力不一致

- `doctor()` 只遍历 `adapters`，不会诊断 Cline 独立 hook；连接成功不能证明正在采集。
- 共享 `hooks/hooks.json` 包含 `Stop`、嵌套 matcher 和 POSIX 命令。Gemini 的完成回调是 `AfterAgent` / `AfterModel`；Copilot 的官方文档有自己的版本化配置格式及兼容方言。应该按 harness 生成清单，不假设共享文件通用。
- `scripts/hook.js` 的 sanitizer 不读取 Gemini 的 `llm_response.usageMetadata`。即使添加 adapter，也不会自动保留这组计数。
- npm `files` 列表包含 `gemini-extension.json` 却没包含它引用的 `GEMINI.md`；Git 源码安装和 npm 分发内容需分别验证。
- Gemini manifest 描述与“无原生 token 路径”的现状不一致；README 的“CLI collection”应明确为本地，直到 v2 bridge 完成。

## 云端是否限制其他 harness？

`TokensBurned-Cloud/src/protocol.js` 对 dimensions 做格式、长度、数量和总量校验，没有只允许 Codex / Claude 的业务白名单。客户端 outbox 同样接受其他 harness 的规范化名称，因此主要缺口在采集层、正确去重和 import bridge。

当前 `wrangler.toml` 配置 `OTEL_INGEST_ENABLED = "false"`。路由还要求设备认证／请求证明；不能把 Gemini 的 OTLP exporter 直接指向此 API。存在 `src/otel.js` 并不说明当前提供了可用 OTLP 接入。本次未改此开关。

## 官方来源与可行性判断

- [Gemini hooks reference](https://geminicli.com/docs/hooks/reference/)：AfterModel 逐 chunk 触发，稳定响应格式包含 usageMetadata.totalTokenCount。说明可以研究本地 hook bridge；文档中的总量字段不足以直接填入框架五项互斥计数，必须验证详细字段及 streaming 的累计／增量语义。
- [GitHub Copilot hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference) 与 [配置示例](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks)：区分生命周期事件、兼容命名和命令配置；这里的 SessionEnd 契约不能提供框架所需的完整 token counters。
- [Cline plugins](https://docs.cline.bot/sdk/plugins) 与 [AgentRunResult](https://docs.cline.bot/sdk/reference/agent)：确认 afterRun 插件机制，以及 runId、iterations、usage 等返回字段；只证明机制匹配，不能替代本地集成计数正确性验证。
- [OpenCode plugins](https://opencode.ai/docs/plugins/) 与 [SDK](https://opencode.ai/docs/sdk/)：提供 message.updated 等订阅及会话 API。推断它是新 adapter 的优先候选，但仍需固定目标版本、取助手消息的最终 usage 并按消息身份覆盖更新。
- [Cursor hooks](https://cursor.com/docs/hooks) 与 [Python SDK](https://prod.cursor.com/docs/sdk/python)：surface 能力不同；SDK 的结果可提供累计 usage 或空值。应从固定 SDK surface 开始验证，不把它扩展成整个 Cursor 产品的自动支持承诺。
- [Aider commands](https://aider.chat/docs/usage/commands.html) 与 [token limits](https://aider.chat/docs/troubleshooting/token-limits.html)：上下文 token 报告／估算不能替代每次请求的实际消耗。

## 建议实施顺序（本次仅分析，未改采集行为）

1. 先修 Cline 计数身份和显式 v2 import；这是已有入口的正确性问题。
2. 增加统一 capability 状态：入口可用、采集可用、历史支持、云同步、最近一次有效采集；让 doctor 明确显示未支持项。
3. 新增 OpenCode adapter，再做 Gemini 的本地 allowlist bridge。
4. Copilot、Cursor、Aider 等拿到明确版本的权威 usage 契约后逐个接入。

共同验收：零用量、重放、乱序、模型/provider 切换、缓存/推理去重、跨小时、进程重启、子 agent、断网恢复、过期凭据、隐私 allowlist 与 v2 协议总量一致。没有确切 token 时不估算、不冒充精确统计。

## 复现

```sh
node scripts/audit-harnesses.mjs
node --test test/plugin.test.js test/schema.test.js test/server-outbox.test.js
```

第一条只读取集成源文件，使用内存网络替身和临时 BURN_HOME，输出诊断 JSON，最后删除临时数据。它是现状诊断，不是认证其他 harness 已兼容的通过测试。第二条的 28 项针对性检查全部通过，既有集成测试未覆盖上述切换模型问题。

额外验证：Burn 的 `npm test` 完整测试 94/94 通过。初次执行时沙盒禁止测试监听本机端口；允许本机测试服务后重跑通过。没有将“既有测试通过”当成跨 harness 端到端兼容性的证明。

## 后续实施

上文保留初始审计发现与当时的测试结果。Cline 计数身份、持久化导入、能力诊断和 OpenCode 本地读取已在本次 CLI 改动中处理；当前支持范围及验证结果见 [CLI collection](cli-collection.md)。卡片预览不在此次 PR 中。
