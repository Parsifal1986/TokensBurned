<div align="center"><img src="../../public/favicon.svg" width="112" alt="TokensBurned logo" /><h1>TokensBurned</h1><p><strong>프롬프트와 소스 코드를 업로드하지 않고 AI 코딩 활동을 GitHub Profile에 표시합니다.</strong></p><p><a href="../../README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <strong>한국어</strong> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a></p></div>

TokensBurned는 지원하는 harness의 token 사용량을 로컬에서 집계하고 서버 일정에 따라 업로드합니다. SVG는 GitHub와 개인 사이트에 삽입할 수 있습니다. 예시는 가상 데이터입니다.

<div align="center"><img src="../../public/demo/card-full.svg" width="840" alt="TokensBurned — demo" /></div>

## 지원 범위

| Harness | Status |
| --- | --- |
| Claude Code / Codex | 지원: 플러그인 hook 및 로컬 기록 |
| OpenCode | 제한적·실험적: v1 SQLite만 지원, sqlite3 필요. v2 / JSON 미지원 |
| Cline CLI / SDK | 조건부·실험적: afterModel 사용량, 모델, 안정적인 ID 필요. 계약 테스트만 완료. 실제 종단 간 검증, 기록 가져오기, 편집기 확장 미지원 |
| Cursor / Aider | **미지원: 사용량 어댑터 없음** |
| Gemini CLI / GitHub Copilot CLI | **사용량 수집 미지원: 설정 플러그인만 제공. 자동 수집 및 기록 가져오기 없음** |
| Other | **미지원: 사용량 어댑터 없음** |

수동 가져오기나 CLI 설치는 해당 harness 지원을 의미하지 않습니다.

### Claude Code

```text
/plugin marketplace add Parsifal1986/TokensBurned
/plugin install tokensburned@tokensburned
/reload-plugins
/tokensburned:connect
```

### Codex

```text
codex plugin marketplace add Parsifal1986/TokensBurned
codex plugin add tokensburned@tokensburned
```

```text
$tokensburned:connect
```

### CLI — GitHub Release v0.6.9

```sh
npm install -g https://github.com/Parsifal1986/TokensBurned/releases/download/v0.6.9/tokensburned-0.6.9.tgz
```

`tokensburned connect`로 연결한 뒤 `tokensburned run`으로 백그라운드 서비스와 로그인 시 자동 시작을 설정하세요(macOS/Linux). Codex, Claude Code, 호환되는 OpenCode v1 SQLite(sqlite3 필요)의 사용량을 수집하고 서버 일정에 따라 전송 및 재시도합니다. `run --stop`으로 서비스와 자동 시작을 중지하고 `run --foreground`로 진단할 수 있습니다. Cursor와 Aider 자동 수집은 지원하지 않습니다. 유지보수는 `help --advanced`에 있습니다. `setup`, 옵션 없는 `sync`, `render`, `clean`은 폐기되었습니다.

[Collection contracts](../cli-collection.md)

## SVG

`tokensburned privacy public`

[Card builder](https://tokensburned.com/?lang=ko#card-builder)

```markdown
[![TokensBurned activity](https://api.tokensburned.com/v1/cards/u/YOUR_GITHUB_NAME.svg?theme=auto)](https://tokensburned.com/?lang=ko)
```

불꽃 캐릭터, 7일 추세, 낙서, 짧은 문구는 항상 표시됩니다. 비공개 기록은 추세에도 표시되지 않습니다.

- 활동 히트맵: `heatmap=0|1`
- Harness 구성: `stack=0|1`
- 연속 활동 일수: `streak=0|1`
- 7일 캐시 입력 비율: `cache=0|1`
- 순위 배지: `rank=0|1`

기본값: heatmap / stack / streak 켜짐, cache / rank 꺼짐. theme=auto|light|dark이며 생략하면 dark입니다. 이전 full / compact / meme 레이아웃은 폐기되었습니다.

CDN 캐시 미스 시 SVG를 생성하며 스타일별 SVG를 R2에 저장하지 않습니다. 캐시는 1시간이며 즉시 갱신되지는 않습니다.

## 정식 버전 업데이트

update는 정식 GitHub Release를 확인하며 main 개발 버전을 받지 않습니다. 사전 출시 및 로컬 빌드는 로컬에서 테스트합니다. 업데이트 중 기록을 가져와도 서버 업로드 주기를 우회하지 않습니다.

## 개인정보 경계

업로드 항목은 token 수, harness, provider, model, 해시된 session ID, 15분 bucket, request 수뿐입니다. 프롬프트, 응답, 코드, repository 이름과 경로, API key는 업로드하지 않습니다. 서버 데이터는 `tokensburned delete-server-data`를 실행할 때까지 보존되고 기기 자격 증명은 180일 후 만료됩니다. 전체 내용은 [SECURITY.md](../../SECURITY.md)를 확인하세요.

[MIT License](../../LICENSE) © 2026 parsifal1986
