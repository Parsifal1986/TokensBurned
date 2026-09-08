<div align="center"><img src="../../public/favicon.svg" width="112" alt="Logo TokensBurned" /><h1>TokensBurned</h1><p><strong>Affichez votre activité de programmation IA sur GitHub sans envoyer vos prompts ni votre code source.</strong></p><p><a href="../../README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <strong>Français</strong></p></div>

TokensBurned agrège localement les tokens des harnesses pris en charge et les envoie selon le calendrier serveur. Intégrez le SVG sur GitHub ou votre site personnel. L’image utilise des données fictives.

<div align="center"><img src="../../public/demo/card-full.svg" width="840" alt="TokensBurned — demo" /></div>

## Compatibilité

| Harness | Status |
| --- | --- |
| Claude Code / Codex | Pris en charge : hooks du plugin et historique local |
| OpenCode | Limité, expérimental : SQLite v1 uniquement ; sqlite3 requis. v2 et JSON non pris en charge |
| Cline CLI / SDK | Conditionnel, expérimental : usage, modèle et ID stables via afterModel requis. Tests de contrat uniquement ; sans validation native de bout en bout, historique ni extensions d’éditeur |
| Cursor / Aider | **Non pris en charge : aucun adaptateur d’usage** |
| Gemini CLI / GitHub Copilot CLI | **Collecte non prise en charge : configuration uniquement ; sans collecte automatique ni historique** |
| Other | **Non pris en charge : aucun adaptateur d’usage** |

L’import manuel et l’installation du CLI ne constituent pas une prise en charge du harness.

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

`tokensburned connect`, puis lancez `tokensburned run` pour installer le service en arrière-plan au démarrage de session (macOS/Linux). Il collecte Codex, Claude Code et OpenCode v1 SQLite compatible (sqlite3 requis), respecte le calendrier serveur et réessaie après une panne réseau. `run --stop` arrête le service et désactive le démarrage automatique ; `run --foreground` permet le diagnostic. Cursor et Aider n’ont pas de collecte automatique. La maintenance est dans `help --advanced` ; `setup`, `sync` sans option, `render` et `clean` sont retirés.

[Collection contracts](../cli-collection.md)

## SVG

`tokensburned privacy public`

[Card builder](https://tokensburned.com/?lang=fr#card-builder)

```markdown
[![TokensBurned activity](https://api.tokensburned.com/v1/cards/u/YOUR_GITHUB_NAME.svg?theme=auto)](https://tokensburned.com/?lang=fr)
```

Chaque carte conserve la flamme, la tendance sur sept jours, les gribouillis et la petite phrase. La tendance respecte les historiques masqués.

- Carte d’activité: `heatmap=0|1`
- Répartition par harness: `stack=0|1`
- Jours actifs consécutifs: `streak=0|1`
- Part des entrées en cache sur sept jours: `cache=0|1`
- Badge de classement: `rank=0|1`

Par défaut : heatmap / stack / streak activés ; cache / rank désactivés. theme=auto|light|dark, dark si omis. Les anciens formats full / compact / meme sont retirés.

Le SVG est généré lors d’un défaut de cache CDN, sans enregistrer chaque style dans R2. Le cache dure une heure ; les mises à jour ne sont pas instantanées.

## Versions stables

update consulte les versions stables GitHub Release, pas la branche main de développement. Les préversions et versions locales se testent localement. L’import d’historique pendant update respecte aussi le calendrier d’envoi du serveur.

## Confidentialité

Seuls les nombres de tokens, harness, provider, model, un session ID haché, la tranche de 15 minutes et le nombre de requêtes quittent la machine. Les prompts, réponses, sources, noms de dépôts, chemins et API keys ne sont jamais envoyés. Les données serveur sont conservées jusqu'à `tokensburned delete-server-data`; l'identifiant expire après 180 jours. Voir [SECURITY.md](../../SECURITY.md).

[MIT License](../../LICENSE) © 2026 parsifal1986
