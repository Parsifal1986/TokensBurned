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
  <img src="../../assets/demo-card-builder.gif" width="840" alt="TokensBurned 新版卡片的深浅主题与可选内容演示" />
  <p><sub><a href="https://tokensburned.com/?lang=zh-CN#card-builder">打开在线卡片构建器</a>。预览使用的是虚构的本地数据。</sub></p>
</div>

## 功能特性

- **用量卡片。** 展示用量总计、七日趋势、活动热力图、工具分布，以及可选的连续活跃、缓存和排名信息。
- **本地处理。** 在设备上处理用量记录，仅上传汇总计数与工具、提供商和模型标签。
- **默认私有。** 连接账号不会公开卡片，由你决定是否发布。
- **明确的兼容范围。** 依据工具报告的真实用量统计，不按提示词长度或费用估算。

## 支持的 Harness

本表说明当前源码的支持范围。已安装版本请参阅对应[发布标签](https://github.com/Parsifal1986/TokensBurned/releases)下的 README。

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

后台采集需要 Node.js 20 或更新版本及独立 CLI：

```sh
npm install -g tokensburned
```

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

CLI 与插件应使用同一版本、同一个 `BURN_HOME`（默认 `~/.burn`）和同一连接。本地去重允许后台采集器与插件同时运行。

不要用不同数据目录读取同一份历史，也不要手动导入自动采集器已记录的请求，否则可能重复计数。

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

`run` 会安装一个用户级服务，每分钟读取受支持的本地数据源，持久化队列，并自动重试上传，不需要 root 权限。使用 `run --stop` 取消登录自启，在没有受支持服务管理器的平台上或需要诊断时使用 `run --foreground`。`burn` 是 `tokensburned` 的简短别名。

限定范围的历史回填、已认证总量查询、账号删除等维护命令可以通过 `tokensburned help --advanced` 查看。命令迁移说明和手动导入约定见[本地采集约定](../cli-collection.md)和[用量导入](../usage-import.md)。

## 隐私与安全

| 上传的用量数据 | 不包含在用量上传中 |
| --- | --- |
| 汇总 token 数量和请求次数 | 提示词、回复、源代码和工具内容 |
| 工具、提供商和模型标签 | 仓库名、文件路径和原始会话记录 |
| 活动日期和小时 | 会话 ID、API 密钥和提供商凭证 |

用量记录在本地处理，消息内容不会保存在客户端统计中。未知提供商可能以端点主机名标注；发布前可用 `tokensburned doctor` 检查归属信息。

卡片默认私有。用 `tokensburned privacy public` 发布，或用 `tokensburned privacy private` 隐藏。用 `tokensburned disconnect` 断开当前设备；账号数据删除命令见 `tokensburned help --advanced`。

客户端的数据处理与漏洞报告说明见 [SECURITY.md](../../SECURITY.md)。

## 使用限额

当前账号政策和使用限制见[使用限额页面](https://tokensburned.com/limits.html?lang=zh-CN)。

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
