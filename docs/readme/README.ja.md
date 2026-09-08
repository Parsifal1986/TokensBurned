<div align="center"><img src="../../public/favicon.svg" width="112" alt="TokensBurned logo" /><h1>TokensBurned</h1><p><strong>プロンプトやソースコードを送信せず、AI コーディング活動を GitHub Profile に表示します。</strong></p><p><a href="../../README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <strong>日本語</strong> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a></p></div>

TokensBurned は対応する harness の token 使用量をローカルで集計し、サーバーの予定に従って送信します。SVG は GitHub や個人サイトに埋め込めます。画像は架空のデータです。

<div align="center"><img src="../../public/demo/card-full.svg" width="840" alt="TokensBurned — demo" /></div>

## 対応状況

| Harness | Status |
| --- | --- |
| Claude Code / Codex | 対応：プラグイン hook とローカル履歴 |
| OpenCode | 限定的・実験的：v1 SQLite のみ。sqlite3 が必要。v2 / JSON は未対応 |
| Cline CLI / SDK | 条件付き・実験的：afterModel の使用量・モデル・安定した ID が必要。契約テストのみ。実環境の端から端までの検証・履歴取得・エディタ拡張対応はなし |
| Cursor / Aider | **未対応：使用量アダプターなし** |
| Gemini CLI / GitHub Copilot CLI | **使用量収集は未対応：設定プラグインのみ。自動収集・履歴取得なし** |
| Other | **未対応：使用量アダプターなし** |

手動インポートや CLI のインストールは、harness 対応を意味しません。

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

`tokensburned connect` で接続し、`tokensburned run` でバックグラウンドサービスとログイン時の自動起動を設定します（macOS/Linux）。Codex、Claude Code、対応する OpenCode v1 SQLite（sqlite3 が必要）の利用量を収集し、サーバーの時刻に従って送信・再試行します。`run --stop` で停止と自動起動の解除、`run --foreground` で診断できます。Cursor と Aider の自動収集は未対応です。保守操作は `help --advanced` にあります。`setup`、引数なしの `sync`、`render`、`clean` は廃止されました。

[Collection contracts](../cli-collection.md)

## SVG

`tokensburned privacy public`

[Card builder](https://tokensburned.com/?lang=ja#card-builder)

```markdown
[![TokensBurned activity](https://api.tokensburned.com/v1/cards/u/YOUR_GITHUB_NAME.svg?theme=auto)](https://tokensburned.com/?lang=ja)
```

炎のキャラクター、7 日間の推移、落書き、短い一言は常に表示されます。非公開の履歴は推移にも表示されません。

- ヒートマップ: `heatmap=0|1`
- Harness 構成: `stack=0|1`
- 連続活動日数: `streak=0|1`
- 7 日間のキャッシュ入力比率: `cache=0|1`
- 順位バッジ: `rank=0|1`

既定：heatmap / stack / streak はオン、cache / rank はオフ。theme=auto|light|dark（省略時 dark）。旧 full / compact / meme レイアウトは廃止されました。

SVG は CDN キャッシュミス時に生成し、スタイル別に R2 へ保存しません。キャッシュは 1 時間で、即時更新ではありません。

## 正式版の更新

update は正式 GitHub Release を確認します。main の開発版は取得しません。プレリリースとローカルビルドはローカルでテストします。更新時の履歴取り込みもサーバーの送信周期を守ります。

## プライバシー

送信するのは token 数、harness、provider、model、ハッシュ化 session ID、15 分 bucket、request 数だけです。プロンプト、応答、コード、repository 名、path、API key は送信しません。公開カードは明示的な opt-in です。サーバーデータは `tokensburned delete-server-data` まで保持され、端末資格情報は 180 日で失効します。詳細は [SECURITY.md](../../SECURITY.md) を参照してください。

[MIT License](../../LICENSE) © 2026 parsifal1986
