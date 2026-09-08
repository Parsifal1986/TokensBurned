<div align="center"><img src="../../public/favicon.svg" width="112" alt="Logotipo de TokensBurned" /><h1>TokensBurned</h1><p><strong>Muestra tu actividad de programación con IA en GitHub sin subir prompts ni código fuente.</strong></p><p><a href="../../README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <strong>Español</strong> · <a href="README.fr.md">Français</a></p></div>

TokensBurned agrega localmente el uso de tokens de harnesses compatibles y lo envía según el calendario del servidor. Inserta el SVG en GitHub o en tu web personal. La imagen usa datos ficticios.

<div align="center"><img src="../../public/demo/card-full.svg" width="840" alt="TokensBurned — demo" /></div>

## Compatibilidad

| Harness | Status |
| --- | --- |
| Claude Code / Codex | Compatible: hooks del plugin e historial local |
| OpenCode | Limitado, experimental: solo SQLite v1; requiere sqlite3. v2 y JSON no compatibles |
| Cline CLI / SDK | Condicional, experimental: requiere uso, modelo e ID estables de afterModel. Solo pruebas de contrato; sin validación nativa integral, historial ni extensiones de editor |
| Cursor / Aider | **No compatible: sin adaptador de uso** |
| Gemini CLI / GitHub Copilot CLI | **Recogida de uso no compatible: solo configuración; sin captura automática ni historial** |
| Other | **No compatible: sin adaptador de uso** |

La importación manual y la instalación del CLI no equivalen a compatibilidad con un harness.

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

`tokensburned connect` y ejecuta `tokensburned run` para iniciar el servicio en segundo plano con arranque al iniciar sesión (macOS/Linux). Recoge Codex, Claude Code y OpenCode v1 SQLite compatible (requiere sqlite3); respeta el horario del servidor y reintenta tras fallos de red. `run --stop` lo detiene y desactiva el arranque automático; `run --foreground` permite diagnosticarlo. Cursor y Aider no tienen recogida automática. `help --advanced` muestra mantenimiento; `setup`, `sync` sin opciones, `render` y `clean` están retirados.

[Collection contracts](../cli-collection.md)

## SVG

`tokensburned privacy public`

[Card builder](https://tokensburned.com/?lang=es#card-builder)

```markdown
[![TokensBurned activity](https://api.tokensburned.com/v1/cards/u/YOUR_GITHUB_NAME.svg?theme=auto)](https://tokensburned.com/?lang=es)
```

Todas las tarjetas incluyen la llama, la tendencia de siete días, los garabatos y la frase inferior. La tendencia respeta el historial oculto.

- Mapa de actividad: `heatmap=0|1`
- Composición por harness: `stack=0|1`
- Días activos consecutivos: `streak=0|1`
- Proporción de entrada en caché, siete días: `cache=0|1`
- Insignia de clasificación: `rank=0|1`

Por defecto: heatmap / stack / streak activados; cache / rank desactivados. theme=auto|light|dark, con dark si se omite. Los diseños full / compact / meme antiguos están retirados.

El SVG se genera cuando falla la caché CDN, sin guardar cada estilo en R2. La caché dura una hora; las actualizaciones no son instantáneas.

## Actualizaciones estables

update consulta las versiones estables de GitHub Release, no la rama main de desarrollo. Las versiones preliminares y locales se prueban localmente. La importación de historial durante update también respeta el calendario de subida del servidor.

## Privacidad

Solo salen del equipo los conteos de tokens, harness, provider, model, un session ID con hash, el bloque de 15 minutos y el número de peticiones. Nunca se suben prompts, respuestas, código, nombres o rutas de repositorios ni API keys. Los datos del servidor se conservan hasta ejecutar `tokensburned delete-server-data`; la credencial caduca a los 180 días. Consulta [SECURITY.md](../../SECURITY.md).

[MIT License](../../LICENSE) © 2026 parsifal1986
