<div align="center">
  <img src="../../assets/logo.svg" width="112" alt="Logotipo de TokensBurned" />
  <h1>TokensBurned</h1>
  <p><strong>Actividad de programación con IA que respeta tu privacidad, en tu perfil de GitHub.</strong></p>
  <p>
    <a href="https://tokensburned.com/"><img alt="Website" src="https://img.shields.io/badge/website-tokensburned.com-eb6733?style=flat-square"></a>
    <a href="https://www.npmjs.com/package/tokensburned"><img alt="npm" src="https://img.shields.io/npm/v/tokensburned?style=flat-square&label=npm"></a>
    <a href="https://github.com/Parsifal1986/TokensBurned/releases"><img alt="GitHub release" src="https://img.shields.io/github/v/release/Parsifal1986/TokensBurned?style=flat-square&label=release"></a>
    <a href="https://github.com/Parsifal1986/TokensBurned/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Parsifal1986/TokensBurned/ci.yml?style=flat-square&label=ci"></a>
    <a href="../../LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-f1eadf?style=flat-square"></a>
  </p>
  <p>
    <a href="../../README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <strong>Español</strong> · <a href="README.fr.md">Français</a>
  </p>
  <p>
    <a href="#inicio-rápido">Inicio rápido</a> ·
    <a href="#tarjeta-de-perfil">Tarjeta de perfil</a> ·
    <a href="#línea-de-comandos">Línea de comandos</a> ·
    <a href="#privacidad-y-seguridad">Privacidad</a> ·
    <a href="#documentación">Documentación</a>
  </p>
</div>

TokensBurned convierte el uso de tokens de tus herramientas de programación con IA en una tarjeta SVG en vivo para tu perfil de GitHub. El cliente lee los metadatos de uso de harnesses como Claude Code y Codex, los reduce localmente a contadores agregados y solo sube esos agregados. Los prompts, las respuestas y el código fuente nunca salen de tu equipo.

<div align="center">
  <img src="../../assets/demo-card-builder.gif" width="840" alt="TokensBurned card builder" />
  <p><sub><a href="https://tokensburned.com/?lang=es#card-builder">Abre el creador interactivo de tarjetas</a>. La vista previa usa datos ficticios locales.</sub></p>
</div>

## Características

- **Tarjeta de actividad.** Muestra totales, la tendencia de siete días, un mapa de actividad y el desglose por herramienta. Las rachas, la caché y la clasificación son opcionales.
- **Procesamiento local.** Los registros se procesan en tu equipo. Solo se envían cifras agregadas y etiquetas de herramienta, proveedor y modelo.
- **Privado por defecto.** Conectar la cuenta no publica la tarjeta. Tú decides cuándo hacerlo.
- **Compatibilidad definida.** Se utilizan los tokens que informa cada herramienta, sin estimarlos a partir del texto o del coste.

## Harnesses compatibles

Esta tabla describe el código actual. Para una versión instalada, consulta el README de su [etiqueta de lanzamiento](https://github.com/Parsifal1986/TokensBurned/releases).

| Harness | Superficie de instalación | Fuente de tokens | Nivel de soporte |
| --- | --- | --- | --- |
| Claude Code | Plugin marketplace | Hooks de ciclo de vida e historial local aprobado | Nativo |
| Codex | Plugin marketplace | Hooks del plugin e historial local aprobado | Nativo |
| Cline CLI / SDK / IDE clásico | Plugin de Cline y CLI independiente | `afterModel`, mensajes del SDK y métricas de tareas clásicas | Captura por llamada según formato y backfill |
| OpenCode | CLI independiente | SQLite v1/v2 y JSON de mensajes heredado | Uso de solicitudes finalizadas; backfill de historial |
| Gemini CLI | Extensión de Gemini y CLI independiente | Uso JSON/JSONL registrado | Recolección en segundo plano y backfill |
| GitHub Copilot CLI | Plugin de configuración y extensión en vivo | Eventos oficiales `assistant.usage` | Captura en vivo por llamada; sin backfill de transcripciones |
| Cursor, Aider y otros | CLI independiente | Uso observado proporcionado por el integrador | Sin captura automática |

TokensBurned nunca estima tokens a partir de la longitud del prompt o el costo, y no acepta tráfico de exportadores de telemetría. Los detalles de cada fuente están en [Contratos de recolección local](../cli-collection.md).

## Inicio rápido

La recopilación en segundo plano requiere Node.js 20 o posterior y la CLI.

```sh
npm install -g tokensburned
```

<div align="center">
  <img src="../../assets/demo-install.gif" width="840" alt="Instalador de TokensBurned cambiando entre Claude Code, Codex y Gemini CLI" />
</div>

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>Claude Code</h3>
      <pre><code>/plugin marketplace add Parsifal1986/TokensBurned
/plugin install tokensburned@tokensburned
/reload-plugins
/tokensburned:connect</code></pre>
      <p>Importación opcional del historial (primero vista previa):</p>
      <pre><code>/tokensburned:backfill --dry-run --days 90</code></pre>
    </td>
    <td width="50%" valign="top">
      <h3>Codex</h3>
      <pre><code>codex plugin marketplace add Parsifal1986/TokensBurned
codex plugin add tokensburned@tokensburned</code></pre>
      <p>Inicia una nueva tarea y luego usa las skills incluidas:</p>
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
      <p>Los hosts compatibles reportan el uso por mensaje a través de <code>afterModel</code>. El colector en segundo plano también lee los historiales de mensajes del SDK y las métricas de tareas del IDE clásico. Los hooks y el historial del SDK comparten identidades de solicitud, por lo que recolectar ambos no duplica los tokens. Consulta los <a href="../cli-collection.md">formatos compatibles y límites</a>.</p>
    </td>
    <td width="50%" valign="top">
      <h3>OpenCode y otras herramientas</h3>
      <pre><code>npm install -g tokensburned
tokensburned connect
tokensburned run --harness opencode</code></pre>
      <p>El colector lee el uso de OpenCode v1/v2 SQLite y el JSON de mensajes heredado. SQLite requiere <code>sqlite3</code>. Cursor y Aider todavía no tienen lectores automáticos.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>Gemini CLI</h3>
      <pre><code>gemini extensions install https://github.com/Parsifal1986/TokensBurned
gemini
/tokensburned:connect</code></pre>
      <p>La extensión proporciona las skills de configuración. Ejecuta <code>tokensburned run --harness gemini-cli</code> para recolectar el uso de sesión JSON/JSONL registrado, incluidas las sesiones hijas. Obtén una vista previa del historial con <code>tokensburned backfill --harness gemini-cli --dry-run</code>.</p>
    </td>
    <td width="50%" valign="top">
      <h3>GitHub Copilot CLI</h3>
      <pre><code>copilot plugin install https://github.com/Parsifal1986/TokensBurned</code></pre>
      <p>Después de conectar, ejecuta <code>tokensburned integrations install copilot</code> e inicia <code>copilot --experimental</code>. La extensión en vivo registra los eventos oficiales de uso por llamada, incluidos los subagentes. Estos eventos no se pueden recuperar del historial de sesión ordinario. El plugin de configuración por sí solo no habilita la captura.</p>
    </td>
  </tr>
</table>

### Cómo funciona la recolección

Usa la misma versión, el mismo `BURN_HOME` (por defecto `~/.burn`) y la misma conexión para la CLI y los plugins. La deduplicación local permite ejecutar ambos a la vez.

No leas el mismo historial desde directorios de datos separados ni importes manualmente registros ya recogidos de forma automática: puedes contarlos dos veces.

## Tarjeta de perfil

Las tarjetas son privadas hasta que decides activarlas:

```sh
tokensburned privacy public
```

Publicar expone los totales, los desgloses por harness, provider y model, los mapas de calor de actividad, la clasificación y tu identidad de GitHub. El ajuste pertenece a tu cuenta de GitHub, así que todos los dispositivos conectados comparten la misma elección. Luego abre el [creador de tarjetas](https://tokensburned.com/?lang=es#card-builder), introduce tu nombre de usuario de GitHub, elige un preset y pega el Markdown en el README de tu perfil:

```markdown
[![TokensBurned activity](https://api.tokensburned.com/v1/cards/u/YOUR_GITHUB_NAME.svg?theme=auto)](https://tokensburned.com/?lang=es)
```

<div align="center">
  <img src="../../public/demo/card-full.svg" width="840" alt="Tarjeta de TokensBurned generada con datos ficticios de muestra" />
  <p><sub>Generada a partir de datos ficticios incluidos. Ver este README no llama a la API de TokensBurned.</sub></p>
</div>

### Elementos de la tarjeta

Cada tarjeta conserva el personaje de la llama, la tendencia de siete días, los garabatos y la leyenda. Los elementos opcionales se activan o desactivan con parámetros de consulta:

| Elemento | Parámetro | Predeterminado |
| --- | --- | --- |
| Mapa de calor de actividad | `heatmap=0\|1` | Activado |
| Desglose por harness | `stack=0\|1` | Activado |
| Días activos consecutivos | `streak=0\|1` | Activado |
| Proporción de entrada en caché en los últimos siete días | `cache=0\|1` | Desactivado |
| Insignia de clasificación | `rank=0\|1` | Desactivado |

`theme=auto|light|dark` selecciona la apariencia. Si se omite, se usa `dark`; `auto` sigue el esquema de color de quien lo visualiza. Por ejemplo:

```text
?theme=auto&heatmap=1&stack=1&streak=1&cache=1&rank=0
```

La configuración de privacidad siempre se aplica. Un historial de actividad oculto no aparece en la tendencia, y los parámetros de consulta no pueden revelar nada que tu cuenta no haya publicado. Los antiguos preajustes de diseño full, compact y meme están retirados; usa el creador de tarjetas para generar enlaces actuales.

## Línea de comandos

La CLI recoge el uso de las herramientas compatibles y permite gestionar la conexión y la privacidad.

```sh
npm install -g tokensburned
tokensburned connect
tokensburned run
```

| Comando | Función |
| --- | --- |
| `tokensburned` | Muestra el estado local de recolección y subida |
| `tokensburned connect` | Autoriza tu cuenta de GitHub y crea una credencial de dispositivo |
| `tokensburned run` | Inicia la recolección en segundo plano y activa el arranque al iniciar sesión (macOS y Linux) |
| `tokensburned privacy [public\|private]` | Consulta o cambia la visibilidad de la tarjeta |
| `tokensburned doctor` | Diagnostica la recolección, la conexión y la privacidad |
| `tokensburned update` | Comprueba si hay una versión más reciente y pone al día el historial reciente |
| `tokensburned disconnect` | Revoca la credencial de este dispositivo |

`run` instala un servicio a nivel de usuario que lee las fuentes locales compatibles una vez por minuto, conserva la cola y reintenta según el horario del servicio. No requiere privilegios de root. Usa `run --stop` para eliminar el arranque al iniciar sesión y `run --foreground` para diagnósticos o en plataformas sin un gestor de servicios compatible. `burn` es un alias más corto de `tokensburned`.

Los comandos de mantenimiento, como el backfill de historial con alcance limitado, los totales autenticados y la eliminación de la cuenta, aparecen con `tokensburned help --advanced`. Las notas de migración de comandos y el contrato de importación manual están en [Contratos de recolección local](../cli-collection.md) y [Importación de uso](../usage-import.md).

## Privacidad y seguridad

| Datos de uso enviados | Datos excluidos de los envíos de uso |
| --- | --- |
| Recuentos agregados de tokens y solicitudes | Prompts, respuestas, código y contenido de herramientas |
| Etiquetas de herramienta, proveedor y modelo | Nombres de repositorios, rutas y transcripciones |
| Fechas y horas de actividad | Identificadores de sesión, claves API y credenciales de proveedores |

Los registros se procesan localmente; el contenido de los mensajes no se conserva en las estadísticas. Un proveedor desconocido puede aparecer con el nombre de host de su endpoint. Revisa la atribución con `tokensburned doctor` antes de publicar.

Usa `tokensburned privacy public` para publicar y `tokensburned privacy private` para ocultar la tarjeta. `tokensburned disconnect` desconecta el dispositivo actual. Consulta `tokensburned help --advanced` para eliminar los datos de la cuenta.

Consulta [SECURITY.md](../../SECURITY.md) para el tratamiento de datos y la comunicación de vulnerabilidades.

## Límites de uso

Consulta las condiciones actuales en la [página de límites de uso](https://tokensburned.com/limits.html?lang=es).

## Documentación

- [Sitio web y creador de tarjetas](https://tokensburned.com/?lang=es)
- [Límite de seguridad y privacidad](../../SECURITY.md)
- [Contratos de recolección local y migración de comandos](../cli-collection.md)
- [Contrato de importación de uso para integradores](../usage-import.md)
- [Límites de uso](https://tokensburned.com/limits.html?lang=es)

## Contribuir

Las contribuciones son bienvenidas. Lee [CONTRIBUTING.md](../../CONTRIBUTING.md) para la configuración local, las pruebas y las reglas para nuevas rutas de recolección. Reporta los problemas de seguridad de forma privada según se describe en [SECURITY.md](../../SECURITY.md) antes de abrir un issue público.

## Licencia

[MIT](../../LICENSE) © 2026 [Parsifal1986](https://github.com/Parsifal1986)
