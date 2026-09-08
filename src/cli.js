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
  providerLabel,
  UPLOAD_INTERVAL_MS,
  VERSION,
} from "./constants.js";
import { hookInstallNotice, installClaudeHook } from "./hooks.js";
import { collectHistoryEntries, HISTORY_SOURCES } from "./history.js";
import { installCopilotExtension } from "./integration-install.js";
import { eventFromHookPayload, normalizeEvent } from "./schema.js";
import { usageObservation } from "./observations.js";
import { runCollector, COLLECTOR_SOURCES, COLLECTOR_STATUS, COLLECTOR_LOCK } from "./collector.js";
import { installBackgroundService, stopBackgroundService } from "./background-service.js";
import { capabilityLines, detectedHarness } from "./capabilities.js";
import { ensureUploadWorker, runUploadWorker, isProcessAlive } from "./upload-worker.js";
import {
  paths,
  defaultConfig,
  readConfig,
  readCredentials,
  readStats,
  writeConfig,
  writeCredentials,
  writeStats,
} from "./storage.js";
import { checkForUpdate, pluginUpdateCommand } from "./update.js";
import {
  deleteServerData,
  deviceIdFromToken,
  fetchServerSummary,
  fetchServerPlan,
  fetchServerPrivacy,
  pollDeviceAuthorization,
  revokeDevice,
  startDeviceAuthorization,
  updateServerPrivacy,
} from "./server.js";
import { deferredEnvelopes, nextUploadAt, pendingEnvelopes, readOutbox, rememberServerPlan, resetOutboxAcknowledgements, syncUsageEntries } from "./server-outbox.js";
import { formatTokens, percentages } from "./utils.js";

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
  return detectedHarness();
}

function requestedBackfillHarnesses(args) {
  const requested = normalizeHarnessOption(option(args, "--harness"));
  const all = has(args, "--all-harnesses");
  if (requested && all) {
    throw new Error("Use either --harness or --all-harnesses, not both.");
  }
  if (requested) {
    if (!HISTORY_SOURCES.includes(requested)) throw new Error(`Unsupported history harness: ${requested}. Copilot requires live capture; past per-call events are not replayed.`);
    return [requested];
  }
  if (all) return HISTORY_SOURCES;
  const detected = currentHarness();
  if (detected && HISTORY_SOURCES.includes(detected)) return [detected];
  if (detected) throw new Error(`History backfill is not supported for ${detected}. Use explicit request observations with ingest --upload; run doctor for capabilities.`);
  throw new Error(
    "Could not determine the current harness. Use --harness codex, " +
    "--harness claude-code, or explicitly opt into --all-harnesses.",
  );
}

function label(record, key) {
  return Object.hasOwn(record, key) ? record[key] : key;
}

function tableRows(record, labeler) {
  const rows = percentages(record);
  if (!rows.length) return "  —";
  return rows
    .map(({ key, percentage }) => `  ${labeler(key).padEnd(16)} ${String(percentage).padStart(3)}%`)
    .join("\n");
}

function stackLabel(stack) {
  if (!stack) return "Awaiting first burn";
  const [key] = stack;
  const [harness, provider] = key.split("::");
  return `${label(HARNESS_LABELS, harness)} × ${providerLabel(provider)}`;
}

function printStatus(summary) {
  console.log(`\n${color("🔥 TokensBurned", "orange")}\n`);
  console.log(`  Today       ${formatTokens(summary.today.total_tokens).padStart(9)}`);
  console.log(`  This week   ${formatTokens(summary.week.total_tokens).padStart(9)}`);
  console.log(`  All time    ${formatTokens(summary.all_time_tokens).padStart(9)}`);
  console.log(`  Streak      ${String(summary.streak).padStart(8)}d`);
  console.log("\n  HARNESS\n" + tableRows(summary.week.by_harness, (key) => label(HARNESS_LABELS, key)));
  console.log("\n  BACKEND\n" + tableRows(summary.week.by_provider, providerLabel));
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
  const harnessId = option(args, "--harness");
  if (has(args, "--upload")) {
    const entries = rawEvents.map((raw) => usageObservation(raw, {
      harness: harnessId,
      provider: option(args, "--provider"),
      model: option(args, "--model"),
    }));
    if (has(args, "--dry-run")) {
      console.log(`Validated ${entries.length} cloud observation(s). No files written or data uploaded.`);
      return;
    }
    const config = await readConfig();
    const credentials = await readCredentials();
    if (!config.server.enabled || !credentials.device_token) throw new Error("Connect before cloud import: tokensburned connect. Use --upload --dry-run to validate offline.");
    // Manual imports only join the durable queue. Normal hooks/the existing
    // worker decide when to upload; this command never starts a sender.
    const queued = await syncUsageEntries(entries, { upload: false });
    console.log(`${queued.changedSources} new cloud observation(s) queued locally.`);
    console.log("No upload started. Queued data will join the next scheduled sync when the server upload window permits.");
    return;
  }
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
  const events = rawEvents.map((raw) => normalizeEvent(raw, defaults));
  if (has(args, "--dry-run")) {
    console.log(`Validated ${events.length} local event(s). No files written or data uploaded.`);
    return;
  }
  const stats = await readStats();
  for (const event of events) if (addEvent(stats, event)) added += 1;
  if (added) await writeStats(stats);
  console.log(`${color("✓", "green")} ${added} event${added === 1 ? "" : "s"} added locally.`);
  console.log("Local statistics only. To update the cloud card, use canonical request observations with --upload (see docs/usage-import.md).");
}

async function handleHook(args) {
  const harnessId = args[0] === "auto"
    ? detectedHarness()
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

  }

  let merged = false;
  if (payload.hook_event_name === "SessionStart") {
    try {
      // The new transcript is empty. Re-merge every transcript touched in the
      // last two days instead, so a session whose last turns never reached the
      // outbox (killed process, sleep, crash) is caught up on the next start.
      await backfillHistory({ harnesses: [adapter.id], days: 2, quiet: true, force: false });
      merged = true;
    } catch {
      // Best-effort; never break the harness.
    }
  } else if (typeof payload.transcript_path === "string") {
    try {
      // Stop and SessionEnd merge after every turn; only uploads are spaced out.
      await backfillHistory({
        harnesses: [adapter.id],
        filesByHarness: { [adapter.id]: [payload.transcript_path] },
        quiet: true,
        force: false,
      });
      merged = true;
    } catch {
      // Session telemetry is best-effort and must never break the harness.
    }
  }
  if (!merged) {
    try {
      // Nothing readable: still push whatever earlier sessions left pending.
      await flushPendingUploads();
    } catch {
      // Best-effort; never break the harness.
    }
  }
  await ensureWorker();
}

async function flushPendingUploads() {
  const config = await readConfig();
  const credentials = await readCredentials();
  if (!config.server.enabled || !credentials.device_token) return;
  await syncUsageEntries([], {
    token: credentials.device_token,
    credentialApiOrigin: credentials.api_origin,
    devicePrivateKeyJwk: credentials.device_private_key_jwk,
    apiOrigin: config.server.api_origin || API_ORIGIN,
    force: false,
    minIntervalMs: UPLOAD_INTERVAL_MS,
  });
}

// If the upload window is closed and days are pending, leave one waiting
// worker behind so the data reaches the server even if no hook fires again.
async function ensureWorker() {
  try {
    const config = await readConfig();
    const credentials = await readCredentials();
    if (!config.server.enabled || !credentials.device_token) return;
    await ensureUploadWorker();
  } catch {
    // Best-effort; never break the caller.
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
    if (result.development && force) console.log("Development build: update from your local checkout; remote plugin updates are disabled.\n");
    if (!result.checked) return;
    await writeConfig(config);
    if (result.notice) {
      console.log(`\n${color("↑", "orange")} ${result.notice}`);
      if (result.release?.update_url) console.log(`  ${result.release.update_url}`);
      const command = pluginUpdateCommand(currentHarness(), result.release);
      if (command) console.log(`  ${command}`);
      console.log(`  Update from your plugin manager, then start a new ${currentHarness() === "codex" ? "task" : "session"}.\n`);
    } else if (force) {
      if (!result.release?.latest_version) throw new Error("No valid stable release metadata");
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
  force = false,
  queueOnly = false,
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
    (entry.input ?? entry.input_tokens ?? 0) + (entry.output ?? entry.output_tokens ?? 0) +
    (entry.cache_read ?? entry.cache_read_tokens ?? 0) + (entry.cache_write ?? entry.cache_write_tokens ?? 0) +
    (entry.reasoning ?? entry.reasoning_tokens ?? 0), 0);
  if (!dryRun && result.entries.length) {
    await syncUsageEntries(result.entries, {
      token: credentials.device_token,
      credentialApiOrigin: credentials.api_origin,
      devicePrivateKeyJwk: credentials.device_private_key_jwk,
      apiOrigin: config.server.api_origin || API_ORIGIN,
      upload: !queueOnly,
      minIntervalMs: UPLOAD_INTERVAL_MS,
    });
    if (force) {
      // Only explicit imports mark the backfill as done; hooks run every turn.
      config.server.backfill_completed_at = new Date().toISOString();
      await writeConfig(config);
    }
  }
  if (!quiet) {
    const files = Object.values(result.summary).reduce((sum, item) => sum + item.files, 0);
    const native = selected.some(id => !adapterFor(id));
    console.log(native
      ? `${dryRun ? "Would import" : "Imported"} ${formatTokens(tokens)} tokens from ${selected.join(", ")}: ${result.entries.length} usage records.`
      : `${dryRun ? "Would import" : "Imported"} ${formatTokens(tokens)} tokens from ${files} ${selected.join(", ")} history files across ${result.entries.length} aggregate buckets.`);
    console.log(dryRun
      ? "Dry run complete: no history data was uploaded. A real import would send only exact token counters, UTC hour, harness, provider and model in a daily device envelope."
      : "History merged into the cloud queue. Only exact token counters and aggregate dimensions can upload when the server window permits.");
  }
  return { ...result, tokens };
}

const MAX_POLL_BACKOFF_MS = 30_000;
const TERMINAL_POLL_CODES = {
  authorization_failed: "GitHub authorization failed",
  invalid_grant: "The device authorization was already used",
  expired_token: "The device authorization expired",
};

// Polling must survive transient trouble (network blips, 429s from a shared
// office IP, 5xx) until the deadline; only definitive 4xx answers end it (B3).
async function waitForAuthorization(authorization, { apiOrigin, previousDeviceId, deadline, interval, sleep = wait }) {
  let delay = interval;
  let backoff = interval;
  let result;
  while (Date.now() < deadline) {
    await sleep(Math.min(delay, Math.max(0, deadline - Date.now())));
    try {
      result = await pollDeviceAuthorization(authorization.device_code, {
        apiOrigin,
        previousDeviceId,
        devicePrivateKeyJwk: authorization.device_proof_keys?.privateKeyJwk,
      });
    } catch (error) {
      const status = Number(error?.status);
      if (status === 429) {
        const retryAt = Date.parse(error.retry_at || "");
        delay = Number.isFinite(retryAt) ? Math.max(interval, retryAt - Date.now()) : Math.min(backoff * 2, MAX_POLL_BACKOFF_MS);
        backoff = Math.min(backoff * 2, MAX_POLL_BACKOFF_MS);
        continue;
      }
      if (error?.transient === true || status >= 500) {
        backoff = Math.min(backoff * 2, MAX_POLL_BACKOFF_MS);
        delay = backoff;
        continue;
      }
      const reason = TERMINAL_POLL_CODES[error?.code];
      if (reason) {
        const detail = error.failure_code ? ` (${error.failure_code})` : "";
        throw new Error(`${reason}${detail}. Run \`burn connect\` again.`);
      }
      throw error;
    }
    delay = interval;
    backoff = interval;
    if (result?.status === "authorized") break;
  }
  if (result?.status !== "authorized" || !result.token) {
    throw new Error("GitHub authorization expired. Run `burn connect` again.");
  }
  return result;
}

async function connect(args) {
  let selectedBackfillHarnesses = has(args, "--backfill")
    ? requestedBackfillHarnesses(args)
    : null;
  const apiOrigin = option(args, "--api-origin") || API_ORIGIN;
  const [previousConfig, previousCredentials] = await Promise.all([readConfig(), readCredentials()]);
  const sameServer = new URL(previousConfig.server.api_origin || API_ORIGIN).toString()
    === new URL(apiOrigin).toString();
  const previousDeviceId = sameServer
    ? deviceIdFromToken(previousCredentials.device_token) || previousConfig.server.device_id
    : null;
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
  console.log("Free plan: 5 device slots. Disconnecting reserves the slot for this device for up to 30 days; credential expiry releases it immediately. Connections, including reconnections, are limited to 5 per 10 minutes and 10 per 24 hours.");
  if (!has(args, "--no-open")) openBrowser(verificationUrl.toString());

  const deadline = Date.now() + Number(authorization.expires_in || 600) * 1000;
  const interval = Math.max(2, Number(authorization.interval || 5)) * 1000;
  const result = await waitForAuthorization(authorization, {
    apiOrigin,
    previousDeviceId,
    deadline,
    interval,
  });

  const deviceId = deviceIdFromToken(result.token);
  const accountPrivacy = result.privacy || await fetchServerPrivacy({
    token: result.token,
    devicePrivateKeyJwk: authorization.device_proof_keys?.privateKeyJwk,
    apiOrigin,
  });
  if (!previousDeviceId || deviceId !== previousDeviceId) {
    await resetOutboxAcknowledgements();
  }
  await writeCredentials({
    version: 2,
    device_token: result.token,
    api_origin: apiOrigin,
    expires_at: result.expires_at || null,
    device_private_key_jwk: authorization.device_proof_keys?.privateKeyJwk || null,
    device_public_key_jwk: authorization.device_proof_keys?.publicKeyJwk || null,
  });
  const config = await readConfig();
  config.server = {
    ...config.server,
    enabled: true,
    device_id: deviceId,
    api_origin: apiOrigin,
    github_login: result.user?.github_login || null,
    public_slug: result.user?.public_slug || null,
    card_url: accountPrivacy.card_url,
    connected_at: new Date().toISOString(),
    disconnected_at: null,
    slot_reusable_at: null,
    credential_expires_at: result.expires_at || null,
    privacy: null,
  };
  rememberAccountPrivacy(config, accountPrivacy);
  await writeConfig(config);
  await reportAvailableUpdate(config);
  console.log(`${color("✓", "green")} Connected as ${result.user?.github_login || "GitHub user"}.`);

  if (has(args, "--publish-card")) {
    const privacy = await setServerPrivacy(true, {
      config,
      credentials: {
        device_token: result.token,
        device_private_key_jwk: authorization.device_proof_keys?.privateKeyJwk,
      },
    });
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
  if (shouldBackfill) await backfillHistory({ harnesses: selectedBackfillHarnesses, force: true });
}

async function backfillCommand(args) {
  const value = Number(option(args, "--days") || 90);
  const days = Number.isFinite(value) ? Math.max(1, Math.min(90, Math.floor(value))) : 90;
  const result = await backfillHistory({
    harnesses: requestedBackfillHarnesses(args),
    days,
    dryRun: has(args, "--dry-run"),
    force: true,
  });
  if (!has(args, "--dry-run")) await ensureWorker();
  return result;
}

async function planStatus() {
  const config = await readConfig();
  const credentials = await readCredentials();
  const plan = await fetchServerPlan({
    token: credentials.device_token,
    credentialApiOrigin: credentials.api_origin,
    devicePrivateKeyJwk: credentials.device_private_key_jwk,
    apiOrigin: config.server.api_origin || API_ORIGIN,
  });
  await rememberServerPlan(plan);
  console.log(`Plan: ${plan.id === "pro_preview" ? "Pro preview (no charge)" : "Free"}`);
  console.log(`Uploads: every ${plan.upload_interval_seconds / 60} minutes; website data refresh: every ${plan.refresh_interval_seconds / 60} minutes.`);
  if (plan.expires_at) console.log(`Preview expires: ${plan.expires_at}`);
  console.log("Plans and payment preview: https://tokensburned.com/plans.html");
  await ensureWorker();
}

async function serverStatus() {
  const config = await readConfig();
  const credentials = await readCredentials();
  if (!config.server.enabled || !credentials.device_token) {
    console.log("TokensBurned server: not connected");
    return;
  }
  const options = {
    token: credentials.device_token,
    credentialApiOrigin: credentials.api_origin,
    devicePrivateKeyJwk: credentials.device_private_key_jwk,
    apiOrigin: config.server.api_origin || API_ORIGIN,
  };
  const [summary, privacy] = await Promise.all([
    fetchServerSummary(options),
    fetchServerPrivacy(options),
  ]);
  if (summary.plan) await rememberServerPlan(summary.plan);
  rememberAccountPrivacy(config, privacy);
  await writeConfig(config);
  console.log(`TokensBurned server: connected as ${config.server.github_login}`);
  console.log(`All time: ${formatTokens(summary.all_time_tokens)} tokens`);
  console.log(`Last 7 days: ${formatTokens(summary.week_tokens)} tokens`);
  console.log(`Public card: ${privacy.public_card ? privacy.card_url : "off"}`);
  await reportAvailableUpdate(config);
}

async function doctor() {
  const config = await readConfig();
  const credentials = await readCredentials();
  console.log(`\n${color("🔥 TokensBurned Doctor", "orange")}\n\nHarnesses\n`);
  for (const adapter of adapters) {
    const installed = await adapter.detect();
    console.log(`${installed ? "✓" : "○"} ${adapter.label}`);
  }
  console.log("\nCollection capabilities (a connection alone does not confirm collection)\n");
  for (const line of capabilityLines(await readOutbox(paths.serverOutbox))) console.log(`  ${line}`);
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
  console.log("Files TokensBurned reads\n✓ known harness config and scoped Codex/Claude history\n✓ OpenCode v1/v2 SQLite usage projections and legacy message JSON\n✓ Gemini session JSON/JSONL and Cline SDK/classic IDE usage records\n✓ official hook and Copilot extension usage metadata\n");
  console.log(`Files TokensBurned writes\n✓ ${paths.stats}\n✓ ${paths.config}\n✓ ${paths.serverOutbox}\n✓ ${COLLECTOR_STATUS}\n`);
  const network = config.server.enabled
    ? `✓ TokensBurned aggregate API (${config.server.api_origin || API_ORIGIN})`
    : "✓ None (not connected)";
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
        credentialApiOrigin: credentials.api_origin,
        devicePrivateKeyJwk: credentials.device_private_key_jwk,
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
  console.log(`Privacy\n✓ Public server card: ${publicCard} (${privacySource})\n✓ Account privacy is shared by every device connected to the same GitHub account\n✓ History is read by supported hooks, explicit run, update or backfill\n✓ Only allow-listed numeric usage metadata is retained\n✓ Prompts, responses, tool payloads, source code and paths are never uploaded\n✓ No API keys read\n✓ No traffic interception\n`);
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
    credentialApiOrigin: storedCredentials.api_origin,
    devicePrivateKeyJwk: storedCredentials.device_private_key_jwk,
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
      credentialApiOrigin: credentials.api_origin,
      devicePrivateKeyJwk: credentials.device_private_key_jwk,
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
  await catchUp();
}

// Merge all supported history before attempting one scheduled queue flush.
async function catchUp() {
  const config = await readConfig();
  const credentials = await readCredentials();
  if (!config.server.enabled || !credentials.device_token) {
    console.log("○ Not connected; nothing to upload. Run `tokensburned connect` first.");
    return;
  }
  const harnesses = [];
  for (const adapter of adapters) {
    if (await adapter.detect()) harnesses.push(adapter.id);
  }
  let buckets = 0;
  const contributing = [];
  for (const harness of [...new Set([...harnesses, ...HISTORY_SOURCES.filter(id => !adapterFor(id))])]) {
    try {
      const result = await backfillHistory({ harnesses: [harness], days: 2, quiet: true, queueOnly: true });
      buckets += result.entries.length;
      if (result.entries.length) contributing.push(harness);
    } catch {
      // A harness without readable history is skipped; the others still count.
    }
  }
  console.log(`${color("✓", "green")} Merged ${buckets} recent usage record${buckets === 1 ? "" : "s"} from ${contributing.join(", ") || "no harness"}.`);
  await syncCloudQueue();
}

// Explicit cloud sync also works without any native history adapter installed.
// It neither reads other harnesses nor uses the legacy GitHub repository sync.
async function syncCloudQueue() {
  const config = await readConfig();
  const credentials = await readCredentials();
  if (!config.server.enabled || !credentials.device_token) {
    throw new Error("Connect before cloud sync: tokensburned connect.");
  }
  let worker = null;
  try {
    await flushPendingUploads();
  } finally {
    try { worker = await ensureUploadWorker(); } catch { /* Pending data stays on disk. */ }
  }
  const outbox = await readOutbox(paths.serverOutbox);
  const now = Date.now();
  const pending = pendingEnvelopes(outbox, now).length;
  const deferred = deferredEnvelopes(outbox, now);
  if (pending === 0 && deferred.length === 0) {
    console.log("  Server is up to date.");
  } else if (worker && (worker.spawned || worker.reason === "active") && Number.isFinite(worker.fireAt)) {
    console.log(`  ${pending} day${pending === 1 ? "" : "s"} pending; a background worker uploads at ${new Date(worker.fireAt).toISOString()}.`);
  } else if (pending > 0) {
    const at = nextUploadAt(outbox, UPLOAD_INTERVAL_MS, now);
    console.log(`  ${pending} day${pending === 1 ? "" : "s"} pending; next upload window opens at ${new Date(Math.max(at, now)).toISOString()}.`);
  }
  for (const day of deferred) {
    console.log(`  ${day.day} deferred by the server until ${day.retry_at}.`);
  }
}

async function disconnect(args) {
  const config = await readConfig();
  const credentials = await readCredentials();
  if (!config.server.enabled || !credentials.device_token) {
    console.log("TokensBurned is already disconnected.");
    if (config.server.slot_reusable_at) console.log(`Slot available for a new device at ${config.server.slot_reusable_at}.`);
    return;
  }
  console.log("Disconnecting revokes this credential immediately and keeps cloud history. Its slot becomes available after 30 days or credential expiry, whichever comes first; this device can reconnect while its slot is reserved.");
  if (!(await confirm("Disconnect with a slot cooldown of up to 30 days?", has(args, "--yes")))) return;
  const apiOrigin = config.server.api_origin || API_ORIGIN;
  const result = await revokeDevice({
    token: credentials.device_token,
    credentialApiOrigin: credentials.api_origin,
    devicePrivateKeyJwk: credentials.device_private_key_jwk,
    apiOrigin: config.server.api_origin || API_ORIGIN,
  });
  config.server = defaultConfig().server;
  // Disconnect revokes the secret, but retains the non-secret device identity
  // so a later GitHub authorization can reuse the same daily usage rows.
  config.server.device_id = deviceIdFromToken(credentials.device_token);
  config.server.api_origin = apiOrigin;
  // Only display dates confirmed by the server, including idempotent retries.
  config.server.disconnected_at = result?.disconnected_at || null;
  config.server.slot_reusable_at = result?.slot_reusable_at || null;
  await Promise.all([
    writeConfig(config),
    writeCredentials({ version: 2, device_token: null, expires_at: null }),
  ]);
  try { await stopBackgroundService(); } catch { console.error("Connection removed, but service cleanup failed; use run --stop to retry."); }
  console.log("Device credential revoked and local connection removed. Cloud history was kept.");
  if (config.server.slot_reusable_at) console.log(`Slot available for a new device at ${config.server.slot_reusable_at}.`);
}

async function deleteRemoteData(args) {
  const config = await readConfig();
  const credentials = await readCredentials();
  if (!config.server.enabled || !credentials.device_token) {
    throw new Error("TokensBurned is not connected.");
  }
  console.log("This permanently deletes server usage, devices, account profile, and the public card. Local stats remain on this machine.")
  console.log("Outstanding slot reservations and recent connection counts remain linked to a keyed account identifier until their normal deadlines; deleting and rebuilding the account does not refund allowances.");
  if (!(await confirm("Delete all TokensBurned server data?", has(args, "--yes")))) return;
  await deleteServerData({
    token: credentials.device_token,
    credentialApiOrigin: credentials.api_origin,
    devicePrivateKeyJwk: credentials.device_private_key_jwk,
    apiOrigin: config.server.api_origin || API_ORIGIN,
  });
  config.server = defaultConfig().server;
  await Promise.all([
    writeConfig(config),
    writeCredentials({ version: 2, device_token: null, expires_at: null }),
  ]);
  try { await stopBackgroundService(); } catch { console.error("Server data deleted, but service cleanup failed; use run --stop to retry."); }
  console.log("All TokensBurned server data was deleted.");
}

async function collectionStatus() {
  const config = await readConfig();
  const box = await readOutbox(paths.serverOutbox);
  let collector = {};
  try { collector = JSON.parse(await fs.readFile(COLLECTOR_STATUS, "utf8")); } catch { /* No collector yet. */ }
  let lock;
  try { lock = JSON.parse(await fs.readFile(COLLECTOR_LOCK, "utf8")); } catch { /* Stopped or interrupted. */ }
  const running = collector.running && lock?.token === collector.run_id && lock?.pid === collector.pid
    && Number.isInteger(collector.pid) && collector.pid > 0 && isProcessAlive(collector.pid);
  let service;
  try { service = JSON.parse(await fs.readFile(`${paths.home}/background-service.json`, "utf8")); } catch {}
  console.log(`Login startup: ${service ? "configured (" + service.platform + ")" : "not configured"}.`);
  console.log(`Cloud: ${config.server.enabled ? "connected" : "not connected"}; collector: ${running ? "running" : "stopped"}.`);
  const pending = pendingEnvelopes(box).length + deferredEnvelopes(box).length;
  console.log(`Queued days: ${pending}. Last acknowledged upload: ${box.last_successful_upload_at || "none"}.`);
  if (pending) console.log(`Next permitted upload: ${new Date(Math.max(Date.now(), nextUploadAt(box, UPLOAD_INTERVAL_MS))).toISOString()}.`);
  if (collector.source_errors?.length) console.log(`Sources needing attention: ${collector.source_errors.join(", ")}. Run doctor.`);
  if (config.server.card_url) console.log(`Card: ${config.server.card_url}`);
}

async function collectCommand(args, { managed = false } = {}) {
  if (args.length === 1 && args[0] === "--stop") {
    const result = await stopBackgroundService();
    console.log(result.stopped ? "Background collector stopped and login startup removed. Queued usage was kept." : "No background collector is installed.");
    return;
  }
  const foreground = managed || args.includes("--foreground");
  args = args.filter(arg => arg !== "--foreground");
  if (args.length && (args.length !== 2 || args[0] !== "--harness" || !args[1] || args[1].startsWith("--"))) {
    throw new Error(`run accepts --harness <${COLLECTOR_SOURCES.join(",")}>, --foreground or --stop; upload timing is server-controlled.`);
  }
  let previousSources;
  if (!foreground && !has(args, "--harness")) {
    try { previousSources = JSON.parse(await fs.readFile(`${paths.home}/background-service.json`, "utf8")).harnesses; } catch {}
  }
  const harnesses = [...new Set(option(args, "--harness")?.split(",").map(normalizeHarnessOption) || previousSources || COLLECTOR_SOURCES)];
  if (!harnesses.length || harnesses.some(id => !COLLECTOR_SOURCES.includes(id))) throw new Error("Unsupported automatic collection source. Cursor and Aider still require verified integrations.");
  if (!foreground) {
    const config = await readConfig(), credentials = await readCredentials();
    if (!config.server.enabled || !credentials.device_token) throw new Error("Connect before starting collection: tokensburned connect.");
    const result = await installBackgroundService({ harnesses });
    console.log(`Background collector installed and started. It starts automatically after login. Service: ${result.id}. Use status to inspect it or run --stop to disable it.`);
    return;
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  console.log(`Collecting locally from ${harnesses.join(", ")}. Uploads obey the server schedule. Keep this process running; Ctrl+C stops collection.`);
  let previous;
  try {
    const result = await runCollector({ harnesses, signal: controller.signal, onStatus: status => {
      const message = JSON.stringify({ pending: status.pending_days, upload_at: status.next_upload_at, sources: status.source_errors, retrying: status.upload_error });
      if (message !== previous) console.log(message);
      previous = message;
    } });
    if (result.reason === "not-connected" && !managed) throw new Error("Connect before starting collection: tokensburned connect.");
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}

function help(args = []) {
  console.log(`
TokensBurned ${VERSION}

Daily commands
  tokensburned                  Show local collection and upload status
  tokensburned connect          Connect your GitHub account
  tokensburned run              Start background collection and enable login startup
  tokensburned privacy [public|private]  View or change card visibility
  tokensburned doctor           Diagnose collection, connection and privacy
  tokensburned update           Check releases and catch up without forcing uploads
  tokensburned disconnect       Disconnect this device

run reads Codex, Claude Code and compatible OpenCode v1 SQLite usage locally.
Optional: run --harness codex,opencode. run --stop disables background startup.
macOS/Linux user services; run --foreground is available for other platforms or debugging.
Cursor/Aider automatic collection is not yet supported. No usage is estimated.
No upload-frequency or force-upload controls. See help --advanced for maintenance.
`);
  if (has(args, "--advanced")) console.log(`
Maintenance
  backfill --harness <codex|claude-code|gemini-cli|opencode|cline> [--days 1-90] [--dry-run]
  integrations install copilot  Enable live usage extension (Copilot --experimental)
  server                        Fetch authenticated cloud totals
  delete-server-data            Delete cloud identity and data after confirmation
  hooks install                 Standalone Claude hook setup (not alongside its plugin)

Compatibility only: sync --cloud and plan. Integration only: ingest, hook,
upload-worker. These are not routine user controls. setup, plain sync, render
and clean are retired; they never write to GitHub or delete the local queue.
Connect options: --no-open, --no-backfill, --backfill, --harness <id>,
--all-harnesses, --publish-card, --api-origin <https-url>.
`);
}

export async function runCli(args) {
  const [command = "status", ...rest] = args;
  switch (command) {
    case "status": {
      if (!(await readConfig()).server.enabled) printStatus(summarize(await readStats()));
      await collectionStatus();
      return;
    }
    case "ingest": return ingest(rest);
    case "hook": return handleHook(rest);
    case "upload-worker": { await runUploadWorker(); return; }
    case "run": return collectCommand(rest);
    case "integrations": {
      if (rest.length !== 2 || rest[0] !== "install" || rest[1] !== "copilot") throw new Error("Use integrations install copilot");
      const file = await installCopilotExtension();
      console.log(`Installed ${file}. Start a new copilot --experimental session; /extensions manage shows its status. Past usage events cannot be recovered.`);
      return;
    }
    case "_collector": return collectCommand(rest, { managed: true });
    case "sync":
      if (has(rest, "--cloud")) { console.error("Deprecated manual sync: use tokensburned run for automatic scheduled uploads."); return syncCloudQueue(); }
      // Fall through to the retired static-card command group.
    case "setup":
    case "render":
    case "clean": throw new Error(`${command} is retired. Use connect and run for the cloud card; pending local data was not changed.`);
    case "doctor": return doctor();
    case "privacy": return setPrivacy(rest);
    case "disconnect": return disconnect(rest);
    case "delete-server-data": return deleteRemoteData(rest);
    case "hooks":
      if (rest[0] === "install") return installHooks(rest.slice(1));
      break;
    case "connect": return connect(rest);
    case "backfill": return backfillCommand(rest);
    case "server": return serverStatus();
    case "plan": return planStatus();
    case "update": return updateStatus();
    case "help":
    case "--help":
    case "-h": return help(rest);
    case "version":
    case "--version":
    case "-v": console.log(VERSION); return;
    default: break;
  }
  help();
  throw new Error(`Unknown command: ${command}`);
}
