import fs from "node:fs/promises";
import process from "node:process";
import readline from "node:readline/promises";
import { spawn } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { adapters, adapterFor } from "./adapters/index.js";
import { addEvent, summarize } from "./aggregate.js";
import { backendDescription } from "./backend.js";
import {
  API_ORIGIN,
  HARNESS_LABELS,
  PROVIDER_LABELS,
  SYNC_INTERVAL_MS,
  VERSION,
} from "./constants.js";
import { configureProfile, githubIdentity, syncProfile } from "./github.js";
import { hookInstallNotice, installClaudeHook } from "./hooks.js";
import { collectHistoryEntries } from "./history.js";
import { publicStats, renderSvg } from "./render.js";
import { eventFromHookPayload, normalizeEvent } from "./schema.js";
import {
  paths,
  defaultConfig,
  readConfig,
  readCredentials,
  readStats,
  removeBurnHome,
  writeConfig,
  writeCredentials,
  writeStats,
  writeSvg,
} from "./storage.js";
import { checkForUpdate, pluginUpdateCommand } from "./update.js";
import {
  deleteServerData,
  fetchServerSummary,
  fetchServerPrivacy,
  pollDeviceAuthorization,
  revokeDevice,
  startDeviceAuthorization,
  updateServerPrivacy,
  uploadEntries,
} from "./server.js";
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

function normalizeHarnessOption(value) {
  return value === "claude" ? "claude-code" : value;
}

function currentHarness() {
  const hinted = normalizeHarnessOption(process.env.TOKENSBURNED_HARNESS);
  if (hinted && adapterFor(hinted)) return hinted;
  if (process.env.CODEX_PLUGIN_ROOT) return "codex";
  if (process.env.CLAUDE_PLUGIN_ROOT) return "claude-code";
  return undefined;
}

function requestedBackfillHarnesses(args) {
  const requested = normalizeHarnessOption(option(args, "--harness"));
  const all = has(args, "--all-harnesses");
  if (requested && all) {
    throw new Error("Use either --harness or --all-harnesses, not both.");
  }
  if (requested) {
    const adapter = adapterFor(requested);
    if (!adapter) throw new Error(`Unsupported history harness: ${requested}`);
    return [adapter.id];
  }
  if (all) return adapters.map((adapter) => adapter.id);
  const detected = currentHarness();
  if (detected) return [detected];
  throw new Error(
    "Could not determine the current harness. Use --harness codex, " +
    "--harness claude-code, or explicitly opt into --all-harnesses.",
  );
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
  console.log(`\n${color("🔥 TokensBurned", "orange")}\n`);
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
    if (size > limit) throw new Error("Input exceeded TokensBurned's 2 MB safety limit.");
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
    const raw = await readStdin(256 * 1024);
    if (!raw.trim()) return;
    payload = JSON.parse(raw);
  } catch {
    return; // A telemetry hook must never break the coding harness.
  }

  const backend = await adapter.detectBackend();
  const event = eventFromHookPayload(payload, adapter.id, backend);
  if (event) {
    const stats = await readStats();
    if (addEvent(stats, event)) await writeStats(stats);
    try {
      await sync({ automatic: true, quiet: true });
    } catch {
      // Network or auth failures must never slow or break the parent harness.
    }
  }

  if (typeof payload.transcript_path === "string") {
    try {
      await backfillHistory({
        harnesses: [adapter.id],
        filesByHarness: { [adapter.id]: [payload.transcript_path] },
        quiet: true,
      });
    } catch {
      // Session telemetry is best-effort and must never break the harness.
    }
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
      ? `${color("✓", "green")} TokensBurned card synced to ${config.sync.repository}.`
      : "Nothing changed. GitHub is already current.");
  }
}

async function confirm(question, assumeYes) {
  if (assumeYes) return true;
  if (!process.stdin.isTTY) throw new Error("Confirmation required. Re-run with --yes.");
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

function openBrowser(url) {
  const command = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "rundll32"
      : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function reportAvailableUpdate(config, { force = false } = {}) {
  if (process.env.TOKENSBURNED_DISABLE_UPDATE_CHECK === "1") return;
  try {
    const result = await checkForUpdate(config, { force });
    if (!result.checked) return;
    await writeConfig(config);
    if (result.notice) {
      console.log(`\n${color("↑", "orange")} ${result.notice}`);
      if (result.release?.update_url) console.log(`  ${result.release.update_url}`);
      const command = pluginUpdateCommand(currentHarness());
      if (command) console.log(`  ${command}`);
      console.log(`  Update from your plugin manager, then start a new ${currentHarness() === "codex" ? "task" : "session"}.\n`);
    } else if (force) {
      console.log(`${color("✓", "green")} TokensBurned ${VERSION} is current.\n`);
    }
  } catch (error) {
    if (force) console.log(`○ Update check unavailable: ${error.message}\n`);
  }
}

async function backfillHistory({
  harnesses,
  filesByHarness,
  days = 90,
  dryRun = false,
  quiet = false,
} = {}) {
  const config = await readConfig();
  const credentials = await readCredentials();
  if (!dryRun && (!config.server.enabled || !credentials.device_token)) {
    throw new Error("TokensBurned is not connected. Run `burn connect` first.");
  }
  const selected = harnesses;
  if (!Array.isArray(selected) || selected.length === 0) {
    throw new Error("Backfill requires an explicit harness scope.");
  }
  const backendByHarness = {};
  for (const harness of selected) {
    const adapter = adapterFor(harness);
    if (adapter) backendByHarness[harness] = await adapter.detectBackend();
  }
  const result = await collectHistoryEntries({
    harnesses: selected,
    backendByHarness,
    days,
    filesByHarness,
  });
  const tokens = result.entries.reduce((sum, entry) => sum +
    entry.input + entry.output + entry.cache_read + entry.cache_write + entry.reasoning, 0);
  if (!dryRun && result.entries.length) {
    await uploadEntries(result.entries, {
      token: credentials.device_token,
      apiOrigin: config.server.api_origin || API_ORIGIN,
    });
    config.server.backfill_completed_at = new Date().toISOString();
    await writeConfig(config);
  }
  if (!quiet) {
    const files = Object.values(result.summary).reduce((sum, item) => sum + item.files, 0);
    console.log(`${dryRun ? "Would import" : "Imported"} ${formatTokens(tokens)} tokens from ${files} ${selected.join(", ")} history files across ${result.entries.length} aggregate buckets.`);
    console.log(dryRun
      ? "Dry run complete: no history data was uploaded. A real import would send only token counts, harness, provider, model, hashed session id and 15-minute bucket."
      : "Only token counts, harness, provider, model, hashed session id and 15-minute bucket left this machine.");
  }
  return { ...result, tokens };
}

async function connect(args) {
  let selectedBackfillHarnesses = has(args, "--backfill")
    ? requestedBackfillHarnesses(args)
    : null;
  const apiOrigin = option(args, "--api-origin") || API_ORIGIN;
  const authorization = await startDeviceAuthorization({
    apiOrigin,
    deviceName: `TokensBurned on ${process.platform}`,
  });
  const verificationUrl = new URL(
    authorization.verification_uri_complete || authorization.verification_uri,
  );
  if (verificationUrl.origin !== new URL(apiOrigin).origin) {
    throw new Error("The server returned a verification URL on a different origin.");
  }
  console.log(`\n${color("🔥 Connect TokensBurned", "orange")}\n`);
  console.log(`Open this URL and confirm the device name:\n\n${verificationUrl.toString()}\n\nManual fallback code: ${authorization.user_code}\n`);
  console.log("Only continue if you started this request. Public profile cards remain off unless you explicitly enable one.");
  if (!has(args, "--no-open")) openBrowser(verificationUrl.toString());

  const deadline = Date.now() + Number(authorization.expires_in || 600) * 1000;
  const interval = Math.max(2, Number(authorization.interval || 5)) * 1000;
  let result;
  while (Date.now() < deadline) {
    await wait(interval);
    result = await pollDeviceAuthorization(authorization.device_code, { apiOrigin });
    if (result.status === "authorized") break;
  }
  if (result?.status !== "authorized" || !result.token) {
    throw new Error("GitHub authorization expired. Run `burn connect` again.");
  }

  await writeCredentials({
    version: 1,
    device_token: result.token,
    expires_at: result.expires_at || null,
  });
  const accountPrivacy = result.privacy || await fetchServerPrivacy({
    token: result.token,
    apiOrigin,
  });
  const config = await readConfig();
  config.server = {
    ...config.server,
    enabled: true,
    api_origin: apiOrigin,
    github_login: result.user?.github_login || null,
    public_slug: result.user?.public_slug || null,
    card_url: accountPrivacy.card_url,
    connected_at: new Date().toISOString(),
    credential_expires_at: result.expires_at || null,
    privacy: null,
  };
  rememberAccountPrivacy(config, accountPrivacy);
  await writeConfig(config);
  await reportAvailableUpdate(config);
  console.log(`${color("✓", "green")} Connected as ${result.user?.github_login || "GitHub user"}.`);

  if (has(args, "--publish-card")) {
    const privacy = await setServerPrivacy(true, { config, credentials: { device_token: result.token } });
    console.log(`Public card enabled: ${privacy.card_url}`);
  } else {
    console.log(`Public card: ${accountPrivacy.public_card ? accountPrivacy.card_url : "off"} (synced from this GitHub account).`);
    if (!accountPrivacy.public_card) {
      console.log("Run `tokensburned privacy public` only when you want totals, tool/model breakdowns, activity heatmaps, and rank tied to your GitHub name to be public.");
    }
  }

  let shouldBackfill = has(args, "--backfill");
  if (!has(args, "--backfill") && !has(args, "--no-backfill")) {
    if (process.stdin.isTTY) {
      shouldBackfill = await confirm(
        "Import up to 90 days of token totals from the current harness? No prompts or responses are uploaded.",
        false,
      );
      if (shouldBackfill) selectedBackfillHarnesses = requestedBackfillHarnesses(args);
    } else {
      console.log("History was not imported because this harness command is non-interactive. Run the backfill skill to preview or explicitly choose --harness <id>.");
    }
  }
  if (shouldBackfill) await backfillHistory({ harnesses: selectedBackfillHarnesses });
}

async function backfillCommand(args) {
  const value = Number(option(args, "--days") || 90);
  const days = Number.isFinite(value) ? Math.max(1, Math.min(90, Math.floor(value))) : 90;
  return backfillHistory({
    harnesses: requestedBackfillHarnesses(args),
    days,
    dryRun: has(args, "--dry-run"),
  });
}

async function serverStatus() {
  const config = await readConfig();
  const credentials = await readCredentials();
  if (!config.server.enabled || !credentials.device_token) {
    console.log("TokensBurned server: not connected");
    return;
  }
  const options = { token: credentials.device_token, apiOrigin: config.server.api_origin || API_ORIGIN };
  const [summary, privacy] = await Promise.all([
    fetchServerSummary(options),
    fetchServerPrivacy(options),
  ]);
  rememberAccountPrivacy(config, privacy);
  await writeConfig(config);
  console.log(`TokensBurned server: connected as ${config.server.github_login}`);
  console.log(`All time: ${formatTokens(summary.all_time_tokens)} tokens`);
  console.log(`Last 7 days: ${formatTokens(summary.week_tokens)} tokens`);
  console.log(`Public card: ${privacy.public_card ? privacy.card_url : "off"}`);
  await reportAvailableUpdate(config);
}

async function setup(args) {
  console.log(`\n${color("🔥 Put your AI activity on GitHub?", "orange")}\n`);
  console.log("TokensBurned will:\n\n✓ create a `burn` branch in your GitHub profile repo\n✓ write stats.json and stats.svg\n✓ add one marked image block to your README\n");
  console.log("TokensBurned will NOT:\n\n✗ touch your other repos\n✗ read private code\n✗ overwrite your README\n✗ upload prompts\n");
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
  console.log(`${color("✓", "green")} TokensBurned is live on ${repository}.`);
}

async function doctor() {
  const config = await readConfig();
  const credentials = await readCredentials();
  console.log(`\n${color("🔥 TokensBurned Doctor", "orange")}\n\nHarnesses\n`);
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
  console.log("Files TokensBurned reads\n✓ known harness config only\n✓ official hook usage metadata\n");
  console.log(`Files TokensBurned writes\n✓ ${paths.stats}\n✓ ${paths.config}\n✓ ${paths.svg}\n`);
  const network = config.server.enabled
    ? `✓ TokensBurned aggregate API (${config.server.api_origin || API_ORIGIN})`
    : config.sync.enabled ? "✓ GitHub only when sync is due" : "✓ None (sync disabled)";
  console.log(`Network\n${network}\n`);
  console.log(`Server credential\n${credentials.device_token ? "✓ Stored locally with user-only permissions" : "○ Not connected"}\n`);
  if (credentials.device_token) {
    console.log(`  expires: ${credentials.expires_at || config.server.credential_expires_at || "unknown; reconnect recommended"}\n`);
  }
  let accountPrivacy = config.server.privacy;
  if (config.server.enabled && credentials.device_token) {
    try {
      accountPrivacy = await fetchServerPrivacy({
        token: credentials.device_token,
        apiOrigin: config.server.api_origin || API_ORIGIN,
      });
      rememberAccountPrivacy(config, accountPrivacy);
      await writeConfig(config);
    } catch {
      // Doctor remains useful offline and labels cached account state below.
    }
  }
  const privacySource = accountPrivacy ? "GitHub account" : "local cache";
  const publicCard = accountPrivacy?.public_card
    ? accountPrivacy.card_url
    : (!accountPrivacy && config.server.card_url ? config.server.card_url : "off");
  console.log(`Privacy\n✓ Public server card: ${publicCard} (${privacySource})\n✓ Account privacy is shared by every device connected to the same GitHub account\n✓ Session history is read only after explicit backfill consent or at SessionEnd\n✓ Only allow-listed numeric usage metadata is retained\n✓ Prompts, responses, tool payloads, source code and paths are never uploaded\n✓ No API keys read\n✓ No traffic interception\n`);
  await reportAvailableUpdate(config, { force: true });
}

async function installHooks(args) {
  const result = await installClaudeHook(option(args, "--command") || "burn hook claude");
  console.log(`${result.changed ? color("✓", "green") : "○"} Claude Code hook ${result.changed ? "installed" : "already installed"}: ${result.file}`);
  console.log(`\n${hookInstallNotice()}\n`);
}

function publicPrivacy(enabled) {
  return {
    public_card: enabled,
    publish_harness: enabled,
    publish_provider: enabled,
    publish_model: enabled,
    publish_heatmap: enabled,
    publish_rank: enabled,
  };
}

function rememberAccountPrivacy(config, privacy) {
  config.server.card_url = privacy.card_url;
  config.server.privacy = {
    public_card: privacy.public_card,
    publish_harness: privacy.publish_harness,
    publish_provider: privacy.publish_provider,
    publish_model: privacy.publish_model,
    publish_heatmap: privacy.publish_heatmap,
    publish_rank: privacy.publish_rank,
    card_url: privacy.card_url,
  };
}

async function setServerPrivacy(enabled, { config, credentials } = {}) {
  const storedConfig = config || await readConfig();
  const storedCredentials = credentials || await readCredentials();
  if (!storedConfig.server.enabled || !storedCredentials.device_token) return null;
  const privacy = await updateServerPrivacy(publicPrivacy(enabled), {
    token: storedCredentials.device_token,
    apiOrigin: storedConfig.server.api_origin || API_ORIGIN,
  });
  rememberAccountPrivacy(storedConfig, privacy);
  await writeConfig(storedConfig);
  return privacy;
}

async function setPrivacy(args) {
  const value = args[0] || "status";
  const config = await readConfig();
  const credentials = await readCredentials();
  if (!config.server.enabled || !credentials.device_token) {
    throw new Error("TokensBurned is not connected. Run `burn connect` first.");
  }
  if (value === "status") {
    const privacy = await fetchServerPrivacy({
      token: credentials.device_token,
      apiOrigin: config.server.api_origin || API_ORIGIN,
    });
    rememberAccountPrivacy(config, privacy);
    await writeConfig(config);
    console.log(`Public card: ${privacy.public_card ? privacy.card_url : "off"}`);
    console.log(`Harness breakdown: ${privacy.publish_harness ? "public" : "private"}`);
    console.log(`Provider breakdown: ${privacy.publish_provider ? "public" : "private"}`);
    console.log(`Model breakdown: ${privacy.publish_model ? "public" : "private"}`);
    console.log(`Activity heatmap: ${privacy.publish_heatmap ? "public" : "private"}`);
    console.log(`Anonymous rank: ${privacy.publish_rank ? "public" : "private"}`);
    await reportAvailableUpdate(config);
    return;
  }
  if (!new Set(["public", "private"]).has(value)) {
    throw new Error("Use `burn privacy`, `burn privacy public`, or `burn privacy private`.");
  }
  const privacy = await setServerPrivacy(value === "public", { config, credentials });
  if (value === "public") {
    console.log("Public visibility enabled for totals, harness/provider/model breakdowns, activity heatmaps, and rank.");
    if (privacy?.card_url) console.log(`Card: ${privacy.card_url}`);
  } else {
    console.log("Public visibility disabled. The server card is no longer accessible.");
  }
}

async function updateStatus() {
  const config = await readConfig();
  await reportAvailableUpdate(config, { force: true });
}

async function disconnect(args) {
  const config = await readConfig();
  const credentials = await readCredentials();
  if (!config.server.enabled || !credentials.device_token) {
    console.log("TokensBurned is already disconnected.");
    return;
  }
  if (!(await confirm("Revoke this device credential and disconnect?", has(args, "--yes")))) return;
  await revokeDevice({
    token: credentials.device_token,
    apiOrigin: config.server.api_origin || API_ORIGIN,
  });
  config.server = defaultConfig().server;
  await Promise.all([
    writeConfig(config),
    writeCredentials({ version: 1, device_token: null, expires_at: null }),
  ]);
  console.log("Device credential revoked and local connection removed.");
}

async function deleteRemoteData(args) {
  const config = await readConfig();
  const credentials = await readCredentials();
  if (!config.server.enabled || !credentials.device_token) {
    throw new Error("TokensBurned is not connected.");
  }
  console.log("This permanently deletes server usage, devices, account identity, and the public card. Local stats remain on this machine.");
  if (!(await confirm("Delete all TokensBurned server data?", has(args, "--yes")))) return;
  await deleteServerData({
    token: credentials.device_token,
    apiOrigin: config.server.api_origin || API_ORIGIN,
  });
  config.server = defaultConfig().server;
  await Promise.all([
    writeConfig(config),
    writeCredentials({ version: 1, device_token: null, expires_at: null }),
  ]);
  console.log("All TokensBurned server data was deleted.");
}

async function clean(args) {
  console.log(`TokensBurned will remove only ${paths.home}.`);
  if (!(await confirm("Delete local TokensBurned data?", has(args, "--yes")))) return;
  await removeBurnHome();
  console.log(`${color("✓", "green")} Local TokensBurned data removed.`);
}

function help() {
  console.log(`
🔥 TokensBurned ${VERSION}

Usage
  tokensburned                     Show local activity
  tokensburned ingest [file|-]     Add one or more sanitized usage events
  tokensburned setup               Put the TokensBurned card on your GitHub profile
  tokensburned sync                Sync now
  tokensburned render              Render ~/.burn/stats.svg locally
  tokensburned doctor              Show exactly what TokensBurned reads and writes
  tokensburned hooks install       Install the Claude Code lifecycle hook
  tokensburned connect             Connect to the serverless collector with GitHub
  tokensburned backfill            Import current-harness session token totals
  tokensburned server              Show authenticated server totals and card URL
  tokensburned update              Check for a newer plugin release
  tokensburned privacy             Show the current server privacy policy
  tokensburned privacy public      Explicitly publish aggregate activity tied to GitHub
  tokensburned privacy private     Disable and remove the public server card
  tokensburned disconnect          Revoke this device credential
  tokensburned delete-server-data  Permanently delete server data and identity
  tokensburned clean               Delete ~/.burn after confirmation

Connect options
  --backfill                Import history immediately after authorization
  --no-backfill             Connect without importing history
  --harness <id>           Scope import to codex or claude-code
  --all-harnesses          Explicitly import every recognized harness
  --no-open                 Print the authorization URL without opening it
  --publish-card            Explicitly enable the full public card after connection
  --api-origin <url>        Use a self-hosted TokensBurned API endpoint

Ingest options
  --harness <id>           claude-code or codex
  --provider <id>          anthropic, openai, deepseek, custom, unknown
  --model <name>           Reported model name
  --confidence <level>     verified, detected, reported, unknown

Backfill options
  --harness <id>           Import codex or claude-code history only
  --all-harnesses          Explicitly import every recognized harness
  --days <1-90>            Limit history range (default: 90)
  --dry-run                Parse locally without uploading

No prompts. No code. No daemon. No proxy.
`);
}

export async function runCli(args) {
  const [command = "status", ...rest] = args;
  switch (command) {
    case "status": {
      printStatus(summarize(await readStats()));
      const config = await readConfig();
      if (config.server.enabled) await reportAvailableUpdate(config);
      return;
    }
    case "ingest": return ingest(rest);
    case "hook": return handleHook(rest);
    case "setup": return setup(rest);
    case "sync": return sync();
    case "render": return render();
    case "doctor": return doctor();
    case "privacy": return setPrivacy(rest);
    case "disconnect": return disconnect(rest);
    case "delete-server-data": return deleteRemoteData(rest);
    case "clean": return clean(rest);
    case "hooks":
      if (rest[0] === "install") return installHooks(rest.slice(1));
      break;
    case "connect": return connect(rest);
    case "backfill": return backfillCommand(rest);
    case "server": return serverStatus();
    case "update": return updateStatus();
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
