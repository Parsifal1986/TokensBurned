import fs from "node:fs/promises";
import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { adapters, adapterFor } from "./adapters/index.js";
import { addEvent, summarize } from "./aggregate.js";
import { backendDescription } from "./backend.js";
import {
  HARNESS_LABELS,
  PROVIDER_LABELS,
  SYNC_INTERVAL_MS,
  VERSION,
} from "./constants.js";
import { configureProfile, githubIdentity, syncProfile } from "./github.js";
import { hookInstallNotice, installClaudeHook } from "./hooks.js";
import { publicStats, renderSvg } from "./render.js";
import { eventFromHookPayload, normalizeEvent } from "./schema.js";
import {
  paths,
  readConfig,
  readStats,
  removeBurnHome,
  writeConfig,
  writeStats,
  writeSvg,
} from "./storage.js";
import { formatTokens, localDateKey, percentages } from "./utils.js";

const COLORS = {
  orange: "\u001b[38;5;208m",
  dim: "\u001b[2m",
  green: "\u001b[32m",
  reset: "\u001b[0m",
};

function color(value, tone) {
  if (!process.stdout.isTTY || process.env.NO_COLOR) return value;
  return `${COLORS[tone]}${value}${COLORS.reset}`;
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function has(args, name) {
  return args.includes(name);
}

function label(record, key) {
  return record[key] || key;
}

function tableRows(record, labels) {
  const rows = percentages(record);
  if (!rows.length) return "  —";
  return rows
    .map(({ key, percentage }) => `  ${label(labels, key).padEnd(16)} ${String(percentage).padStart(3)}%`)
    .join("\n");
}

function stackLabel(stack) {
  if (!stack) return "Awaiting first burn";
  const [key] = stack;
  const [harness, provider] = key.split("::");
  return `${label(HARNESS_LABELS, harness)} × ${label(PROVIDER_LABELS, provider)}`;
}

function printStatus(summary) {
  console.log(`\n${color("🔥 Burn", "orange")}\n`);
  console.log(`  Today       ${formatTokens(summary.today.total_tokens).padStart(9)}`);
  console.log(`  This week   ${formatTokens(summary.week.total_tokens).padStart(9)}`);
  console.log(`  All time    ${formatTokens(summary.all_time_tokens).padStart(9)}`);
  console.log(`  Streak      ${String(summary.streak).padStart(8)}d`);
  console.log("\n  HARNESS\n" + tableRows(summary.week.by_harness, HARNESS_LABELS));
  console.log("\n  BACKEND\n" + tableRows(summary.week.by_provider, PROVIDER_LABELS));
  console.log(`\n  MOST USED STACK\n  ${stackLabel(summary.most_used_stack)}`);
  console.log(`\n  ${color(summary.level, "orange")} · SCORE ${summary.burn_score.toLocaleString("en-US")}`);
  console.log(`\n  ${color(`“${summary.meme}”`, "dim")}\n`);
}

async function readStdin(limit = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of input) {
    size += chunk.length;
    if (size > limit) throw new Error("Input exceeded Burn's 2 MB safety limit.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function parseInput(args) {
  const optionsWithValues = new Set([
    "--harness", "--provider", "--model", "--confidence", "--endpoint-type",
  ]);
  let file;
  for (let index = 0; index < args.length; index += 1) {
    if (optionsWithValues.has(args[index])) {
      index += 1;
      continue;
    }
    if (!args[index].startsWith("-")) {
      file = args[index];
      break;
    }
  }
  const content = file && file !== "-" ? await fs.readFile(file, "utf8") : await readStdin();
  const parsed = JSON.parse(content);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function ingest(args) {
  const rawEvents = await parseInput(args);
  const stats = await readStats();
  const harnessId = option(args, "--harness");
  const defaults = {
    harnessId,
    backend: {
      provider: option(args, "--provider") || "unknown",
      reported_model: option(args, "--model"),
      confidence: option(args, "--confidence") || "unknown",
      endpoint_type: option(args, "--endpoint-type") || "unknown",
    },
  };
  let added = 0;
  for (const raw of rawEvents) {
    if (addEvent(stats, normalizeEvent(raw, defaults))) added += 1;
  }
  if (added) await writeStats(stats);
  console.log(`${color("✓", "green")} ${added} event${added === 1 ? "" : "s"} added locally.`);
}

async function handleHook(args) {
  const harnessId = args[0] === "auto"
    ? (process.env.CODEX_PLUGIN_ROOT ? "codex" : "claude-code")
    : (args[0] === "claude" ? "claude-code" : args[0]);
  const adapter = adapterFor(harnessId);
  if (!adapter) return;

  let payload;
  try {
    const raw = await readStdin();
    if (!raw.trim()) return;
    payload = JSON.parse(raw);
  } catch {
    return; // A telemetry hook must never break the coding harness.
  }

  const backend = await adapter.detectBackend();
  const event = eventFromHookPayload(payload, adapter.id, backend);
  if (!event) return;
  const stats = await readStats();
  if (!addEvent(stats, event)) return;
  await writeStats(stats);
  try {
    await sync({ automatic: true, quiet: true });
  } catch {
    // Network or auth failures must never slow or break the parent harness.
  }
}

function artifacts(stats, config) {
  const summary = summarize(stats);
  const options = {
    publishProvider: config.privacy.publish_provider,
  };
  const json = `${JSON.stringify(publicStats(summary, options), null, 2)}\n`;
  const svg = renderSvg(summary, options);
  return { summary, json, svg };
}

async function render() {
  const stats = await readStats();
  const config = await readConfig();
  const { svg } = artifacts(stats, config);
  await writeSvg(svg);
  console.log(`${color("✓", "green")} Card rendered to ${paths.svg}`);
}

function isSyncDue(stats, automatic) {
  if (!automatic) return true;
  if (!stats.last_sync_at) return true;
  const elapsed = Date.now() - new Date(stats.last_sync_at).getTime();
  return elapsed >= SYNC_INTERVAL_MS || stats.last_sync_date !== localDateKey();
}

async function sync({ automatic = false, quiet = false } = {}) {
  const stats = await readStats();
  const config = await readConfig();
  if (!config.sync.enabled || !config.sync.repository) {
    if (!automatic) throw new Error("GitHub sync is not configured. Run `burn setup` first.");
    return;
  }
  if (!isSyncDue(stats, automatic)) return;
  const { svg, json } = artifacts(stats, config);
  await writeSvg(svg);
  const result = await syncProfile({
    repository: config.sync.repository,
    branch: config.sync.branch,
    svg,
    json,
  });
  stats.last_sync_at = new Date().toISOString();
  stats.last_sync_date = localDateKey();
  await writeStats(stats);
  if (!quiet) {
    console.log(result.changed
      ? `${color("✓", "green")} Burn card synced to ${config.sync.repository}.`
      : "Nothing changed. GitHub is already current.");
  }
}

async function confirm(question, assumeYes) {
  if (assumeYes) return true;
  if (!process.stdin.isTTY) throw new Error("Confirmation required. Re-run with --yes.");
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(`${question} [Y/n] `);
  rl.close();
  return !/^n(o)?$/i.test(answer.trim());
}

async function setup(args) {
  console.log(`\n${color("🔥 Put your AI addiction on GitHub?", "orange")}\n`);
  console.log("Burn will:\n\n✓ create a `burn` branch in your GitHub profile repo\n✓ write stats.json and stats.svg\n✓ add one marked image block to your README\n");
  console.log("Burn will NOT:\n\n✗ touch your other repos\n✗ read private code\n✗ overwrite your README\n✗ upload prompts\n");
  if (!(await confirm("Continue?", has(args, "--yes")))) return;

  const username = option(args, "--username") || await githubIdentity();
  const repository = option(args, "--repo") || `${username}/${username}`;
  const stats = await readStats();
  const config = await readConfig();
  const { svg, json } = artifacts(stats, config);
  await configureProfile({ repository, branch: "burn", svg, json });
  config.sync = { enabled: true, repository, branch: "burn" };
  await writeConfig(config);
  stats.last_sync_at = new Date().toISOString();
  stats.last_sync_date = localDateKey();
  await writeStats(stats);
  await writeSvg(svg);
  console.log(`${color("✓", "green")} Burn is live on ${repository}.`);
}

async function doctor() {
  const config = await readConfig();
  console.log(`\n${color("🔥 Burn Doctor", "orange")}\n\nHarnesses\n`);
  for (const adapter of adapters) {
    const installed = await adapter.detect();
    console.log(`${installed ? "✓" : "○"} ${adapter.label}`);
  }
  console.log("\nBackend detection\n");
  for (const adapter of adapters) {
    if (!(await adapter.detect())) continue;
    const backend = await adapter.detectBackend();
    console.log(`${backend.confidence === "unknown" ? "○" : "✓"} ${adapter.label}`);
    console.log(`  provider: ${backendDescription(backend)}`);
    if (backend.resolved_model) console.log(`  model: ${backend.resolved_model}`);
    else if (backend.reported_model) console.log(`  reported model: ${backend.reported_model}`);
    console.log(`  confidence: ${backend.confidence}\n`);
  }
  console.log("Files Burn reads\n✓ known harness config only\n✓ official hook usage metadata\n");
  console.log(`Files Burn writes\n✓ ${paths.stats}\n✓ ${paths.config}\n✓ ${paths.svg}\n`);
  console.log(`Network\n${config.sync.enabled ? "✓ GitHub only when sync is due" : "✓ None (sync disabled)"}\n`);
  console.log("Privacy\n✓ No transcripts opened\n✓ No prompts or source code retained\n✓ No API keys read\n✓ No traffic interception\n✓ No Burn backend\n");
}

async function installHooks(args) {
  const result = await installClaudeHook(option(args, "--command") || "burn hook claude");
  console.log(`${result.changed ? color("✓", "green") : "○"} Claude Code hook ${result.changed ? "installed" : "already installed"}: ${result.file}`);
  console.log(`\n${hookInstallNotice()}\n`);
}

async function setPrivacy(args) {
  const value = args[0];
  if (!new Set(["public", "private"]).has(value)) {
    throw new Error("Use `burn privacy public` or `burn privacy private`.");
  }
  const config = await readConfig();
  config.privacy.publish_provider = value === "public";
  await writeConfig(config);
  console.log(`Provider visibility: ${value === "public" ? "Public" : "Private"}`);
}

async function clean(args) {
  console.log(`Burn will remove only ${paths.home}.`);
  if (!(await confirm("Delete local Burn data?", has(args, "--yes")))) return;
  await removeBurnHome();
  console.log(`${color("✓", "green")} Local Burn data removed.`);
}

function help() {
  console.log(`
🔥 Burn ${VERSION}

Usage
  burn                     Show local activity
  burn ingest [file|-]     Add one or more sanitized usage events
  burn setup               Put the Burn card on your GitHub profile
  burn sync                Sync now
  burn render              Render ~/.burn/stats.svg locally
  burn doctor              Show exactly what Burn reads and writes
  burn hooks install       Install the Claude Code lifecycle hook
  burn privacy public      Publish aggregate provider attribution
  burn privacy private     Keep provider attribution local
  burn clean               Delete ~/.burn after confirmation

Ingest options
  --harness <id>           claude-code or codex
  --provider <id>          anthropic, openai, deepseek, custom, unknown
  --model <name>           Reported model name
  --confidence <level>     verified, detected, reported, unknown

No prompts. No code. No daemon. No proxy. No account.
`);
}

export async function runCli(args) {
  const [command = "status", ...rest] = args;
  switch (command) {
    case "status": {
      printStatus(summarize(await readStats()));
      return;
    }
    case "ingest": return ingest(rest);
    case "hook": return handleHook(rest);
    case "setup": return setup(rest);
    case "sync": return sync();
    case "render": return render();
    case "doctor": return doctor();
    case "privacy": return setPrivacy(rest);
    case "clean": return clean(rest);
    case "hooks":
      if (rest[0] === "install") return installHooks(rest.slice(1));
      break;
    case "help":
    case "--help":
    case "-h": return help();
    case "version":
    case "--version":
    case "-v": console.log(VERSION); return;
    default: break;
  }
  help();
  throw new Error(`Unknown command: ${command}`);
}
