<div align="center"><img src="../../assets/logo.svg" width="112" alt="Logo TokensBurned" /><h1>TokensBurned</h1><p><strong>Affichez votre activité de programmation IA sur GitHub sans envoyer vos prompts ni votre code source.</strong></p><p><a href="../../README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <strong>Français</strong></p></div>

TokensBurned collecte les nombres de tokens et les métadonnées du modèle, les agrège localement par tranche de 15 minutes et sert un SVG vivant pour votre profil GitHub. La carte peut afficher 24 heures, 7 jours, 30 jours, le total, des heatmaps, les comparaisons harness/provider/model et un classement anonyme.

<div align="center"><img src="../../assets/demo-card-builder.gif" width="840" alt="Démonstration du générateur de cartes" /></div>

## Installation par harness

| Harness | Commande | Source des données |
| --- | --- | --- |
| Claude Code | `/plugin marketplace add Parsifal1986/TokensBurned`<br>`/plugin install tokensburned@tokensburned`<br>`/tokensburned:connect` | Hook SessionEnd natif + historique approuvé |
| Codex | `codex plugin marketplace add Parsifal1986/TokensBurned`<br>`codex plugin add tokensburned@tokensburned`<br>`$tokensburned:connect` | Plugin natif + historique approuvé |
| Gemini CLI | `gemini extensions install https://github.com/Parsifal1986/TokensBurned`<br>`/tokensburned:connect`<br>`/tokensburned:telemetry` | GenAI OTLP officiel avec `logPrompts=false` |
| Copilot CLI | `copilot plugin install https://github.com/Parsifal1986/TokensBurned` | Plugin + CLI/OTLP |
| Cline CLI | `cline plugin install https://github.com/Parsifal1986/TokensBurned.git` | `afterRun().result.usage` natif |
| Autres | `npm install -g github:Parsifal1986/TokensBurned` | OTLP explicite ou API batch |

Les hooks Copilot ne fournissent pas encore les nombres de tokens. La collecte reste donc assistée par le CLI. Le plugin Cline fonctionne pour CLI, SDK et Kanban, mais pas encore dans les extensions d'éditeur.

## Carte de profil

Ouvrez le [générateur interactif](https://tokensburned.com/#card-builder), saisissez votre nom GitHub, choisissez les éléments et copiez le Markdown.

```markdown
[![TokensBurned activity](https://api.tokensburned.com/v1/cards/u/YOUR_GITHUB_NAME.svg)](https://tokensburned.com/)
```

- Compacte : `?layout=compact&compare=0&rank=1`
- Meme : `?layout=full&heatmap=0&compare=0&meme=1`
- Masquer le rang : `&rank=0`

## Confidentialité

Seuls les nombres de tokens, harness, provider, model, un session ID haché, la tranche de 15 minutes et le nombre de requêtes quittent la machine. Les prompts, réponses, sources, noms de dépôts, chemins et API keys ne sont jamais envoyés. Aucun cron, daemon, proxy ou synchronisation Git n'est installé. Voir [SECURITY.md](../../SECURITY.md).

[MIT License](../../LICENSE) © 2026 parsifal1986
