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
  <img src="../../assets/demo-card-builder.gif" width="840" alt="TokensBurned card builder" />
  <p><sub><a href="https://tokensburned.com/?lang=ko#card-builder">인터랙티브 card builder 열기</a>. 미리보기는 가상의 로컬 데이터를 사용합니다.</sub></p>
</div>

## 기능

- **사용량 카드.** 합계, 7일 추세, 활동 히트맵, 도구별 내역을 표시합니다. 연속 활동일, 캐시, 순위 표시도 선택할 수 있습니다.
- **로컬 처리.** 기기에서 기록을 처리하고 집계 수치와 도구·제공업체·모델 라벨만 업로드합니다.
- **기본 비공개.** 계정을 연결해도 카드는 공개되지 않습니다. 공개 여부는 사용자가 결정합니다.
- **명확한 지원 범위.** 도구가 보고한 실제 토큰 수를 사용하며, 프롬프트 길이나 비용으로 추정하지 않습니다.

## 지원하는 Harness

이 표는 현재 소스를 기준으로 합니다. 설치한 버전은 해당 [릴리스 태그](https://github.com/Parsifal1986/TokensBurned/releases)의 README를 참고하세요.

| Harness | 설치 방식 | Token 소스 | 지원 수준 |
| --- | --- | --- | --- |
| Claude Code | Plugin marketplace | Lifecycle hook 및 승인된 로컬 기록 | Native |
| Codex | Plugin marketplace | Plugin hook 및 승인된 로컬 기록 | Native |
| Cline CLI / SDK / classic IDE | Cline plugin과 standalone CLI | `afterModel`, SDK 메시지, classic task metrics | 형식별 호출 단위 캡처와 backfill |
| OpenCode | Standalone CLI | v1/v2 SQLite 및 legacy message JSON | 완료된 요청 사용량; 기록 backfill |
| Gemini CLI | Gemini extension과 standalone CLI | 기록된 JSON/JSONL 사용량 | 백그라운드 수집과 backfill |
| GitHub Copilot CLI | 설정용 plugin과 live extension | 공식 `assistant.usage` 이벤트 | 호출 단위 실시간 캡처; transcript backfill 없음 |
| Cursor, Aider 등 | Standalone CLI | Integrator가 제공하는 관측 사용량 | 자동 캡처 없음 |



## 빠른 시작

백그라운드 수집에는 Node.js 20 이상과 CLI가 필요합니다.

```sh
npm install -g tokensburned
```

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

CLI와 플러그인은 같은 버전, 같은 `BURN_HOME`(기본값 `~/.burn`), 같은 연결을 사용해야 합니다. 로컬 중복 제거를 통해 백그라운드 수집기와 플러그인을 함께 실행할 수 있습니다.

서로 다른 데이터 디렉터리에서 같은 기록을 읽거나 자동 수집한 요청을 수동으로 다시 가져오면 중복 집계될 수 있습니다.

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

Standalone CLI는 지원되는 도구의 사용량을 수집하고 플러그인의 전송을 담당합니다.

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

| 업로드하는 사용량 데이터 | 사용량 업로드에 포함하지 않는 항목 |
| --- | --- |
| 토큰 수와 요청 수의 집계 | 프롬프트, 응답, 소스 코드, 도구 내용 |
| 도구, 제공업체, 모델 라벨 | 저장소 이름, 파일 경로, 원본 대화 기록 |
| 활동 날짜와 시간대 | 세션 ID, API 키, 제공업체 자격 증명 |

기록은 로컬에서 처리하며 메시지 내용은 통계에 저장하지 않습니다. 알 수 없는 제공업체는 엔드포인트 호스트명으로 표시될 수 있습니다. 공개하기 전에 `tokensburned doctor`로 확인하세요.

`tokensburned privacy public`으로 공개하고 `tokensburned privacy private`으로 숨길 수 있습니다. 현재 기기의 연결을 해제하려면 `tokensburned disconnect`를 사용하세요. 데이터 삭제 명령은 `tokensburned help --advanced`에서 확인할 수 있습니다.

데이터 처리와 취약점 신고는 [SECURITY.md](../../SECURITY.md)를 참고하세요.

## 사용 제한

현재 계정 정책은 [사용 제한 페이지](https://tokensburned.com/limits.html?lang=ko)를 참고하세요.

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
