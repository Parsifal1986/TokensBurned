<div align="center">
  <img src="../../assets/logo.svg" width="112" alt="Logo TokensBurned" />
  <h1>TokensBurned</h1>
  <p><strong>Une activité de programmation avec IA respectueuse de la vie privée, pour votre profil GitHub.</strong></p>
  <p>
    <a href="https://tokensburned.com/"><img alt="Site web" src="https://img.shields.io/badge/website-tokensburned.com-eb6733?style=flat-square"></a>
    <a href="https://www.npmjs.com/package/tokensburned"><img alt="npm" src="https://img.shields.io/npm/v/tokensburned?style=flat-square&label=npm"></a>
    <a href="https://github.com/Parsifal1986/TokensBurned/releases"><img alt="Version GitHub" src="https://img.shields.io/github/v/release/Parsifal1986/TokensBurned?style=flat-square&label=release"></a>
    <a href="https://github.com/Parsifal1986/TokensBurned/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Parsifal1986/TokensBurned/ci.yml?style=flat-square&label=ci"></a>
    <a href="../../LICENSE"><img alt="Licence MIT" src="https://img.shields.io/badge/license-MIT-f1eadf?style=flat-square"></a>
  </p>
  <p>
    <a href="../../README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <strong>Français</strong>
  </p>
  <p>
    <a href="#démarrage-rapide">Démarrage rapide</a> ·
    <a href="#carte-de-profil">Carte de profil</a> ·
    <a href="#ligne-de-commande">Ligne de commande</a> ·
    <a href="#confidentialité-et-sécurité">Confidentialité</a> ·
    <a href="#documentation">Documentation</a>
  </p>
</div>

TokensBurned transforme l'utilisation de tokens de vos outils de programmation IA en une carte SVG vivante pour votre profil GitHub. Le client lit les métadonnées d'utilisation depuis des harnesses tels que Claude Code et Codex, les réduit localement en compteurs agrégés, puis ne téléverse que ces agrégats. Les prompts, les réponses et le code source ne quittent jamais votre machine.

<div align="center">
  <img src="../../assets/demo-card-builder.gif" width="840" alt="TokensBurned card builder" />
  <p><sub><a href="https://tokensburned.com/?lang=fr#card-builder">Ouvrir le générateur de cartes interactif</a>. L'aperçu utilise des données locales fictives.</sub></p>
</div>

## Fonctionnalités

- **Carte d’activité.** Affiche les totaux, la tendance sur sept jours, une carte d’activité et la répartition par outil. Les séries de jours actifs, le cache et le classement sont facultatifs.
- **Traitement local.** Les journaux sont traités sur votre appareil. Seuls les compteurs agrégés et les libellés d’outil, de fournisseur et de modèle sont envoyés.
- **Privé par défaut.** La connexion du compte ne publie pas la carte. Vous choisissez quand la rendre publique.
- **Compatibilité explicite.** Les comptes de tokens proviennent des outils, sans estimation à partir du texte ou du coût.

## Harnesses pris en charge

Ce tableau décrit le code actuel. Pour une version installée, consultez le README de son [tag de version](https://github.com/Parsifal1986/TokensBurned/releases).

| Harness | Surface d'installation | Source des tokens | Niveau de support |
| --- | --- | --- | --- |
| Claude Code | Marketplace de plugins | Hooks de cycle de vie et historique local approuvé | Natif |
| Codex | Marketplace de plugins | Hooks de plugin et historique local approuvé | Natif |
| Cline CLI / SDK / classic IDE | Plugin Cline et CLI autonome | `afterModel`, messages SDK et métriques de tâche classiques | Capture par appel limitée au format et backfill |
| OpenCode | CLI autonome | SQLite v1/v2 et JSON de messages hérité | Utilisation de requête finalisée ; backfill d'historique |
| Gemini CLI | Extension Gemini et CLI autonome | Utilisation JSON/JSONL enregistrée | Collecte en arrière-plan et backfill |
| GitHub Copilot CLI | Plugin de configuration et extension en direct | Événements officiels `assistant.usage` | Capture en direct par appel ; pas de backfill de transcription |
| Cursor, Aider, autres | CLI autonome | Utilisation observée fournie par l'intégrateur | Pas de capture automatique |



## Démarrage rapide

La collecte en arrière-plan nécessite Node.js 20 ou une version ultérieure et la CLI.

```sh
npm install -g tokensburned
```

<div align="center">
  <img src="../../assets/demo-install.gif" width="840" alt="Installeur TokensBurned basculant entre Claude Code, Codex et Gemini CLI" />
</div>

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>Claude Code</h3>
      <pre><code>/plugin marketplace add Parsifal1986/TokensBurned
/plugin install tokensburned@tokensburned
/reload-plugins
/tokensburned:connect</code></pre>
      <p>Import d'historique facultatif (aperçu d'abord) :</p>
      <pre><code>/tokensburned:backfill --dry-run --days 90</code></pre>
    </td>
    <td width="50%" valign="top">
      <h3>Codex</h3>
      <pre><code>codex plugin marketplace add Parsifal1986/TokensBurned
codex plugin add tokensburned@tokensburned</code></pre>
      <p>Démarrez une nouvelle tâche, puis utilisez les skills fournies :</p>
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
      <p>Les hôtes compatibles signalent l'utilisation par message via <code>afterModel</code>. Le collecteur en arrière-plan lit aussi les historiques de messages SDK et les métriques de tâche des IDE classiques. Les hooks et l'historique SDK partagent les mêmes identités de requête, de sorte que collecter les deux ne compte pas les tokens deux fois. Voir les <a href="../cli-collection.md">formats pris en charge et limites</a>.</p>
    </td>
    <td width="50%" valign="top">
      <h3>OpenCode et autres outils</h3>
      <pre><code>npm install -g tokensburned
tokensburned connect
tokensburned run --harness opencode</code></pre>
      <p>Le collecteur lit l'utilisation OpenCode v1/v2 SQLite et le JSON de messages hérité. SQLite nécessite <code>sqlite3</code>. Cursor et Aider n'ont pas encore de lecteurs automatiques.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>Gemini CLI</h3>
      <pre><code>gemini extensions install https://github.com/Parsifal1986/TokensBurned
gemini
/tokensburned:connect</code></pre>
      <p>L'extension fournit les skills de configuration. Démarrez <code>tokensburned run --harness gemini-cli</code> pour collecter l'utilisation de session JSON/JSONL enregistrée, y compris les sessions enfants. Prévisualisez l'historique avec <code>tokensburned backfill --harness gemini-cli --dry-run</code>.</p>
    </td>
    <td width="50%" valign="top">
      <h3>GitHub Copilot CLI</h3>
      <pre><code>copilot plugin install https://github.com/Parsifal1986/TokensBurned</code></pre>
      <p>Après la connexion, exécutez <code>tokensburned integrations install copilot</code> puis démarrez <code>copilot --experimental</code>. L'extension en direct enregistre les événements officiels d'utilisation par appel, y compris pour les sous-agents. Ces événements ne peuvent pas être récupérés depuis l'historique de session ordinaire. Le plugin de configuration seul n'active pas la capture.</p>
    </td>
  </tr>
</table>

### Fonctionnement de la collecte

Utilisez la même version, le même `BURN_HOME` (par défaut `~/.burn`) et la même connexion pour la CLI et les plugins. La déduplication locale permet de les utiliser ensemble.

Ne collectez pas le même historique depuis plusieurs répertoires de données et n’importez pas manuellement des requêtes déjà collectées automatiquement : elles pourraient être comptées deux fois.

## Carte de profil

Les cartes sont privées jusqu'à ce que vous les activiez :

```sh
tokensburned privacy public
```

La publication expose les totaux, les répartitions par harness, provider et model, les heatmaps d'activité, le classement et votre identité GitHub. Ce réglage appartient à votre compte GitHub, donc chaque appareil connecté partage le même choix. Ouvrez ensuite le [générateur de cartes](https://tokensburned.com/?lang=fr#card-builder), saisissez votre nom d'utilisateur GitHub, choisissez un préréglage, puis collez le Markdown dans le README de votre profil :

```markdown
[![TokensBurned activity](https://api.tokensburned.com/v1/cards/u/YOUR_GITHUB_NAME.svg?theme=auto)](https://tokensburned.com/?lang=fr)
```

<div align="center">
  <img src="../../public/demo/card-full.svg" width="840" alt="Carte TokensBurned générée à partir de données d'exemple fictives" />
  <p><sub>Générée à partir de données fictives incluses. Consulter ce README n'appelle pas l'API TokensBurned.</sub></p>
</div>

### Éléments de la carte

Chaque carte conserve le personnage de la flamme, la tendance sur sept jours, les gribouillis et la légende. Les éléments optionnels s'activent avec des paramètres de requête :

| Élément | Paramètre | Par défaut |
| --- | --- | --- |
| Heatmap d'activité | `heatmap=0\|1` | Activé |
| Répartition par harness | `stack=0\|1` | Activé |
| Jours actifs consécutifs | `streak=0\|1` | Activé |
| Part d'entrée en cache sur les sept derniers jours | `cache=0\|1` | Désactivé |
| Badge de classement | `rank=0\|1` | Désactivé |

`theme=auto|light|dark` sélectionne l'apparence. En l'absence du paramètre, `dark` est utilisé ; `auto` suit le thème de couleur du visiteur. Par exemple :

```text
?theme=auto&heatmap=1&stack=1&streak=1&cache=1&rank=0
```

Les paramètres de confidentialité s'appliquent toujours. Un historique d'activité masqué n'apparaît pas dans la tendance, et les paramètres de requête ne peuvent rien révéler que votre compte n'a pas publié. Les anciens préréglages de disposition full, compact et meme sont retirés ; utilisez le générateur de cartes pour produire les liens actuels.

## Ligne de commande

Le CLI autonome fonctionne avec chaque harness et constitue le transport utilisé par les plugins.

```sh
npm install -g tokensburned
tokensburned connect
tokensburned run
```

| Commande | Objectif |
| --- | --- |
| `tokensburned` | Afficher l'état local de la collecte et du téléversement |
| `tokensburned connect` | Autoriser votre compte GitHub et créer une credential d'appareil |
| `tokensburned run` | Démarrer la collecte en arrière-plan et activer le démarrage à la connexion (macOS et Linux) |
| `tokensburned privacy [public\|private]` | Afficher ou modifier la visibilité de la carte |
| `tokensburned doctor` | Diagnostiquer la collecte, la connexion et la confidentialité |
| `tokensburned update` | Vérifier l'existence d'une nouvelle version et rattraper l'historique récent |
| `tokensburned disconnect` | Révoquer la credential de cet appareil |

`run` installe un service au niveau utilisateur qui lit les sources locales prises en charge une fois par minute, persiste la file d'attente et réessaie selon le calendrier du service. Il ne nécessite aucun privilège root. Utilisez `run --stop` pour supprimer le démarrage à la connexion et `run --foreground` pour le diagnostic ou sur les plateformes sans gestionnaire de service pris en charge. `burn` est un alias plus court pour `tokensburned`.

Les commandes de maintenance telles que le backfill d'historique ciblé, les totaux authentifiés et la suppression de compte sont listées par `tokensburned help --advanced`. Les notes de migration des commandes et le contrat d'import manuel figurent dans [Contrats de collecte locale](../cli-collection.md) et [Import d'utilisation](../usage-import.md).

## Confidentialité et sécurité

| Données d’utilisation envoyées | Données exclues des envois d’utilisation |
| --- | --- |
| Compteurs agrégés de tokens et de requêtes | Prompts, réponses, code et contenu des outils |
| Libellés d’outil, de fournisseur et de modèle | Noms de dépôts, chemins et transcriptions |
| Dates et heures d’activité | Identifiants de session, clés API et identifiants des fournisseurs |

Les journaux sont traités localement ; le contenu des messages n’est pas conservé dans les statistiques. Un fournisseur inconnu peut être indiqué par le nom d’hôte de son endpoint. Vérifiez l’attribution avec `tokensburned doctor` avant publication.

Utilisez `tokensburned privacy public` pour publier et `tokensburned privacy private` pour masquer la carte. `tokensburned disconnect` déconnecte l’appareil actuel. Consultez `tokensburned help --advanced` pour supprimer les données du compte.

Consultez [SECURITY.md](../../SECURITY.md) pour le traitement des données et le signalement des vulnérabilités.

## Limites d'utilisation

Consultez les conditions actuelles sur la [page des limites d’utilisation](https://tokensburned.com/limits.html?lang=fr).

## Documentation

- [Site web et générateur de cartes](https://tokensburned.com/?lang=fr)
- [Limite de sécurité et de confidentialité](../../SECURITY.md)
- [Contrats de collecte locale et migration des commandes](../cli-collection.md)
- [Contrat d'import d'utilisation pour les intégrateurs](../usage-import.md)
- [Limites d'utilisation](https://tokensburned.com/limits.html?lang=fr)

## Contribution

Les contributions sont les bienvenues. Merci de lire [CONTRIBUTING.md](../../CONTRIBUTING.md) pour la configuration locale, les tests et les règles pour les nouveaux chemins de collecte. Signalez les problèmes de sécurité en privé comme décrit dans [SECURITY.md](../../SECURITY.md) avant d'ouvrir un ticket public.

## Licence

[MIT](../../LICENSE) © 2026 [Parsifal1986](https://github.com/Parsifal1986)
