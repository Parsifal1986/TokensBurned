<div align="center">
  <img src="../../assets/logo.svg" width="112" alt="TokensBurned logo" />
  <h1>TokensBurned</h1>
  <p><strong>プライバシーを重視した、GitHub Profile 向けの AI コーディングアクティビティ表示。</strong></p>
  <p>
    <a href="https://tokensburned.com/"><img alt="Website" src="https://img.shields.io/badge/website-tokensburned.com-eb6733?style=flat-square"></a>
    <a href="https://www.npmjs.com/package/tokensburned"><img alt="npm" src="https://img.shields.io/npm/v/tokensburned?style=flat-square&label=npm"></a>
    <a href="https://github.com/Parsifal1986/TokensBurned/releases"><img alt="GitHub release" src="https://img.shields.io/github/v/release/Parsifal1986/TokensBurned?style=flat-square&label=release"></a>
    <a href="https://github.com/Parsifal1986/TokensBurned/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Parsifal1986/TokensBurned/ci.yml?style=flat-square&label=ci"></a>
    <a href="../../LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-f1eadf?style=flat-square"></a>
  </p>
  <p>
    <a href="../../README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <strong>日本語</strong> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a>
  </p>
</div>

TokensBurned は、AI コーディングツールの token 使用量を GitHub Profile 向けのライブ SVG カードに変換します。クライアントは Claude Code や Codex などの harness から使用状況メタデータを読み取り、ローカルで集約カウンターへと縮約したうえで、その集約データのみをアップロードします。プロンプト、応答、ソースコードが端末の外に出ることはありません。

<div align="center">
  <img src="../../assets/demo-card-builder.gif" width="840" alt="TokensBurned card builder switching between full, compact, and meme layouts" />
  <p><sub><a href="https://tokensburned.com/?lang=ja#card-builder">インタラクティブなカード作成ツールを開く</a>。プレビューは架空のローカルデータを使用しています。</sub></p>
</div>

## 機能

- **ライブプロフィールカード。** 1 つの画像 URL で、24 時間・7 日間・30 日間・累計の合計、日次および時間帯別のヒートマップ、harness・provider・model の比較、匿名のサイト全体ランキングを表示できます。スケジュールジョブや README へのコミットは不要です。
- **ローカルでの縮約。** アップロードされる前に、session は端末上で 15 分単位の bucket に縮約されます。
- **厳格なプライバシー境界。** プロンプト、応答、ソースコード、repository 名、transcript のパス、API key は一切収集されません。詳しくは[プライバシーとセキュリティ](#プライバシーとセキュリティ)を参照してください。
- **デフォルトで非公開。** アカウントを接続して集約データをアップロードしても、公開カードが作成されるわけではありません。公開は別途、明示的なコマンドで行います。
- **正確な帰属。** harness、provider、model はそれぞれ別個の識別情報として記録されます。別の provider と通信した Claude Code の session は、その provider として正しくラベル付けされます。
- **誠実な互換性表示。** ネイティブの hook、plugin ワークフロー、standalone CLI はそれぞれ区別して表示されるため、各 harness がどのように計測されているかが分かります。

## 対応 harness

| Harness | インストール方法 | Token の取得元 | サポートレベル |
| --- | --- | --- | --- |
| Claude Code | Plugin marketplace | Lifecycle hook と承認済みのローカル履歴 | Native |
| Codex | Plugin marketplace | Plugin hook と承認済みのローカル履歴 | Native |
| Cline CLI / SDK / classic IDE | Cline plugin と standalone CLI | `afterModel`、SDK メッセージ、classic task metrics | フォーマット制限付きの呼び出しごとの収集と backfill |
| OpenCode | Standalone CLI | v1/v2 SQLite と legacy メッセージ JSON | 確定した request usage、履歴 backfill |
| Gemini CLI | Gemini extension と standalone CLI | 記録された JSON/JSONL usage | バックグラウンドでの収集と backfill |
| GitHub Copilot CLI | Setup plugin と live extension | 公式の `assistant.usage` イベント | ライブでの呼び出しごとの収集、transcript backfill なし |
| Cursor, Aider, その他 | Standalone CLI | Integrator が提供する observed usage | 自動収集なし |

TokensBurned は、プロンプトの長さやコストから token を推定することは一切なく、telemetry exporter からのトラフィックも受け付けません。各ソースの詳細は [Local collection contracts](../cli-collection.md) を参照してください。

## クイックスタート

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
      <p>任意で履歴を import できます（まずプレビュー）:</p>
      <pre><code>/tokensburned:backfill --dry-run --days 90</code></pre>
    </td>
    <td width="50%" valign="top">
      <h3>Codex</h3>
      <pre><code>codex plugin marketplace add Parsifal1986/TokensBurned
codex plugin add tokensburned@tokensburned</code></pre>
      <p>新しい task を開始し、同梱の skill を使用します:</p>
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
      <p>対応する host は <code>afterModel</code> を通じてメッセージ単位の usage を報告します。バックグラウンドの collector は SDK のメッセージ履歴や classic IDE の task metrics も読み取ります。hook と SDK 履歴は request の識別情報を共有するため、両方を収集しても token が二重にカウントされることはありません。<a href="../cli-collection.md">対応フォーマットと制限</a>を参照してください。</p>
    </td>
    <td width="50%" valign="top">
      <h3>OpenCode and other tools</h3>
      <pre><code>npm install -g tokensburned
tokensburned connect
tokensburned run --harness opencode</code></pre>
      <p>collector は OpenCode の v1/v2 SQLite usage と legacy メッセージ JSON を読み取ります。SQLite を使うには <code>sqlite3</code> が必要です。Cursor と Aider にはまだ自動読み取りがありません。</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>Gemini CLI</h3>
      <pre><code>gemini extensions install https://github.com/Parsifal1986/TokensBurned
gemini
/tokensburned:connect</code></pre>
      <p>この extension は setup 用の skill を提供します。<code>tokensburned run --harness gemini-cli</code> を起動すると、child session を含む記録済みの JSON/JSONL session usage を収集できます。履歴のプレビューには <code>tokensburned backfill --harness gemini-cli --dry-run</code> を使用してください。</p>
    </td>
    <td width="50%" valign="top">
      <h3>GitHub Copilot CLI</h3>
      <pre><code>copilot plugin install https://github.com/Parsifal1986/TokensBurned</code></pre>
      <p>接続後、<code>tokensburned integrations install copilot</code> を実行し、<code>copilot --experimental</code> を起動してください。live extension は subagent を含む公式の呼び出しごとの usage イベントを記録します。これらのイベントは通常の session 履歴から復元することはできません。setup plugin だけでは収集は有効になりません。</p>
    </td>
  </tr>
</table>

### 収集の仕組み

- **Lifecycle hook。** Claude Code と Codex では、plugin が各ターンの後に現在の transcript をローカルのキューへ縮約し、起動時に直近の session を再チェックします。そのため、正常に終了しなかった session も計上されます。
- **CLI と plugin を併用する場合。** 同じ `BURN_HOME`（デフォルトは `~/.burn`）と device credential を使用してください。共有されたキューは request と transcript のスナップショットを重複排除し、server は各 device の日次リビジョンを置き換えます。別々の home や device が同じ履歴を読み取ると二重計上が発生する可能性があり、匿名のクラウド集計ではそのコピーを重複排除できません。
- **スケジュールされたアップロード。** キューに入った集約データは、サービス側のスケジュールに従ってアップロードされます。デフォルトでは最大でも 1 時間に 1 回です。どのコマンドを使っても早期アップロードを強制することはできません。
- **アップデート通知。** インストール済みの plugin は、最大でも 24 時間に 1 回、新しい release を確認し、対応する native plugin-manager のコマンドが存在する場合はそれを表示します。明示的な要求なしに update がインストールされることはなく、確認に失敗しても起動がブロックされることはありません。
- **オンボーディング。** インストール済みで未接続の間、plugin は connect コマンドについて最大 3 回まで案内し、その後は表示しなくなります。

## プロフィールカード

カードは opt-in するまで非公開です:

```sh
tokensburned privacy public
```

公開すると、合計、harness・provider・model の内訳、アクティビティのヒートマップ、ランキング、GitHub の ID が公開されます。この設定は GitHub アカウントに紐づくため、接続しているすべてのデバイスで同じ設定が共有されます。次に [card builder](https://tokensburned.com/?lang=ja#card-builder) を開き、GitHub のユーザー名を入力してプリセットを選び、Markdown をプロフィール README に貼り付けてください:

```markdown
[![TokensBurned activity](https://api.tokensburned.com/v1/cards/u/YOUR_GITHUB_NAME.svg?theme=auto)](https://tokensburned.com/?lang=ja)
```

<div align="center">
  <img src="../../public/demo/card-full.svg" width="840" alt="TokensBurned card rendered from fictional sample data" />
  <p><sub>架空のサンプルデータからレンダリングしています。この README を閲覧しても TokensBurned API は呼び出されません。</sub></p>
</div>

### カードの要素

すべてのカードには、炎のキャラクター、7 日間のトレンド、落書き、キャプションが常に含まれます。任意の要素はクエリパラメータで切り替えます。

| 要素 | パラメータ | 既定値 |
| --- | --- | --- |
| アクティビティヒートマップ | `heatmap=0\|1` | オン |
| harness 別の内訳 | `stack=0\|1` | オン |
| 連続アクティブ日数 | `streak=0\|1` | オン |
| 過去 7 日間のキャッシュ入力の割合 | `cache=0\|1` | オフ |
| ランクバッジ | `rank=0\|1` | オフ |

`theme=auto|light|dark` で外観を選択します。省略時は `dark` が使われ、`auto` は閲覧者の配色設定に従います。例:

```text
?theme=auto&heatmap=1&stack=1&streak=1&cache=1&rank=0
```

プライバシー設定は常に適用されます。非表示にしたアクティビティ履歴はトレンドに表示されず、クエリパラメータでアカウントが公開していない情報を表示することはできません。以前の full、compact、meme のレイアウトプリセットは廃止されました。現在のリンクはカードビルダーで生成してください。

## コマンドライン

standalone CLI はすべての harness に対応しており、plugin の背後にある転送層でもあります。

```sh
npm install -g tokensburned
tokensburned connect
tokensburned run
```

| コマンド | 説明 |
| --- | --- |
| `tokensburned` | ローカルの収集状況とアップロード状況を表示します |
| `tokensburned connect` | GitHub アカウントを認可し、device credential を作成します |
| `tokensburned run` | バックグラウンドでの収集を開始し、ログイン時の自動起動を有効にします（macOS と Linux） |
| `tokensburned privacy [public\|private]` | カードの公開設定を表示または変更します |
| `tokensburned doctor` | 収集、接続、プライバシー設定を診断します |
| `tokensburned update` | 新しい release を確認し、直近の履歴を追いつかせます |
| `tokensburned disconnect` | このデバイスの credential を失効させます |

`run` は、対応するローカルソースを 1 分ごとに読み取り、キューを永続化し、サービス側のスケジュールに従って再試行するユーザーレベルのサービスをインストールします。root 権限は不要です。ログイン時の自動起動を解除するには `run --stop` を、診断時や対応するサービスマネージャーがないプラットフォームでは `run --foreground` を使用してください。`burn` は `tokensburned` の短いエイリアスです。

範囲を指定した履歴 backfill、認証済みの合計値の取得、アカウント削除などのメンテナンス用コマンドは `tokensburned help --advanced` で一覧表示されます。コマンドの移行に関する注意事項と手動 import の契約については、[Local collection contracts](../cli-collection.md) と [Usage import](../usage-import.md) を参照してください。

## プライバシーとセキュリティ

| アップロードされるもの | アップロードされないもの |
| --- | --- |
| Token 数 | プロンプトと応答 |
| Harness、provider、model のラベル | ソースコードと tool の payload |
| ハッシュ化された session 識別子 | Repository 名とパス |
| 15 分単位の time bucket | Transcript ファイルとパス |
| Request 数 | API key と provider の credential |

認識されない gateway は、hostname のみで記録されます。device credential は 180 日で失効し、`tokensburned disconnect` でいつでも失効させることができます。サーバー側の集約データは、`tokensburned delete-server-data` を実行するまで保持されます。TokensBurned は root daemon、トラフィックプロキシ、Git 同期タスクのいずれもインストールしません。完全なデータ境界と認証モデルについては [SECURITY.md](../../SECURITY.md) に記載されています。

## 利用制限

- 各 GitHub アカウントには 5 つの device スロットがあります。切断された device のスロットは最大 30 日間予約され続け、同じ device はその予約に再接続できます。
- 接続の成功回数は、アカウントごとに直近 10 分間で 5 回、直近 24 時間で 10 回までに制限されています。
- 履歴 backfill は、ユーザーが選択した 1〜90 日の範囲を対象とします。
- サーバーデータを削除すると、usage、credential、アカウントプロフィール、公開カードが削除されます。未消化のスロット予約と接続許可数は、通常のスケジュールどおりに失効します。

完全なポリシーは [tokensburned.com/limits](https://tokensburned.com/limits.html?lang=ja) で公開されています。

## ドキュメント

- [Website とカード作成ツール](https://tokensburned.com/?lang=ja)
- [セキュリティとプライバシーの境界](../../SECURITY.md)
- [Local collection contracts とコマンド移行](../cli-collection.md)
- [Integrator 向けの Usage import contract](../usage-import.md)
- [利用制限](https://tokensburned.com/limits.html?lang=ja)

## コントリビューション

コントリビューションを歓迎します。ローカル環境のセットアップ、テスト、新しい収集経路を追加する際のルールについては [CONTRIBUTING.md](../../CONTRIBUTING.md) を参照してください。セキュリティ上の問題は、公開の issue を作成する前に [SECURITY.md](../../SECURITY.md) の手順に従って非公開で報告してください。

## ライセンス

[MIT](../../LICENSE) © 2026 [Parsifal1986](https://github.com/Parsifal1986)
