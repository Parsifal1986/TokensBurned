<div align="center">
  <img src="../../public/favicon.svg" width="112" alt="TokensBurned 图标" />
  <h1>TokensBurned</h1>
  <p><strong>以隐私为先，将你的 AI 编程活动展示在 GitHub Profile 上。</strong></p>
  <p>
    <a href="https://tokensburned.com/"><img alt="网站" src="https://img.shields.io/badge/website-tokensburned.com-eb6733?style=flat-square"></a>
    <a href="https://www.npmjs.com/package/tokensburned"><img alt="npm" src="https://img.shields.io/npm/v/tokensburned?style=flat-square&label=npm"></a>
    <a href="https://github.com/Parsifal1986/TokensBurned/releases"><img alt="GitHub 版本" src="https://img.shields.io/github/v/release/Parsifal1986/TokensBurned?style=flat-square&label=release"></a>
    <a href="https://github.com/Parsifal1986/TokensBurned/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Parsifal1986/TokensBurned/ci.yml?style=flat-square&label=ci"></a>
    <a href="../../LICENSE"><img alt="MIT 许可证" src="https://img.shields.io/badge/license-MIT-f1eadf?style=flat-square"></a>
  </p>
  <p>
    <a href="../../README.md">English</a> · <strong>简体中文</strong> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a>
  </p>
</div>

TokensBurned 将你的 AI 编程工具的 token 用量转化为一张实时更新的 GitHub Profile SVG 卡片。客户端从 Claude Code、Codex 等 harness 读取用量元数据，在本地归并为聚合计数器，只上传这些聚合数据。提示词、回复和源代码永远不会离开你的设备。

<div align="center">
  <img src="../../assets/demo-card-builder.gif" width="840" alt="TokensBurned 卡片构建器在完整、紧凑和 meme 版式之间切换的演示" />
  <p><sub><a href="https://tokensburned.com/?lang=zh-CN#card-builder">打开在线卡片构建器</a>。预览使用的是虚构的本地数据。</sub></p>
</div>

## 功能特性

- **实时 Profile 卡片。** 一个图片链接即可展示 24 小时、7 天、30 天和总计用量，日与小时热力图，harness、provider 和 model 对比，以及匿名的站内排名。无需定时任务，也无需提交 README。
- **本地归并。** Session 会先在你的设备上归并为 15 分钟的时间桶，再上传。
- **严格的隐私边界。** 提示词、回复、源代码、仓库名、transcript 路径和 API key 永远不会被采集。参见[隐私与安全](#隐私与安全)。
- **默认不公开。** 连接账号并上传聚合数据不会自动创建公开卡片，发布是另一个需要显式执行的命令。
- **准确归因。** harness、provider 和 model 会作为三个独立身份分别记录。如果某个 Claude Code session 实际调用了另一个 provider，也会如实标注。
- **如实标注兼容性。** 原生 hook、插件工作流和独立 CLI 会分别标注，让你清楚每个 harness 是如何被统计的。

## 支持的 Harness

| Harness | 安装方式 | Token 来源 | 支持程度 |
| --- | --- | --- | --- |
| Claude Code | 插件市场 | 生命周期 hook 与经过确认的本地历史 | 原生支持 |
| Codex | 插件市场 | 插件 hook 与经过确认的本地历史 | 原生支持 |
| Cline CLI / SDK / classic IDE | Cline 插件与独立 CLI | 逐条消息的 `afterModel`、SDK 消息与经典任务指标 | 按格式区分的逐次采集与历史回填 |
| OpenCode | 独立 CLI | v1/v2 SQLite 与旧版消息 JSON | 已完成请求的用量；支持历史回填 |
| Gemini CLI | Gemini extension 与独立 CLI | 记录下来的 JSON/JSONL 用量 | 后台采集与历史回填 |
| GitHub Copilot CLI | 设置插件与实时 extension | 官方的 `assistant.usage` 事件 | 实时逐次采集；不支持 transcript 回填 |
| Cursor、Aider 等 | 独立 CLI | 由接入方提供的观测用量 | 不支持自动采集 |

TokensBurned 不会根据提示词长度或费用估算 token，也不接受遥测导出器流量。各数据源的详细说明见[本地采集约定](../cli-collection.md)。

## 快速开始

<div align="center">
  <img src="../../assets/demo-install.gif" width="840" alt="TokensBurned 安装器在 Claude Code、Codex 和 Gemini CLI 之间切换的演示" />
</div>

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>Claude Code</h3>
      <pre><code>/plugin marketplace add Parsifal1986/TokensBurned
/plugin install tokensburned@tokensburned
/reload-plugins
/tokensburned:connect</code></pre>
      <p>可选的历史导入（先预览）：</p>
      <pre><code>/tokensburned:backfill --dry-run --days 90</code></pre>
    </td>
    <td width="50%" valign="top">
      <h3>Codex</h3>
      <pre><code>codex plugin marketplace add Parsifal1986/TokensBurned
codex plugin add tokensburned@tokensburned</code></pre>
      <p>新建一个 task，然后使用内置的 skill：</p>
      <pre><code>$tokensburned:connect
$tokensburned:backfill
$tokensburned:server
$tokensburned:privacy
$tokensburned:update
$tokensburned:doctor</code></pre>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>Cline CLI / SDK</h3>
      <pre><code>cline plugin install https://github.com/Parsifal1986/TokensBurned.git</code></pre>
      <p>兼容的宿主通过 <code>afterModel</code> 上报逐条消息的用量。后台采集器还会读取 SDK 消息历史和经典 IDE 的任务指标。hook 与 SDK 历史共享请求身份，因此同时采集两者不会重复计入 token。详见<a href="../cli-collection.md">支持的格式与限制</a>。</p>
    </td>
    <td width="50%" valign="top">
      <h3>OpenCode 及其他工具</h3>
      <pre><code>npm install -g tokensburned
tokensburned connect
tokensburned run --harness opencode</code></pre>
      <p>采集器会读取 OpenCode v1/v2 的 SQLite 用量以及旧版消息 JSON。SQLite 需要安装 <code>sqlite3</code>。Cursor 和 Aider 目前还没有自动读取器。</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>Gemini CLI</h3>
      <pre><code>gemini extensions install https://github.com/Parsifal1986/TokensBurned
gemini
/tokensburned:connect</code></pre>
      <p>该 extension 提供设置用的 skill。执行 <code>tokensburned run --harness gemini-cli</code> 即可采集记录下来的 JSON/JSONL session 用量，包括子 session。用 <code>tokensburned backfill --harness gemini-cli --dry-run</code> 预览历史。</p>
    </td>
    <td width="50%" valign="top">
      <h3>GitHub Copilot CLI</h3>
      <pre><code>copilot plugin install https://github.com/Parsifal1986/TokensBurned</code></pre>
      <p>连接之后，执行 <code>tokensburned integrations install copilot</code>，再启动 <code>copilot --experimental</code>。该实时 extension 会记录官方的逐次调用用量事件，包括 subagent。这些事件无法从普通的 session 历史中恢复。仅安装设置插件并不会启用采集。</p>
    </td>
  </tr>
</table>

### 采集原理

- **生命周期 hook。** 在 Claude Code 和 Codex 中，插件会在每一轮结束后把当前 transcript 归并进本地队列，并在启动时重新检查最近的 session，因此一个没有正常结束的 session 依然会被计入。
- **CLI 与插件协同。** 两者共用同一个 <code>BURN_HOME</code>（默认为 <code>~/.burn</code>）和设备凭证。它们共享的队列会对请求和 transcript 快照去重，服务端会以每个设备当天的最新版本为准。如果不同的 home 目录或设备读取了同一份历史，可能会重复计数；匿名的云端总量无法对这些重复数据去重。
- **定时上传。** 已入队的聚合数据会按服务端的计划上传，默认最多每小时一次。没有任何命令可以强制提前上传。
- **更新提示。** 已安装的插件最多每 24 小时检查一次新版本，如果存在对应的原生插件管理器命令就会打印出来。更新永远不会在未经显式请求的情况下自动安装，检查失败也不会阻塞启动。
- **引导流程。** 已安装但尚未连接时，插件最多提醒三次 connect 命令，之后就会保持静默。

## Profile 卡片

卡片在你主动开启之前始终是私有的：

```sh
tokensburned privacy public
```

发布会公开总量、harness、provider 和 model 明细、活动热力图、排名以及你的 GitHub 身份。该设置属于你的 GitHub 账号，所有已连接的设备共享同一个选择。然后打开[卡片构建器](https://tokensburned.com/?lang=zh-CN#card-builder)，输入你的 GitHub 用户名，选择一个预设，再把 Markdown 粘贴进你的 Profile README：

```markdown
[![TokensBurned activity](https://api.tokensburned.com/v1/cards/u/YOUR_GITHUB_NAME.svg?theme=auto)](https://tokensburned.com/?lang=zh-CN)
```

<div align="center">
  <img src="../../public/demo/card-full.svg" width="840" alt="使用虚构示例数据渲染的 TokensBurned 卡片" />
  <p><sub>使用仓库内置的虚构数据渲染。浏览本 README 不会调用 TokensBurned API。</sub></p>
</div>

### 卡片元素

每张卡片都保留火焰形象、七日趋势、涂鸦和底部文案。可选元素通过查询参数开关：

| 元素 | 参数 | 默认 |
| --- | --- | --- |
| 活动热力图 | `heatmap=0\|1` | 开 |
| harness 明细 | `stack=0\|1` | 开 |
| 连续活跃天数 | `streak=0\|1` | 开 |
| 最近七天的缓存输入占比 | `cache=0\|1` | 关 |
| 排名徽章 | `rank=0\|1` | 关 |

`theme=auto|light|dark` 用于选择外观。省略时使用 `dark`，`auto` 跟随访客的配色方案。例如：

```text
?theme=auto&heatmap=1&stack=1&streak=1&cache=1&rank=0
```

隐私设置始终生效。被隐藏的活动历史不会出现在趋势中，查询参数也无法展示你的账号尚未发布的任何内容。旧的 full、compact、meme 版式预设已经停用，请使用卡片构建器生成当前链接。

## 命令行

独立 CLI 适用于所有 harness，也是各插件背后的传输层。

```sh
npm install -g tokensburned
tokensburned connect
tokensburned run
```

| 命令 | 作用 |
| --- | --- |
| `tokensburned` | 查看本地采集与上传状态 |
| `tokensburned connect` | 授权你的 GitHub 账号并创建设备凭证 |
| `tokensburned run` | 启动后台采集，并在 macOS 和 Linux 上启用登录自启 |
| `tokensburned privacy [public\|private]` | 查看或修改卡片可见性 |
| `tokensburned doctor` | 诊断采集、连接和隐私状态 |
| `tokensburned update` | 检查新版本并补齐最近的历史数据 |
| `tokensburned disconnect` | 撤销当前设备的凭证 |

`run` 会安装一个用户级服务，每分钟读取受支持的本地数据源，持久化队列，并按服务端计划重试，不需要 root 权限。使用 `run --stop` 取消登录自启，在没有受支持服务管理器的平台上或需要诊断时使用 `run --foreground`。`burn` 是 `tokensburned` 的简短别名。

限定范围的历史回填、已认证总量查询、账号删除等维护命令可以通过 `tokensburned help --advanced` 查看。命令迁移说明和手动导入约定见[本地采集约定](../cli-collection.md)和[用量导入](../usage-import.md)。

## 隐私与安全

| 会上传 | 永不上传 |
| --- | --- |
| Token 数量 | 提示词和回复 |
| Harness、provider 和 model 标签 | 源代码和工具 payload |
| 哈希后的 session 标识 | 仓库名和路径 |
| 15 分钟时间桶 | Transcript 文件和路径 |
| 请求次数 | API key 和 provider 凭证 |

无法识别的网关只会以主机名的形式记录。设备凭证在 180 天后过期，也可以随时用 `tokensburned disconnect` 撤销。服务端聚合数据会一直保留，直到你执行 `tokensburned delete-server-data`。TokensBurned 不会安装 root daemon、流量代理或 Git 同步任务。完整的数据边界和认证模型记录在 [SECURITY.md](../../SECURITY.md) 中。

## 使用限额

- 每个 GitHub 账号有 5 个设备槽位。设备断开连接后，其槽位最多保留 30 天，同一设备可以在这段时间内重新连接回原槽位。
- 每个账号成功连接次数限制为滚动 10 分钟内最多 5 次、滚动 24 小时内最多 10 次。
- 历史回填支持用户自选的 1 到 90 天范围。
- 删除服务端数据会移除用量、凭证、账号资料和公开卡片。尚未到期的槽位预留和连接额度仍按原定时间过期。

完整规则发布在 [tokensburned.com/limits](https://tokensburned.com/limits.html?lang=zh-CN)。

## 文档

- [网站与卡片构建器](https://tokensburned.com/?lang=zh-CN)
- [安全与隐私边界](../../SECURITY.md)
- [本地采集约定与命令迁移](../cli-collection.md)
- [面向集成方的用量导入约定](../usage-import.md)
- [使用限额](https://tokensburned.com/limits.html?lang=zh-CN)

## 贡献

欢迎贡献代码。请阅读 [CONTRIBUTING.md](../../CONTRIBUTING.md) 了解本地环境搭建、测试方法以及新增采集路径的规则。在提交公开 issue 之前，请按照 [SECURITY.md](../../SECURITY.md) 中的说明私下报告安全问题。

## 许可证

[MIT](../../LICENSE) © 2026 [Parsifal1986](https://github.com/Parsifal1986)
