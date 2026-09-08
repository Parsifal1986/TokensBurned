<div align="center">
  <img src="../../public/favicon.svg" width="112" alt="TokensBurned 图标" />
  <h1>TokensBurned</h1>
  <p><strong>记录每一份 token 用量。展示在 GitHub 或个人主页，不上传提示词和源代码。</strong></p>
  <p><a href="../../README.md">English</a> · <strong>简体中文</strong> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a></p>
</div>

<div align="center">
  <h3><a href="https://tokensburned.com/?lang=zh-CN#card-builder">打开在线卡片构建器 →</a></h3>
  <p><sub>选择浅色/深色/自动主题和可选显示元素。预览只使用本地虚构数据。</sub></p>
</div>

TokensBurned 从已支持的 AI coding harness 记录 token 数量和模型元数据，在本地聚合，按服务端安排上传，再生成自动更新的 SVG。卡片可以放进 GitHub Profile、个人主页或其他支持 SVG 图片的页面。

<div align="center"><img src="../../public/demo/card-full.svg" width="840" alt="新版 TokensBurned 卡片，使用虚构示例数据" /></div>

上图使用仓库内置的虚构数据，浏览 README 不会请求你的在线卡片。

## 为什么用 TokensBurned

- **只嵌入一次。** SVG 会在服务器端更新，不需要定时任务，也不会制造难看的 README commit。
- **区分三层身份。** Claude Code 是 harness，不等于模型一定是 Claude。provider 和 model 会分别记录。
- **先在本地缩减。** 原始 session 不会被上传，客户端只输出允许的聚合字段。
- **清晰的隐私边界。** 不上传提示词、回复、源代码、仓库名、transcript 路径和 API key。
- **连接不等于公开。** 默认关闭公开卡片，只有显式执行发布命令后才会把聚合活动与 GitHub 身份关联展示。
- **不夸大兼容性。** 没有用量适配器的 harness 会明确标注不支持，安装 CLI 不等于完成适配。

## 按 harness 安装

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>Claude Code</h3><p><strong>原生插件 + SessionEnd hook</strong></p>
      <pre><code>/plugin marketplace add Parsifal1986/TokensBurned
/plugin install tokensburned@tokensburned
/reload-plugins
/tokensburned:connect</code></pre>
      <p>预览历史导入：<code>/tokensburned:backfill --dry-run --days 90</code></p>
    </td>
    <td width="50%" valign="top">
      <h3>Codex</h3><p><strong>原生 marketplace 插件 + 专用 skill</strong></p>
      <pre><code>codex plugin marketplace add Parsifal1986/TokensBurned
codex plugin add tokensburned@tokensburned</code></pre>
      <p>新建 task 后使用：</p>
      <pre><code>$tokensburned:connect
$tokensburned:backfill
$tokensburned:server</code></pre>
    </td>
  </tr>
</table>

### 当前支持范围

| Harness | 状态 | 范围 |
| --- | --- | --- |
| Claude Code | 支持 | 原生插件 hook、本地历史读取 |
| Codex | 支持 | 原生插件 hook、本地历史读取 |
| OpenCode | 有限适配，实验性 | 仅支持 v1 SQLite，需安装 `sqlite3`；不支持 v2、旧 JSON 存储 |
| Cline CLI / SDK | 条件适配，实验性 | 宿主须提供 `afterModel.assistantMessage.metrics`、模型信息和稳定消息 ID；仅接口契约测试，未完成原生端到端验证，无历史回填，不支持编辑器扩展 |
| Cursor | **暂不支持** | 尚无 token 用量采集适配器 |
| Aider | **暂不支持** | 尚无 token 用量采集适配器 |
| Gemini CLI | **暂不支持用量采集** | 已有设置扩展，但自动采集和历史回填未实现 |
| GitHub Copilot CLI | **暂不支持用量采集** | 已有设置插件，但自动采集和历史回填未实现 |
| 其他 harness | **暂不支持** | 尚无受支持的采集适配器 |

手动导入只是集成接口，**不代表已支持对应 harness**。安装独立 CLI 不会自动获得 Cursor、Aider、Gemini 或 Copilot 的用量。有限适配的要求见[采集范围](../cli-collection.md)。

## 生成 GitHub Profile 卡片

先运行 `tokensburned privacy public` 明确选择公开。该命令会公开总量、harness/provider/model 明细、活动热力图、排名与 GitHub 身份。之后再打开[在线卡片构建器](https://tokensburned.com/?lang=zh-CN#card-builder)，输入用户名并复制 Markdown。链接参数只能隐藏服务器已允许的字段，不能扩大公开范围。

```markdown
[![TokensBurned activity](https://api.tokensburned.com/v1/cards/u/你的_GITHUB_用户名.svg?theme=auto)](https://tokensburned.com/?lang=zh-CN)
```

### 卡片元素

所有卡片固定保留小火苗、7 日趋势、随手涂鸦和底部短语。隐私设置仍然优先：隐藏活动记录后，趋势图不会泄露这些记录。

| 可选元素 | 参数 | 默认 |
| --- | --- | --- |
| 活动热力图 | `heatmap=0\|1` | 开启 |
| Harness 组成 | `stack=0\|1` | 开启 |
| 连续活跃天数 | `streak=0\|1` | 开启 |
| 7 日缓存输入占比 | `cache=0\|1` | 关闭 |
| 排名徽章 | `rank=0\|1` | 关闭 |

主题支持 `theme=auto|light|dark`，省略时使用深色。例如：

```text
?theme=auto&heatmap=1&stack=1&streak=1&cache=1&rank=0
```

旧的完整、紧凑和 Meme 版式已退役，请用新版制作器生成链接。

CDN 未命中时现场生成 SVG，不再把每种款式的 SVG 持久保存到 R2。边缘和浏览器缓存均为一小时。本地采集、云端上传和卡片缓存分别遵守各自的周期，因此卡片是自动更新，并非即时刷新。

## 独立 CLI

下面安装 [v0.6.9 正式发布包](https://github.com/Parsifal1986/TokensBurned/releases/tag/v0.6.9)。npm 仓库版本可能落后于 GitHub Release。

```sh
npm install -g https://github.com/Parsifal1986/TokensBurned/releases/download/v0.6.9/tokensburned-0.6.9.tgz
tokensburned connect
tokensburned run
```

`run` 会安装当前用户的后台服务并在登录后自启，每分钟检查本地用量，持久化去重，并在服务端允许的时间上传；断网后自动按退避时间重试。`run --stop` 停止并取消自启；`run --foreground` 可前台诊断。不需要 root。支持 Codex、Claude Code 和兼容的 OpenCode v1 SQLite 用量（需要 sqlite3）；Cursor、Aider 暂不支持。

日常仅需 `connect`、`run`、`status`（默认命令）、`privacy`、`doctor`、`update` 和 `disconnect`。历史回填、查询云端总量和删除数据放在 `help --advanced`。更新检查可以立即执行，上传不能绕过服务端周期。

旧的 `setup`、普通 `sync`、`render`、`clean` 已废弃，执行会提示迁移，不写 GitHub 也不删除待上传数据。详见[采集范围与命令迁移](../cli-collection.md)。

## 隐私边界

| 会上传 | 永不上传 |
| --- | --- |
| token 数量 | 提示词和回复 |
| harness、provider、model（未识别的网关只记录主机名） | 源代码和工具 payload |
| 哈希后的 session ID | 仓库名与路径 |
| 15 分钟时间桶 | transcript 文件与路径 |
| 请求次数 | API key 与 provider 凭证 |

公开卡片默认关闭。服务端聚合数据会保留到你执行 `tokensburned delete-server-data`；设备凭证 180 天后过期，也可以提前撤销。只有明确执行 `run` 才安装用户级后台服务，不安装 root daemon、流量代理或 Git 同步任务。完整说明见 [SECURITY.md](../../SECURITY.md)。项目采用 [MIT License](../../LICENSE)。

### 免费版设备槽位

每个 GitHub 账号共有 5 个槽位，使用中和冷却中的设备都占用槽位。
设备断开后立即失去访问权限，槽位最多冷却 30 天，凭证先到期则立即释放；其他空闲槽位仍可使用。
原设备保留本地 `~/.burn` 中的设备 ID 即可复用原槽位重连，取消冷却；再次断开后重新计算 30 天。
凭证过期立即释放槽位。原设备重连也需要空闲槽位，并消耗一次连接额度。断开不删除云端历史，删除本地文件也不会释放云端槽位。
CLI 在断开后显示服务端确认的槽位可用时间。

每个账号在滚动 10 分钟内最多成功连接 5 次，滚动 24 小时内最多 10 次；
原设备重连和凭证轮换也计入。断开不会返还次数，授权轮询不计入。

删除整个账号数据再重建，不返还已使用的额度。用量、凭证、账号资料和卡片会删除；
仅保留经密钥处理的账号标识、近期连接时间和未结束的槽位预留时间。
连接记录最多计入 24 小时，删号后的槽位预留最多持续 30 天，凭证先到期则提前释放；到期记录定期清理。
完整规则见[使用限额](https://tokensburned.com/limits.html?lang=zh-CN)。

### 正式版本更新

插件目录固定到已推广的正式 GitHub Release 标签和提交。`tokensburned update` 检查正式发布版本，并给出原生插件管理器更新命令，不会从 `main` 拉取开发版。预发布及本地构建版本跳过远程更新检查，应从本地 checkout 测试。

更新时会合并最近两天的受支持本地历史，并检查上传队列；这不会绕过服务端允许的上传时间。
