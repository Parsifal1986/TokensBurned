import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderServerCard } from "../serverless/src/card.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "public", "demo");
const daily = Array.from({ length: 84 }, (_, index) => ({
  date: new Date(Date.UTC(2026, 5, 8 + index)).toISOString().slice(0, 10),
  tokens: [0, 18, 42, 74, 28, 96, 61][index % 7] * 100_000,
}));
const hourly = Array.from({ length: 24 }, (_, hour) => ({
  hour,
  tokens: [8, 5, 3, 2, 2, 5, 12, 28, 42, 58, 66, 74, 82, 76, 68, 64, 72, 88, 96, 84, 62, 41, 26, 14][hour] * 100_000,
}));
const sample = {
  day_tokens: 8_400_000,
  week_tokens: 42_300_000,
  month_tokens: 164_800_000,
  all_time_tokens: 1_240_000_000,
  month_requests: 1_842,
  by_harness: [
    { key: "codex", tokens: 78_000_000 },
    { key: "claude-code", tokens: 54_000_000 },
    { key: "gemini-cli", tokens: 32_800_000 },
  ],
  by_provider: [
    { key: "openai", tokens: 78_000_000 },
    { key: "anthropic", tokens: 54_000_000 },
    { key: "google", tokens: 32_800_000 },
  ],
  by_model: [
    { key: "gpt-5.6-sol", tokens: 78_000_000 },
    { key: "claude-opus-5", tokens: 54_000_000 },
    { key: "gemini-3.1-pro", tokens: 32_800_000 },
  ],
  daily,
  hourly,
  rank: 184,
  participants: 3_512,
  generated_at: "2026-08-30T00:00:00.000Z",
};

function variantName(options) {
  return `card-${options.layout}-h${Number(options.heatmap)}-c${Number(options.compare)}-r${Number(options.rank)}-m${Number(options.meme)}.svg`;
}

const variants = [];
for (const layout of ["full", "compact"]) {
  for (const heatmap of layout === "compact" ? [false] : [false, true]) {
    for (const compare of [false, true]) {
      for (const rank of [false, true]) {
        for (const meme of [false, true]) {
          const options = { layout, heatmap, compare, rank, meme };
          variants.push([variantName(options), options]);
        }
      }
    }
  }
}

const cards = [
  ...variants,
  ["card-full.svg", { layout: "full", heatmap: true, compare: true, rank: true, meme: false }],
  ["card-compact.svg", { layout: "compact", heatmap: false, compare: false, rank: true, meme: false }],
  ["card-meme.svg", { layout: "full", heatmap: false, compare: false, rank: true, meme: true }],
];

await fs.mkdir(output, { recursive: true });
await Promise.all(cards.map(([name, options]) =>
  fs.writeFile(
    path.join(output, name),
    renderServerCard(sample, "sample-user", options)
      .replace(/UPDATED [^<]*/, "STATIC SAMPLE / FICTIONAL DATA"),
  )));
console.log(`Wrote ${cards.length} static demo cards to ${output}`);
