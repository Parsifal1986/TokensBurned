import crypto from "node:crypto";

export function toFiniteInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(dateKey, amount) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return localDateKey(date);
}

export function stableHash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 24);
}

export function formatTokens(value) {
  const amount = Number(value) || 0;
  if (amount >= 1_000_000_000) return `${trim(amount / 1_000_000_000)}B`;
  if (amount >= 1_000_000) return `${trim(amount / 1_000_000)}M`;
  if (amount >= 1_000) return `${trim(amount / 1_000)}K`;
  return String(Math.floor(amount));
}

function trim(value) {
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return value.toFixed(digits).replace(/\.0+$/, "");
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function sortedEntries(record = {}) {
  return Object.entries(record).sort((a, b) => b[1] - a[1]);
}

export function percentages(record = {}) {
  const entries = sortedEntries(record);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  return entries.map(([key, value]) => ({
    key,
    value,
    percentage: total === 0 ? 0 : Math.round((value / total) * 100),
  }));
}

export function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function redactEndpoint(value) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.hostname;
  } catch {
    return "custom endpoint";
  }
}
