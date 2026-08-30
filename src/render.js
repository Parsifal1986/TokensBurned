import {
  HARNESS_LABELS,
  PROVIDER_LABELS,
} from "./constants.js";
import { escapeXml, formatTokens, percentages } from "./utils.js";

const WIDTH = 760;
const ROW_HEIGHT = 28;

function labelForHarness(key) {
  return HARNESS_LABELS[key] || titleCase(key);
}

function labelForProvider(key) {
  return PROVIDER_LABELS[key] || titleCase(key);
}

function titleCase(value) {
  return String(value)
    .split(/[-_]/)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function splitStack(stack) {
  if (!stack) return null;
  const [key, tokens] = stack;
  const [harness, provider, model] = key.split("::");
  return {
    harness: labelForHarness(harness),
    backend: provider === "unknown" ? "Unknown" : labelForProvider(provider),
    model: model === "unknown" ? null : model,
    tokens,
  };
}

function barRow({ key, percentage }, y, labeler) {
  const label = escapeXml(labeler(key));
  const width = Math.max(2, Math.round(2.15 * percentage));
  return `
    <text x="44" y="${y}" class="row-label">${label}</text>
    <rect x="214" y="${y - 14}" width="215" height="9" rx="2" class="track"/>
    <rect x="214" y="${y - 14}" width="${width}" height="9" rx="2" class="bar"/>
    <text x="455" y="${y}" class="percent">${percentage}%</text>`;
}

export function renderSvg(summary, options = {}) {
  const harnessRows = percentages(summary.week.by_harness).slice(0, 3);
  const providerRows = options.publishProvider === false
    ? []
    : percentages(summary.week.by_provider).slice(0, 3);
  const stack = splitStack(summary.most_used_stack);
  const harnessHeight = Math.max(harnessRows.length, 1) * ROW_HEIGHT;
  const providerHeight = providerRows.length ? Math.max(providerRows.length, 1) * ROW_HEIGHT + 42 : 0;
  const height = 352 + harnessHeight + providerHeight;
  let y = 211;

  const harnessMarkup = harnessRows.length
    ? harnessRows.map((row) => {
        const markup = barRow(row, y, labelForHarness);
        y += ROW_HEIGHT;
        return markup;
      }).join("")
    : `<text x="44" y="${y}" class="muted">No activity yet. Suspiciously peaceful.</text>`;

  let providerMarkup = "";
  if (providerRows.length) {
    y += 16;
    providerMarkup += `<text x="44" y="${y}" class="eyebrow">BACKEND</text>`;
    y += 35;
    providerMarkup += providerRows.map((row) => {
      const markup = barRow(row, y, labelForProvider);
      y += ROW_HEIGHT;
      return markup;
    }).join("");
  }

  y += 20;
  const status = stack
    ? `${stack.harness} × ${stack.backend}`
    : "Awaiting first burn";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">TokensBurned AI coding activity</title>
  <desc id="desc">${escapeXml(formatTokens(summary.week.total_tokens))} tokens this week, ${summary.streak} day streak.</desc>
  <defs>
    <linearGradient id="heat" x1="0" x2="1">
      <stop offset="0" stop-color="#ff5a1f"/>
      <stop offset="1" stop-color="#ffb000"/>
    </linearGradient>
  </defs>
  <style>
    .bg{fill:#171513}.frame{fill:none;stroke:#3b3733;stroke-width:1}.ember{fill:#ff6b28}.paper{fill:#f4efe5}.muted{fill:#8f8981}.track{fill:#312d29}.bar{fill:url(#heat)}
    text{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}.brand{font-size:18px;font-weight:800;letter-spacing:3px}.big{font-size:44px;font-weight:800}.unit{font-size:14px}.eyebrow{font-size:11px;font-weight:700;letter-spacing:2px;fill:#ff8a45}.row-label{font-size:14px;fill:#ded7cd}.percent{font-size:13px;fill:#f4efe5;text-anchor:end}.metric{font-size:13px;fill:#bdb5ab}.status{font-size:14px;font-weight:700;fill:#ffb000}.quote{font-size:12px;fill:#8f8981;font-style:italic}
  </style>
  <rect width="${WIDTH}" height="${height}" rx="14" class="bg"/>
  <rect x="1" y="1" width="${WIDTH - 2}" height="${height - 2}" rx="13" class="frame"/>
  <g transform="translate(43 31)">
    <path class="ember" d="M13 0c2 10-7 11-3 21-7-5-10 2-10 7 0 9 7 16 16 16s16-7 16-16c0-9-6-17-13-23 1 7-2 10-6 12 2-7-1-12 0-17Z"/>
    <text x="47" y="26" class="paper brand">TOKENSBURNED</text>
    <text x="628" y="24" class="muted unit" text-anchor="end">LOCAL / PRIVATE</text>
  </g>
  <line x1="43" x2="717" y1="91" y2="91" stroke="#3b3733"/>
  <text x="43" y="126" class="muted unit">THIS WEEK</text>
  <text x="43" y="166" class="paper big">${escapeXml(formatTokens(summary.week.total_tokens))}</text>
  <text x="${summary.week.total_tokens ? 43 + String(formatTokens(summary.week.total_tokens)).length * 29 : 95}" y="165" class="muted unit"> TOKENS</text>
  <text x="717" y="130" class="metric" text-anchor="end">${summary.streak} DAY STREAK</text>
  <text x="717" y="156" class="metric" text-anchor="end">SCORE ${summary.burn_score.toLocaleString("en-US")}</text>
  <text x="44" y="${211 - 34}" class="eyebrow">HARNESS</text>
  ${harnessMarkup}
  ${providerMarkup}
  <line x1="43" x2="717" y1="${y}" y2="${y}" stroke="#3b3733"/>
  <text x="43" y="${y + 34}" class="muted unit">MOST USED STACK</text>
  <text x="43" y="${y + 60}" class="status">${escapeXml(status)}</text>
  <text x="717" y="${y + 60}" class="quote" text-anchor="end">“${escapeXml(summary.meme)}”</text>
</svg>`;
}

export function publicStats(summary, options = {}) {
  const toShare = (record) => Object.fromEntries(
    percentages(record).map(({ key, percentage }) => [key, percentage / 100]),
  );
  const result = {
    version: 1,
    week: {
      tokens: summary.week.total_tokens,
      harness: toShare(summary.week.by_harness),
    },
    today: { tokens: summary.today.total_tokens },
    streak: summary.streak,
    burn_score: summary.burn_score,
    level: summary.level,
  };
  if (options.publishProvider !== false) {
    result.week.provider = toShare(summary.week.by_provider);
  }
  return result;
}
