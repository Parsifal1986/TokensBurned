import { renderArt } from "./card-art.js";
const REPOSITORY = "https://github.com/Parsifal1986/TokensBurned";
const CARD_ORIGIN = "https://api.tokensburned.com/v1/cards/u";
const SITE_ORIGIN = "https://tokensburned.com/";

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
    status: "EXTENSION + CLI",
    title: "Gemini CLI",
    confidence: "Skills + CLI import",
    summary: "The Gemini extension adds setup skills, not automatic collection or history backfill. Explicit cloud import uses ingest --upload; plain ingest changes local statistics only.",
    steps: ["Install the extension", "Connect your GitHub identity", "Import approved totals with the CLI"],
    command: `gemini extensions install ${REPOSITORY}\ngemini\n/tokensburned:connect`,
    note: "Do not point Gemini's telemetry exporter at the API; that route is disabled. Only allow-listed token and identity fields are uploaded.",
  },
  copilot: {
    status: "OPEN PLUGIN SPEC",
    title: "GitHub Copilot CLI",
    confidence: "Plugin workflow + CLI data",
    summary: "Copilot CLI provides the setup workflow. Automatic capture and history backfill are not implemented; finalized request usage can be imported with ingest --upload.",
    steps: ["Install the plugin", "Ask Copilot to connect", "Import or ingest approved totals"],
    command: `copilot plugin install ${REPOSITORY}\n# In Copilot CLI:\nConnect TokensBurned and show supported collection paths with doctor.`,
    note: "Connecting does not start automatic collection. See docs/usage-import.md for the explicit cloud import contract.",
  },
  cline: {
    status: "CLINE CLI PLUGIN",
    title: "Cline CLI",
    confidence: "Compatible CLI / SDK hosts",
    summary: "The plugin reads per-model metrics and stable message IDs from compatible Cline afterModel hooks. It deduplicates requests locally before cloud upload.",
    steps: ["Install the Git plugin", "Connect through the bundled skill", "Check queued usage with doctor"],
    command: `cline plugin install ${REPOSITORY}.git\n# In Cline CLI:\nConnect TokensBurned and show the privacy boundary.`,
    note: "A host must load this plugin and provide afterModel message metrics. Legacy afterRun-only hosts need the explicit import fallback.",
  },
  opencode: {
    status: "LOCAL COLLECTOR",
    title: "OpenCode",
    confidence: "v1 SQLite usage only",
    summary: "The CLI can read finalized usage from a compatible local OpenCode v1 database and upload it on the server schedule while run stays active.",
    steps: ["Install the CLI and sqlite3", "Connect GitHub", "Keep the local collector running"],
    command: "npm install -g tokensburned\ntokensburned connect\ntokensburned run --harness opencode",
    note: "Read-only numeric metadata. OpenCode v2 session_message data and legacy JSON storage are not supported; unknown formats are reported instead of guessed.",
  },
  other: {
    status: "NO AUTOMATIC CAPTURE",
    title: "Cursor, Aider, and other harnesses",
    confidence: "Verified usage source required",
    summary: "The CLI provides account management and scheduled transport, but does not yet collect native Cursor or Aider usage automatically.",
    steps: ["Inspect current support", "Use a verified usage integration", "Let the collector handle queued uploads"],
    command: "npm install -g tokensburned\ntokensburned doctor",
    note: "Context sizes, cost estimates and mixed estimated/observed analytics are not accepted as exact token consumption. Connecting alone does not collect usage.",
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
let currentSiteTheme = "dark";

function validGithubName(value) {
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value);
}

function selectedCardOptions() {
  return {...Object.fromEntries(["heatmap","stack","streak","cache","rank"].map(key=>[key,form.elements[key].checked])), theme:form.elements.cardTheme.value};
}
function renderHeroPreview() {
  heroPreview.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderArt({theme:currentSiteTheme,owner:"sample-user"}))}`;
}
function cardUrlFor(name, options) {
  const params = new URLSearchParams(Object.entries(options).map(([key,value])=>[key,typeof value === "boolean" ? Number(value) : value]));
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

function renderStaticPreview() {
  const options = selectedCardOptions();
  const owner = updateGeneratedLink(options);
  previewState.textContent = translate("previewSample");
  preview.alt = `${translate("previewAlt")} (@${owner})`;
  preview.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderArt({...options,owner}))}`;
}
form.addEventListener("input", renderStaticPreview);
form.addEventListener("submit", event=>event.preventDefault());

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
