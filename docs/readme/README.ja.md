<div align="center"><img src="../../assets/logo.svg" width="112" alt="TokensBurned logo" /><h1>TokensBurned</h1><p><strong>プロンプトやソースコードを送信せず、AI コーディング活動を GitHub Profile に表示します。</strong></p><p><a href="../../README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <strong>日本語</strong> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a></p></div>

TokensBurned は各 AI coding harness の token 数とモデル情報だけを収集し、ローカルで 15 分単位に集約します。GitHub Profile 用のライブ SVG には 24 時間、7 日、30 日、累計、ヒートマップ、harness/provider/model 比較、匿名ランキングを表示できます。

<div align="center"><img src="../../assets/demo-card-builder.gif" width="840" alt="TokensBurned card builder demo" /></div>

## インストール

| Harness | コマンド | データ経路 |
| --- | --- | --- |
| Claude Code | `/plugin marketplace add Parsifal1986/TokensBurned`<br>`/plugin install tokensburned@tokensburned`<br>`/tokensburned:connect` | ネイティブ SessionEnd hook と承認済み履歴 |
| Codex | `codex plugin marketplace add Parsifal1986/TokensBurned`<br>`codex plugin add tokensburned@tokensburned`<br>`$tokensburned:connect` | ネイティブ plugin と承認済み履歴 |
| Gemini CLI | `gemini extensions install https://github.com/Parsifal1986/TokensBurned`<br>`/tokensburned:connect`<br>`/tokensburned:telemetry` | 公式 GenAI OTLP、`logPrompts=false` |
| Copilot CLI | `copilot plugin install https://github.com/Parsifal1986/TokensBurned` | Plugin workflow + CLI/OTLP |
| Cline CLI | `cline plugin install https://github.com/Parsifal1986/TokensBurned.git` | ネイティブ `afterRun().result.usage` |
| その他 | `npm install -g github:Parsifal1986/TokensBurned` | 明示的な OTLP または batch API |

Copilot の lifecycle hook は現時点で token 数を提供しないため、ネイティブ plugin を使っても収集は CLI 補助です。Cline plugin は CLI、SDK、Kanban 向けで、エディタ拡張にはまだ適用されません。

## Profile カード

[オンライン builder](https://tokensburned.com/#card-builder) でユーザー名と表示要素を選択してください。

```markdown
[![TokensBurned activity](https://api.tokensburned.com/v1/cards/u/YOUR_GITHUB_NAME.svg)](https://tokensburned.com/)
```

- Compact: `?layout=compact&compare=0&rank=1`
- Meme: `?layout=full&heatmap=0&compare=0&meme=1`
- ランク非表示: `&rank=0`

## プライバシー

送信するのは token 数、harness、provider、model、ハッシュ化 session ID、15 分 bucket、request 数だけです。プロンプト、応答、コード、repository 名、path、API key は送信しません。cron、daemon、proxy、Git 同期も作成しません。詳細は [SECURITY.md](../../SECURITY.md) を参照してください。

[MIT License](../../LICENSE) © 2026 parsifal1986
