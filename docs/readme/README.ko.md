<div align="center"><img src="../../assets/logo.svg" width="112" alt="TokensBurned logo" /><h1>TokensBurned</h1><p><strong>프롬프트와 소스 코드를 업로드하지 않고 AI 코딩 활동을 GitHub Profile에 표시합니다.</strong></p><p><a href="../../README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <strong>한국어</strong> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a></p></div>

TokensBurned는 AI coding harness의 token 수와 모델 메타데이터를 로컬에서 15분 단위로 집계합니다. 라이브 SVG는 24시간, 7일, 30일, 전체 사용량, 일별/시간대 heatmap, harness/provider/model 비교와 익명 순위를 표시할 수 있습니다.

<div align="center"><img src="../../assets/demo-card-builder.gif" width="840" alt="TokensBurned card builder demo" /></div>

## Harness별 설치

| Harness | 명령 | 수집 방식 |
| --- | --- | --- |
| Claude Code | `/plugin marketplace add Parsifal1986/TokensBurned`<br>`/plugin install tokensburned@tokensburned`<br>`/tokensburned:connect` | 기본 SessionEnd hook + 승인된 로컬 기록 |
| Codex | `codex plugin marketplace add Parsifal1986/TokensBurned`<br>`codex plugin add tokensburned@tokensburned`<br>`$tokensburned:connect` | 기본 plugin + 승인된 로컬 기록 |
| Gemini CLI | `gemini extensions install https://github.com/Parsifal1986/TokensBurned`<br>`/tokensburned:connect`<br>`/tokensburned:telemetry` | 공식 GenAI OTLP, `logPrompts=false` |
| Copilot CLI | `copilot plugin install https://github.com/Parsifal1986/TokensBurned` | Plugin workflow + CLI/OTLP |
| Cline CLI | `cline plugin install https://github.com/Parsifal1986/TokensBurned.git` | 기본 `afterRun().result.usage` |
| 기타 | `npm install -g github:Parsifal1986/TokensBurned` | 명시적 OTLP 또는 batch API |

Copilot lifecycle hook은 현재 token 수를 제공하지 않으므로 수집은 CLI 보조 방식입니다. Cline plugin은 CLI, SDK, Kanban에 적용되며 VS Code와 JetBrains 확장에는 아직 적용되지 않습니다.

## Profile 카드 만들기

[온라인 card builder](https://tokensburned.com/#card-builder)에서 사용자 이름과 요소를 선택한 뒤 Markdown을 복사하세요.

```markdown
[![TokensBurned activity](https://api.tokensburned.com/v1/cards/u/YOUR_GITHUB_NAME.svg)](https://tokensburned.com/)
```

- Compact: `?layout=compact&compare=0&rank=1`
- Meme: `?layout=full&heatmap=0&compare=0&meme=1`
- 순위 숨기기: `&rank=0`

## 개인정보 경계

업로드 항목은 token 수, harness, provider, model, 해시된 session ID, 15분 bucket, request 수뿐입니다. 프롬프트, 응답, 코드, repository 이름과 경로, API key는 업로드하지 않습니다. cron, daemon, proxy, Git 동기화도 설치하지 않습니다. 전체 내용은 [SECURITY.md](../../SECURITY.md)를 확인하세요.

[MIT License](../../LICENSE) © 2026 parsifal1986
