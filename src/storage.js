import fs from "node:fs/promises";
import { atomicWrite } from "./atomic-write.js";
import {
  BURN_HOME,
  CONFIG_PATH,
  CREDENTIALS_PATH,
  STATS_PATH,
  STATS_VERSION,
  SVG_PATH,
  SERVER_OUTBOX_PATH,
} from "./constants.js";

export function emptyStats(now = new Date()) {
  return {
    version: STATS_VERSION,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    last_sync_at: null,
    last_sync_date: null,
    daily: {},
    seen_event_ids: [],
  };
}

export function defaultConfig() {
  return {
    version: 1,
    sync: {
      enabled: false,
      repository: null,
      branch: "burn",
    },
    privacy: {
      publish_provider: true,
    },
    server: {
      enabled: false,
      api_origin: null,
      device_id: null,
      github_login: null,
      public_slug: null,
      card_url: null,
      connected_at: null,
      disconnected_at: null,
      slot_reusable_at: null,
      credential_expires_at: null,
      backfill_completed_at: null,
      privacy: null,
    },
    updates: {
      last_checked_at: null,
      latest_version: null,
      minimum_supported_version: null,
      update_url: null,
    },
  };
}

async function readJson(file, fallback) {
  try {
    const content = await fs.readFile(file, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw new Error(`Could not read ${file}: ${error.message}`);
  }
}

export async function readStats() {
  const stats = await readJson(STATS_PATH, emptyStats());
  if (stats.version !== STATS_VERSION) {
    throw new Error(`Unsupported stats version ${stats.version}. Expected ${STATS_VERSION}.`);
  }
  return stats;
}

export async function writeStats(stats) {
  stats.updated_at = new Date().toISOString();
  await atomicWrite(STATS_PATH, `${JSON.stringify(stats, null, 2)}\n`);
}

export async function readConfig() {
  const stored = await readJson(CONFIG_PATH, {});
  const defaults = defaultConfig();
  return {
    ...defaults,
    ...stored,
    sync: { ...defaults.sync, ...stored.sync },
    privacy: { ...defaults.privacy, ...stored.privacy },
    server: { ...defaults.server, ...stored.server },
    updates: { ...defaults.updates, ...stored.updates },
  };
}

export async function writeConfig(config) {
  await atomicWrite(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
}

export async function writeSvg(svg) {
  await atomicWrite(SVG_PATH, svg);
}

export async function readCredentials() {
  return readJson(CREDENTIALS_PATH, { version: 1, device_token: null });
}

export async function writeCredentials(credentials) {
  await atomicWrite(CREDENTIALS_PATH, `${JSON.stringify(credentials, null, 2)}\n`);
}

export async function removeBurnHome() {
  await fs.rm(BURN_HOME, { recursive: true, force: true });
}

export const paths = {
  home: BURN_HOME,
  stats: STATS_PATH,
  config: CONFIG_PATH,
  credentials: CREDENTIALS_PATH,
  serverOutbox: SERVER_OUTBOX_PATH,
  svg: SVG_PATH,
};
