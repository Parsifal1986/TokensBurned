import fs from "node:fs/promises";
import path from "node:path";
import {
  BURN_HOME,
  CONFIG_PATH,
  STATS_PATH,
  STATS_VERSION,
  SVG_PATH,
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

async function atomicWrite(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, content, { mode: 0o600 });
  await fs.rename(temporary, file);
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
  };
}

export async function writeConfig(config) {
  await atomicWrite(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
}

export async function writeSvg(svg) {
  await atomicWrite(SVG_PATH, svg);
}

export async function removeBurnHome() {
  await fs.rm(BURN_HOME, { recursive: true, force: true });
}

export const paths = {
  home: BURN_HOME,
  stats: STATS_PATH,
  config: CONFIG_PATH,
  svg: SVG_PATH,
};
