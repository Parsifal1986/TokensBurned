<div align="center">
  <img src="../../assets/logo.svg" width="112" alt="TokensBurned logo" />
  <h1>TokensBurned</h1>
  <p><strong>프라이버시를 지키는 AI 코딩 활동을 GitHub 프로필에 표시합니다.</strong></p>
  <p>
    <a href="https://tokensburned.com/"><img alt="Website" src="https://img.shields.io/badge/website-tokensburned.com-eb6733?style=flat-square"></a>
    <a href="https://www.npmjs.com/package/tokensburned"><img alt="npm" src="https://img.shields.io/npm/v/tokensburned?style=flat-square&label=npm"></a>
    <a href="https://github.com/Parsifal1986/TokensBurned/releases"><img alt="GitHub release" src="https://img.shields.io/github/v/release/Parsifal1986/TokensBurned?style=flat-square&label=release"></a>
    <a href="https://github.com/Parsifal1986/TokensBurned/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Parsifal1986/TokensBurned/ci.yml?style=flat-square&label=ci"></a>
    <a href="../../LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-f1eadf?style=flat-square"></a>
  </p>
  <p>
    <a href="../../README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <strong>한국어</strong> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a>
  </p>
  <p>
    <a href="#빠른-시작">빠른 시작</a> ·
    <a href="#profile-카드">Profile 카드</a> ·
    <a href="#command-line">Command Line</a> ·
    <a href="#개인정보와-보안">개인정보</a> ·
    <a href="#문서">문서</a>
  </p>
</div>

TokensBurned는 AI 코딩 도구의 token 사용량을 GitHub 프로필용 실시간 SVG 카드로 변환합니다. 클라이언트는 Claude Code, Codex와 같은 harness에서 사용량 메타데이터를 읽어 로컬에서 집계 카운터로 축소한 뒤 그 집계 값만 업로드합니다. 프롬프트, 응답, 소스 코드는 사용자의 기기를 벗어나지 않습니다.

<div align="center">
  <img src="../../assets/demo-card-builder.gif" width="840" alt="TokensBurned card builder switching between full, compact, and meme layouts" />
  <p><sub><a href="https://tokensburned.com/?lang=ko#card-builder">인터랙티브 card builder 열기</a>. 미리보기는 가상의 로컬 데이터를 사용합니다.</sub></p>
</div>

## 기능

- **Live profile card.** 이미지 URL 하나로 24시간, 7일, 30일, 전체 기간 합계, 일별·시간대별 heatmap, harness·provider·model 비교, 익명 사이트 전체 순위를 표시합니다. 예약된 작업이나 README 커밋이 필요하지 않습니다.
- **Local reduction.** 세션은 업로드되기 전에 사용자의 기기에서 15분 단위 버킷으로 축소됩니다.
- **Strict privacy boundary.** 프롬프트, 응답, 소스 코드, repository 이름, transcript 경로, API key는 수집되지 않습니다. 자세한 내용은 [개인정보와 보안](#개인정보와-보안)을 참고하세요.
- **Private by default.** 계정을 연결하고 집계 값을 업로드하는 것만으로는 공개 카드가 생성되지 않습니다. 게시는 별도의 명시적인 명령입니다.
- **Accurate attribution.** harness, provider, model은 서로 다른 식별자로 별도 기록됩니다. 다른 provider와 통신하는 Claude Code 세션은 그에 맞게 표시됩니다.
- **Honest compatibility.** 네이티브 hook, plugin workflow, 독립형 CLI가 각각 구분되어 표시되므로 각 harness가 어떻게 측정되는지 알 수 있습니다.

## 지원하는 Harness

| Harness | 설치 방식 | Token 소스 | 지원 수준 |
| --- | --- | --- | --- |
| Claude Code | Plugin marketplace | Lifecycle hook 및 승인된 로컬 기록 | Native |
| Codex | Plugin marketplace | Plugin hook 및 승인된 로컬 기록 | Native |
| Cline CLI / SDK / classic IDE | Cline plugin과 standalone CLI | `afterModel`, SDK 메시지, classic task metrics | 형식별 호출 단위 캡처와 backfill |
| OpenCode | Standalone CLI | v1/v2 SQLite 및 legacy message JSON | 완료된 요청 사용량; 기록 backfill |
| Gemini CLI | Gemini extension과 standalone CLI | 기록된 JSON/JSONL 사용량 | 백그라운드 수집과 backfill |
| GitHub Copilot CLI | 설정용 plugin과 live extension | 공식 `assistant.usage` 이벤트 | 호출 단위 실시간 캡처; transcript backfill 없음 |
| Cursor, Aider 등 | Standalone CLI | Integrator가 제공하는 관측 사용량 | 자동 캡처 없음 |

TokensBurned는 프롬프트 길이나 비용으로 token을 추정하지 않으며, telemetry exporter 트래픽도 받지 않습니다. 각 소스에 대한 자세한 내용은 [Local collection contracts](../cli-collection.md)에 있습니다.

## 빠른 시작

<div align="center">
  <img src="../../assets/demo-install.gif" width="840" alt="TokensBurned installer switching between Claude Code, Codex, and Gemini CLI" />
</div>

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>Claude Code</h3>
      <pre><code>/plugin marketplace add Parsifal1986/TokensBurned
/plugin install tokensburned@tokensburned
/reload-plugins
/tokensburned:connect</code></pre>
      <p>선택적으로 기록을 가져올 수 있습니다(먼저 미리보기 실행):</p>
      <pre><code>/tokensburned:backfill --dry-run --days 90</code></pre>
    </td>
    <td width="50%" valign="top">
      <h3>Codex</h3>
      <pre><code>codex plugin marketplace add Parsifal1986/TokensBurned
codex plugin add tokensburned@tokensburned</code></pre>
      <p>새 작업을 시작한 뒤 번들로 제공되는 skill을 사용하세요:</p>
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
      <p>호환되는 host는 <code>afterModel</code>을 통해 메시지별 사용량을 보고합니다. 백그라운드 collector는 SDK message 기록과 classic IDE task metrics도 읽습니다. Hook과 SDK 기록은 request 식별자를 공유하므로 둘 다 수집해도 token이 두 번 집계되지는 않습니다. <a href="../cli-collection.md">지원되는 형식과 제한 사항</a>을 참고하세요.</p>
    </td>
    <td width="50%" valign="top">
      <h3>OpenCode and other tools</h3>
      <pre><code>npm install -g tokensburned
tokensburned connect
tokensburned run --harness opencode</code></pre>
      <p>Collector는 OpenCode v1/v2 SQLite 사용량과 legacy message JSON을 읽습니다. SQLite에는 <code>sqlite3</code>이 필요합니다. Cursor와 Aider는 아직 자동 reader가 없습니다.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>Gemini CLI</h3>
      <pre><code>gemini extensions install https://github.com/Parsifal1986/TokensBurned
gemini
/tokensburned:connect</code></pre>
      <p>Extension이 설정용 skill을 제공합니다. <code>tokensburned run --harness gemini-cli</code>를 실행하면 child session을 포함한 기록된 JSON/JSONL session 사용량을 수집합니다. <code>tokensburned backfill --harness gemini-cli --dry-run</code>으로 기록을 미리 볼 수 있습니다.</p>
    </td>
    <td width="50%" valign="top">
      <h3>GitHub Copilot CLI</h3>
      <pre><code>copilot plugin install https://github.com/Parsifal1986/TokensBurned</code></pre>
      <p>연결한 뒤 <code>tokensburned integrations install copilot</code>을 실행하고 <code>copilot --experimental</code>을 시작하세요. Live extension은 subagent를 포함한 공식 호출 단위 사용량 이벤트를 기록합니다. 이 이벤트는 일반 session 기록에서 복구할 수 없습니다. 설정용 plugin만으로는 캡처가 활성화되지 않습니다.</p>
    </td>
  </tr>
</table>

### 수집 방식

- **Lifecycle hooks.** Claude Code와 Codex에서 plugin은 각 turn이 끝난 뒤 현재 transcript를 로컬 큐로 축소하고, 시작 시 최근 세션을 다시 확인하므로 정상 종료되지 않은 세션도 계속 집계됩니다.
- **CLI와 plugin을 함께 사용하기.** 동일한 `BURN_HOME`(기본값 `~/.burn`)과 device 자격 증명을 사용하세요. 공유 큐가 request와 transcript snapshot의 중복을 제거하고, 서버는 각 device의 일일 revision을 교체합니다. 서로 다른 home/device가 동일한 기록을 읽으면 중복 집계될 수 있으며, 익명 클라우드 합계는 그 중복 사본을 제거할 수 없습니다.
- **Scheduled uploads.** 큐에 쌓인 집계 값은 서비스 일정에 따라 기본적으로 최대 시간당 한 번 업로드됩니다. 어떤 명령으로도 조기 업로드를 강제할 수 없습니다.
- **Update notices.** 설치된 plugin은 최대 24시간에 한 번 새 릴리스를 확인하고, 존재할 경우 네이티브 plugin manager 명령을 출력합니다. 업데이트는 명시적 요청 없이는 설치되지 않으며, 확인 실패가 시작을 막지 않습니다.
- **Onboarding.** 설치되었지만 연결되지 않은 동안 plugin은 최대 세 번 connect 명령을 안내한 뒤 조용해집니다.

## Profile 카드

명시적으로 동의하기 전까지 카드는 비공개입니다:

```sh
tokensburned privacy public
```

게시하면 합계, harness·provider·model별 분석, 활동 heatmap, 순위, GitHub 식별 정보가 공개됩니다. 이 설정은 GitHub 계정에 귀속되므로 연결된 모든 기기가 동일한 설정을 공유합니다. 그런 다음 [card builder](https://tokensburned.com/?lang=ko#card-builder)를 열어 GitHub 사용자 이름을 입력하고 preset을 선택한 뒤 Markdown을 프로필 README에 붙여넣으세요:

```markdown
[![TokensBurned activity](https://api.tokensburned.com/v1/cards/u/YOUR_GITHUB_NAME.svg?theme=auto)](https://tokensburned.com/?lang=ko)
```

<div align="center">
  <img src="../../public/demo/card-full.svg" width="840" alt="TokensBurned card rendered from fictional sample data" />
  <p><sub>번들에 포함된 가상 데이터로 렌더링되었습니다. 이 README를 보는 것만으로는 TokensBurned API가 호출되지 않습니다.</sub></p>
</div>

### 카드 요소

모든 카드에는 불꽃 캐릭터, 7일 추세, 낙서, 캡션이 항상 포함됩니다. 선택 요소는 query parameter로 켜고 끕니다.

| 요소 | Parameter | 기본값 |
| --- | --- | --- |
| 활동 heatmap | `heatmap=0\|1` | 켬 |
| Harness 분석 | `stack=0\|1` | 켬 |
| 연속 활동 일수 | `streak=0\|1` | 켬 |
| 최근 7일의 캐시 입력 비율 | `cache=0\|1` | 끔 |
| 순위 배지 | `rank=0\|1` | 끔 |

`theme=auto|light|dark`로 외관을 선택합니다. 생략하면 `dark`가 사용되고, `auto`는 보는 사람의 color scheme을 따릅니다. 예:

```text
?theme=auto&heatmap=1&stack=1&streak=1&cache=1&rank=0
```

개인정보 설정은 항상 적용됩니다. 숨겨진 활동 기록은 추세에 나타나지 않으며, query parameter로 계정이 게시하지 않은 내용을 드러낼 수 없습니다. 이전의 full, compact, meme 레이아웃 preset은 폐지되었습니다. 현재 링크는 카드 빌더로 생성하세요.

## Command Line

Standalone CLI는 모든 harness와 함께 동작하며 plugin 뒤에서 전송을 담당합니다.

```sh
npm install -g tokensburned
tokensburned connect
tokensburned run
```

| Command | 설명 |
| --- | --- |
| `tokensburned` | 로컬 수집 및 업로드 상태 표시 |
| `tokensburned connect` | GitHub 계정을 인증하고 기기 자격 증명 생성 |
| `tokensburned run` | 백그라운드 수집 시작 및 로그인 시 자동 시작 활성화(macOS, Linux) |
| `tokensburned privacy [public\|private]` | 카드 공개 여부 확인 또는 변경 |
| `tokensburned doctor` | 수집, 연결, 개인정보 설정 진단 |
| `tokensburned update` | 새 릴리스 확인 및 최근 기록 반영 |
| `tokensburned disconnect` | 이 기기의 자격 증명 폐기 |

`run`은 지원되는 로컬 소스를 1분에 한 번 읽고 큐를 유지하며 서비스 일정에 따라 재시도하는 사용자 수준 서비스를 설치합니다. root 권한이 필요하지 않습니다. 로그인 시 자동 시작을 제거하려면 `run --stop`을, 진단 용도나 지원되는 서비스 관리자가 없는 플랫폼에서는 `run --foreground`를 사용하세요. `burn`은 `tokensburned`의 더 짧은 별칭입니다.

범위를 지정한 기록 backfill, 인증된 합계 조회, 계정 삭제 같은 유지보수 명령은 `tokensburned help --advanced`로 확인할 수 있습니다. 명령 마이그레이션 안내와 수동 import contract는 [Local collection contracts](../cli-collection.md)와 [Usage import](../usage-import.md)에 있습니다.

## 개인정보와 보안

| 업로드됨 | 업로드되지 않음 |
| --- | --- |
| Token 수 | 프롬프트와 응답 |
| Harness, provider, model 라벨 | 소스 코드와 tool payload |
| 해시된 session 식별자 | Repository 이름과 경로 |
| 15분 시간 bucket | Transcript 파일과 경로 |
| Request 수 | API key와 provider 자격 증명 |

인식되지 않은 gateway는 hostname으로만 기록됩니다. 기기 자격 증명은 180일 후 만료되며 언제든 `tokensburned disconnect`로 폐기할 수 있습니다. 서버 측 집계 값은 `tokensburned delete-server-data`를 실행할 때까지 보존됩니다. TokensBurned는 root daemon, 트래픽 프록시, Git 동기화 작업을 설치하지 않습니다. 전체 데이터 경계와 인증 모델은 [SECURITY.md](../../SECURITY.md)에 문서화되어 있습니다.

## 사용 제한

- 각 GitHub 계정은 5개의 기기 슬롯을 가집니다. 연결 해제된 기기의 슬롯은 최대 30일 동안 예약 상태로 유지되며, 동일한 기기는 그 예약을 통해 다시 연결할 수 있습니다.
- 계정당 성공적인 연결은 롤링 10분당 5회, 롤링 24시간당 10회로 제한됩니다.
- 기록 backfill은 사용자가 선택한 1~90일 범위를 대상으로 합니다.
- 서버 데이터를 삭제하면 사용량, 자격 증명, 계정 프로필, 공개 카드가 제거됩니다. 남아 있는 슬롯 예약과 연결 허용량은 정상 일정에 따라 만료됩니다.

전체 정책은 [tokensburned.com/limits](https://tokensburned.com/limits.html?lang=ko)에 게시되어 있습니다.

## 문서

- [웹사이트와 card builder](https://tokensburned.com/?lang=ko)
- [보안과 개인정보 경계](../../SECURITY.md)
- [Local collection contracts와 명령 마이그레이션](../cli-collection.md)
- [Integrator를 위한 Usage import contract](../usage-import.md)
- [사용 제한](https://tokensburned.com/limits.html?lang=ko)

## 기여하기

기여를 환영합니다. 로컬 설정, 테스트, 새로운 수집 경로에 대한 규칙은 [CONTRIBUTING.md](../../CONTRIBUTING.md)를 참고하세요. 공개 이슈를 등록하기 전에 [SECURITY.md](../../SECURITY.md)에 설명된 대로 보안 문제는 비공개로 신고해 주세요.

## 라이선스

[MIT](../../LICENSE) © 2026 [Parsifal1986](https://github.com/Parsifal1986)
