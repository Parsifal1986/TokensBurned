const REPOSITORY = "https://github.com/Parsifal1986/TokensBurned";
const CARD_ORIGIN = "https://api.tokensburned.com/v1/cards/u";
const SITE_ORIGIN = "https://tokensburned.com/";
const DEMO_CARD_VERSION = "theme-2";
const demoCardCache = new Map();

const harnesses = {
  claude: {
    status: "NATIVE HOOK",
    title: "Claude Code",
    confidence: "Precise session totals",
    summary: "Install from the TokensBurned marketplace, connect GitHub, then let the official SessionEnd hook upload a short aggregate snapshot.",
    steps: ["Add the marketplace", "Install and reload the plugin", "Connect GitHub and approve optional history"],
    command: "/plugin marketplace add Parsifal1986/TokensBurned\n/plugin install tokensburned@tokensburned\n/reload-plugins\n/tokensburned:connect",
    note: "Optional history import reads only Claude Code JSONL usage fields for the approved date range.",
  },
  codex: {
    status: "NATIVE PLUGIN",
    title: "Codex",
    confidence: "Precise local history",
    summary: "Add the GitHub marketplace, install the plugin, then start a new task. Codex exposes focused skills instead of Claude-style slash commands.",
    steps: ["Add the Git marketplace", "Install TokensBurned", "Start a new task and connect"],
    command: "codex plugin marketplace add Parsifal1986/TokensBurned\ncodex plugin add tokensburned@tokensburned\n$tokensburned:connect",
    note: "Use $tokensburned:backfill for an explicit Codex history preview or import.",
  },
  gemini: {
    status: "EXTENSION + OTLP",
    title: "Gemini CLI",
    confidence: "Precise GenAI events",
    summary: "The Gemini extension adds setup commands. Gemini's built-in OpenTelemetry stream reports model and token fields when prompt logging is disabled.",
    steps: ["Install the extension", "Connect your GitHub identity", "Enable private OTLP export"],
    command: `gemini extensions install ${REPOSITORY}\ngemini\n/tokensburned:connect\n/tokensburned:telemetry`,
    note: "The telemetry setup keeps logPrompts false. Only allow-listed token and identity fields survive server parsing.",
  },
  copilot: {
    status: "OPEN PLUGIN SPEC",
    title: "GitHub Copilot CLI",
    confidence: "Plugin workflow + CLI data",
    summary: "Copilot CLI can install the shared plugin and its skills. Copilot session hooks do not currently expose token totals, so collection uses the CLI ingest path.",
    steps: ["Install the plugin", "Ask Copilot to connect", "Import or ingest approved totals"],
    command: `copilot plugin install ${REPOSITORY}\n# In Copilot CLI:\nConnect TokensBurned, then preview my local history.`,
    note: "The plugin is native. Token collection remains CLI assisted until Copilot exposes usage counts to hooks.",
  },
  cline: {
    status: "CLINE CLI PLUGIN",
    title: "Cline CLI",
    confidence: "CLI and SDK only",
    summary: "Cline CLI can install a Git plugin with TokensBurned skills and lifecycle integration. The Cline editor extensions do not load CLI plugins yet.",
    steps: ["Install the Git plugin", "Connect through the bundled skill", "Use explicit import or batch ingest"],
    command: `cline plugin install ${REPOSITORY}.git\n# In Cline CLI:\nConnect TokensBurned and show the privacy boundary.`,
    note: "For Cline in VS Code or JetBrains, use the standalone CLI fallback below.",
  },
  opencode: {
    status: "OTLP ADAPTER",
    title: "OpenCode",
    confidence: "Standard telemetry path",
    summary: "OpenCode has a first-class plugin API, but the current TokensBurned release uses the stable OTLP and batch adapter while the native plugin API remains beta.",
    steps: ["Install the TokensBurned CLI", "Connect GitHub", "Point an OTLP JSON exporter at the API"],
    command: "npm install -g github:Parsifal1986/TokensBurned\ntokensburned connect\ntokensburned doctor",
    note: "Native OpenCode plugin packaging is tracked separately so a beta API change cannot silently break collection.",
  },
  other: {
    status: "CLI FALLBACK",
    title: "Cursor, Aider, and other harnesses",
    confidence: "Explicit import or OTLP",
    summary: "Use the standalone client when the harness does not expose stable token metadata. It can accept revisioned batch input or standard OTLP JSON from an exporter.",
    steps: ["Install the CLI", "Connect GitHub", "Run doctor and choose an approved data source"],
    command: "npm install -g github:Parsifal1986/TokensBurned\ntokensburned connect\ntokensburned doctor",
    note: "TokensBurned does not estimate tokens from prompts and never labels inferred counts as observed usage.",
  },
};

const supportedLanguages = Object.keys(TOKENSBURNED_LOCALES);
const languageSelect = document.querySelector("#language-select");

function normalizeLanguage(value) {
  const requested = String(value || "").toLowerCase();
  return supportedLanguages.find((language) => language.toLowerCase() === requested)
    || supportedLanguages.find((language) => language.toLowerCase().split("-")[0] === requested.split("-")[0])
    || "en";
}

let savedLanguage;
try { savedLanguage = localStorage.getItem("tokensburned-language"); } catch { savedLanguage = null; }
const queryLanguage = new URLSearchParams(window.location.search).get("lang");
let currentLanguage = normalizeLanguage(queryLanguage || savedLanguage || navigator.languages?.[0] || navigator.language);

function translate(key) {
  return TOKENSBURNED_LOCALES[currentLanguage]?.[key] ?? TOKENSBURNED_LOCALES.en[key] ?? key;
}

function translatePage() {
  document.documentElement.lang = currentLanguage;
  languageSelect.value = currentLanguage;
  document.title = translate("metaTitle");
  document.querySelector('meta[name="description"]').content = translate("metaDescription");
  document.querySelector('meta[property="og:title"]').content = translate("metaTitle");
  document.querySelector('meta[property="og:description"]').content = translate("metaDescription");
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = translate(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = translate(element.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", translate(element.dataset.i18nAriaLabel));
  });
  document.querySelectorAll("[data-i18n-alt]").forEach((element) => {
    element.alt = translate(element.dataset.i18nAlt);
  });
}

translatePage();

let activeHarness = "claude";

function selectHarness(name) {
  const baseHarness = harnesses[name];
  if (!baseHarness) return;
  activeHarness = name;
  const harness = { ...baseHarness, ...(TOKENSBURNED_HARNESS_LOCALES[currentLanguage]?.[name] || {}) };
  document.querySelector("[data-install-status]").textContent = harness.status;
  document.querySelector("[data-install-title]").textContent = harness.title;
  document.querySelector("[data-install-confidence]").textContent = harness.confidence;
  document.querySelector("[data-install-summary]").textContent = harness.summary;
  document.querySelector("[data-install-command]").textContent = harness.command;
  document.querySelector("[data-install-note]").textContent = harness.note;
  const steps = document.querySelector("[data-install-steps]");
  steps.replaceChildren(...harness.steps.map((step) => {
    const item = document.createElement("li");
    item.textContent = step;
    return item;
  }));
  document.querySelectorAll("[data-harness]").forEach((button) => {
    const active = button.dataset.harness === name;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

document.querySelectorAll("[data-harness]").forEach((button) => {
  button.addEventListener("click", () => selectHarness(button.dataset.harness));
});
selectHarness("claude");

function copyValue(button) {
  const name = button.dataset.copyTarget;
  const target = document.getElementById(name) || (name === "install-command" ? document.querySelector("[data-install-command]") : null);
  const value = target?.value ?? target?.textContent ?? "";
  const done = () => {
    const labelKey = button.dataset.i18n || "copy";
    button.textContent = translate("copied");
    document.querySelector("#copy-status").textContent = translate("copiedStatus");
    window.setTimeout(() => { button.textContent = translate(labelKey); }, 1300);
  };
  navigator.clipboard?.writeText(value).then(done).catch(() => {
    if (target?.select) target.select();
    document.querySelector("#copy-status").textContent = translate("copySelect");
  });
}

document.querySelectorAll("[data-copy-target]").forEach((button) => {
  button.addEventListener("click", () => copyValue(button));
});

const form = document.querySelector("#builder-form");
const username = document.querySelector("#github-name");
const heroPreview = document.querySelector("#hero-card-preview");
const preview = document.querySelector("#card-preview");
const urlOutput = document.querySelector("#card-url");
const markdownOutput = document.querySelector("#card-markdown");
const previewState = document.querySelector("#preview-state");
const builderMessage = document.querySelector("#builder-message");
const outputCopyButtons = document.querySelectorAll(".builder-output [data-copy-target]");
let previewRevision = 0;
let heroPreviewRevision = 0;
let currentSiteTheme = "dark";

function validGithubName(value) {
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value);
}

function setPreset(value) {
  const heatmap = form.elements.heatmap;
  const compare = form.elements.compare;
  const meme = form.elements.meme;
  if (value === "full") {
    heatmap.checked = true;
    compare.checked = true;
    meme.checked = false;
  } else if (value === "compact") {
    heatmap.checked = false;
    compare.checked = false;
    meme.checked = false;
  } else {
    heatmap.checked = false;
    compare.checked = false;
    meme.checked = true;
  }
  heatmap.disabled = value === "compact";
}

function selectedCardOptions() {
  const preset = form.elements.preset.value;
  return {
    layout: preset === "compact" ? "compact" : "full",
    heatmap: preset === "compact" ? false : form.elements.heatmap.checked,
    compare: form.elements.compare.checked,
    rank: form.elements.rank.checked,
    meme: form.elements.meme.checked,
    theme: form.elements.cardTheme.value,
  };
}

function demoCardPath(options) {
  return `demo/card-${options.layout}-h${Number(options.heatmap)}-c${Number(options.compare)}-r${Number(options.rank)}-m${Number(options.meme)}.svg?v=${DEMO_CARD_VERSION}`;
}

function setSvgTheme(svg, theme) {
  return svg.includes("data-card-theme=")
    ? svg.replace(/data-card-theme="[^"]+"/, `data-card-theme="${theme}"`)
    : svg.replace("<svg ", `<svg data-card-theme="${theme}" `);
}

async function loadDemoCard(path) {
  let svg = demoCardCache.get(path);
  if (svg) return svg;
  const response = await fetch(path, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Demo card ${response.status}`);
  svg = await response.text();
  demoCardCache.set(path, svg);
  return svg;
}

async function renderHeroPreview() {
  const revision = ++heroPreviewRevision;
  const path = `demo/card-full.svg?v=${DEMO_CARD_VERSION}`;
  try {
    const svg = await loadDemoCard(path);
    if (revision !== heroPreviewRevision) return;
    heroPreview.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(setSvgTheme(svg, currentSiteTheme))}`;
  } catch {
    if (revision !== heroPreviewRevision) return;
    heroPreview.src = path;
  }
}

function cardUrlFor(name, options) {
  const params = new URLSearchParams({
    layout: options.layout,
    heatmap: options.heatmap ? "1" : "0",
    compare: options.compare ? "1" : "0",
    rank: options.rank ? "1" : "0",
    meme: options.meme ? "1" : "0",
    theme: options.theme,
  });
  return `${CARD_ORIGIN}/${name}.svg?${params}`;
}

function updateGeneratedLink(options) {
  const name = username.value.trim();
  if (!name) {
    username.removeAttribute("aria-invalid");
    urlOutput.value = "";
    markdownOutput.value = "";
    outputCopyButtons.forEach((button) => { button.disabled = true; });
    builderMessage.textContent = translate("builderEmpty");
    return "sample-user";
  }
  if (!validGithubName(name)) {
    username.setAttribute("aria-invalid", "true");
    urlOutput.value = "";
    markdownOutput.value = "";
    outputCopyButtons.forEach((button) => { button.disabled = true; });
    builderMessage.textContent = translate("builderInvalid");
    return "sample-user";
  }
  const normalizedName = name.toLowerCase();
  const cardUrl = cardUrlFor(normalizedName, options);
  username.removeAttribute("aria-invalid");
  urlOutput.value = cardUrl;
  markdownOutput.value = `[![TokensBurned activity](${cardUrl})](${SITE_ORIGIN})`;
  outputCopyButtons.forEach((button) => { button.disabled = false; });
  builderMessage.textContent = translate("builderReady");
  return normalizedName;
}

async function renderStaticPreview() {
  const revision = ++previewRevision;
  const options = selectedCardOptions();
  const owner = updateGeneratedLink(options);
  const path = demoCardPath(options);
  previewState.textContent = translate("previewSample");
  preview.alt = `${translate("previewAlt")} (@${owner})`;
  try {
    const svg = await loadDemoCard(path);
    if (revision !== previewRevision) return;
    const personalizedSvg = setSvgTheme(svg.replaceAll("sample-user", owner), options.theme);
    preview.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(personalizedSvg)}`;
  } catch {
    if (revision !== previewRevision) return;
    preview.src = path;
    previewState.textContent = translate("previewFallback");
  }
}

form.addEventListener("input", (event) => {
  if (event.target.name === "preset") setPreset(event.target.value);
  renderStaticPreview();
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
});
setPreset("full");

const themeToggle = document.querySelector("[data-theme-toggle]");
function applyTheme(theme) {
  currentSiteTheme = theme;
  document.documentElement.dataset.theme = theme;
  form.querySelector(`input[name="cardTheme"][value="${theme}"]`).checked = true;
  const nextTheme = theme === "dark" ? "light" : "dark";
  themeToggle.textContent = translate(`theme${nextTheme[0].toUpperCase()}${nextTheme.slice(1)}`);
  themeToggle.setAttribute("aria-label", translate(nextTheme === "light" ? "switchLight" : "switchDark"));
  renderHeroPreview();
  renderStaticPreview();
}
let savedTheme;
try { savedTheme = localStorage.getItem("tokensburned-theme"); } catch { savedTheme = null; }
applyTheme(savedTheme === "light" ? "light" : "dark");
themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem("tokensburned-theme", next); } catch { /* storage may be blocked */ }
});

languageSelect.addEventListener("change", () => {
  currentLanguage = normalizeLanguage(languageSelect.value);
  try { localStorage.setItem("tokensburned-language", currentLanguage); } catch { /* storage may be blocked */ }
  const url = new URL(window.location.href);
  if (currentLanguage === "en") url.searchParams.delete("lang");
  else url.searchParams.set("lang", currentLanguage);
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  translatePage();
  selectHarness(activeHarness);
  applyTheme(currentSiteTheme);
});
