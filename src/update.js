import { API_ORIGIN, UPDATE_CHECK_INTERVAL_MS, VERSION } from "./constants.js";
import { fetchClientRelease } from "./server.js";

function safeVersion(value) {
  if (typeof value !== "string" || value.length > 128) return null;
  return /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)
    ? value : null;
}

function safeUpdateUrl(value) {
  if (typeof value !== "string" || value.length > 2048 || /[\s\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function sanitizeRelease(release) {
  return {
    latest_version: safeVersion(release?.latest_version),
    minimum_supported_version: safeVersion(release?.minimum_supported_version),
    update_url: safeUpdateUrl(release?.update_url),
  };
}

function numericVersion(value) {
  const match = safeVersion(value)?.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

export function compareVersions(left, right) {
  const leftParts = numericVersion(left);
  const rightParts = numericVersion(right);
  if (!leftParts || !rightParts) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] < rightParts[index] ? -1 : 1;
    }
  }
  return 0;
}

export function updateCheckDue(lastCheckedAt, now = Date.now()) {
  if (!lastCheckedAt) return true;
  const checkedAt = new Date(lastCheckedAt).getTime();
  return !Number.isFinite(checkedAt) || now - checkedAt >= UPDATE_CHECK_INTERVAL_MS;
}

export function updateNotice(release, currentVersion = VERSION) {
  const { latest_version: latest, minimum_supported_version: minimum } = sanitizeRelease(release);
  if (minimum && compareVersions(currentVersion, minimum) < 0) {
    return `TokensBurned ${currentVersion} is no longer supported. Update to ${latest || minimum}.`;
  }
  if (latest && compareVersions(currentVersion, latest) < 0) {
    return `TokensBurned ${latest} is available (current: ${currentVersion}).`;
  }
  return null;
}

export function pluginUpdateCommand(harness) {
  if (harness === "codex") return "codex plugin add tokensburned@tokensburned";
  if (harness === "claude-code") return "claude plugin update tokensburned@tokensburned";
  return null;
}

export function updatePrompt(release, {
  currentVersion = VERSION,
  harness,
} = {}) {
  const notice = updateNotice(release, currentVersion);
  if (!notice) return null;
  const command = pluginUpdateCommand(harness);
  const action = command
    ? `If the user explicitly asks to update, run \`${command}\`, then tell them to start a new ${harness === "codex" ? "task" : "session"}.`
    : "If the user explicitly asks to update, open the release URL and use the current harness plugin manager.";
  return `${notice} Briefly notify the user. ${action} Do not update silently.`;
}

export async function checkForUpdate(config, {
  apiOrigin = config.server?.api_origin || API_ORIGIN,
  currentVersion = VERSION,
  fetchImpl,
  force = false,
  now = Date.now(),
  timeoutMs = 3_000,
} = {}) {
  if (!force && !updateCheckDue(config.updates?.last_checked_at, now)) {
    return { checked: false, notice: null, release: null };
  }
  const release = sanitizeRelease(await fetchClientRelease({ apiOrigin, fetchImpl, timeoutMs }));
  config.updates = {
    ...config.updates,
    last_checked_at: new Date(now).toISOString(),
    latest_version: release.latest_version || null,
    minimum_supported_version: release.minimum_supported_version || null,
    update_url: release.update_url || null,
  };
  return {
    checked: true,
    notice: updateNotice(release, currentVersion),
    release,
  };
}
