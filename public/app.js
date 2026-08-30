const REPOSITORY = "https://github.com/Parsifal1986/TokensBurned";
const CARD_ORIGIN = "https://api.tokensburned.com/v1/cards/u";

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

function selectHarness(name) {
  const harness = harnesses[name];
  if (!harness) return;
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
    const previous = button.textContent;
    button.textContent = "copied";
    document.querySelector("#copy-status").textContent = "Copied to clipboard.";
    window.setTimeout(() => { button.textContent = previous; }, 1300);
  };
  navigator.clipboard?.writeText(value).then(done).catch(() => {
    if (target?.select) target.select();
    document.querySelector("#copy-status").textContent = "Text selected. Press Control C to copy.";
  });
}

document.querySelectorAll("[data-copy-target]").forEach((button) => {
  button.addEventListener("click", () => copyValue(button));
});

const form = document.querySelector("#builder-form");
const username = document.querySelector("#github-name");
const preview = document.querySelector("#card-preview");
const urlOutput = document.querySelector("#card-url");
const markdownOutput = document.querySelector("#card-markdown");
const previewState = document.querySelector("#preview-state");
const builderMessage = document.querySelector("#builder-message");

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

function updateCard() {
  const name = username.value.trim();
  const preset = form.elements.preset.value;
  if (!validGithubName(name)) {
    previewState.textContent = "check username";
    builderMessage.textContent = "Use a valid GitHub username without leading or trailing hyphens.";
    username.setAttribute("aria-invalid", "true");
    return;
  }
  username.removeAttribute("aria-invalid");
  const params = new URLSearchParams({
    layout: preset === "compact" ? "compact" : "full",
    heatmap: form.elements.heatmap.checked ? "1" : "0",
    compare: form.elements.compare.checked ? "1" : "0",
    rank: form.elements.rank.checked ? "1" : "0",
    meme: form.elements.meme.checked ? "1" : "0",
  });
  const cardUrl = `${CARD_ORIGIN}/${name.toLowerCase()}.svg?${params}`;
  previewState.textContent = "loading";
  builderMessage.textContent = "Connect TokensBurned first so the public card exists for your username.";
  preview.alt = `TokensBurned card preview for ${name}`;
  preview.src = cardUrl;
  urlOutput.value = cardUrl;
  markdownOutput.value = `[![TokensBurned activity](${cardUrl})](https://tokensburned.com/)`;
}

preview.addEventListener("load", () => {
  previewState.textContent = "live";
  builderMessage.textContent = "This is the same SVG URL GitHub will render. Copy it once and the card keeps updating.";
});
preview.addEventListener("error", () => {
  previewState.textContent = "not connected";
  builderMessage.textContent = "No public card was found. Connect TokensBurned for this username, then try again.";
});

let updateTimer;
form.addEventListener("input", (event) => {
  if (event.target.name === "preset") setPreset(event.target.value);
  window.clearTimeout(updateTimer);
  updateTimer = window.setTimeout(updateCard, 160);
});
setPreset("full");
updateCard();

const themeToggle = document.querySelector("[data-theme-toggle]");
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === "dark" ? "light" : "dark";
  themeToggle.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
}
let savedTheme;
try { savedTheme = localStorage.getItem("tokensburned-theme"); } catch { savedTheme = null; }
applyTheme(savedTheme === "light" ? "light" : "dark");
themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem("tokensburned-theme", next); } catch { /* storage may be blocked */ }
});
