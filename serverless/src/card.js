import { summarizeUser } from "./summary.js";

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;",
  })[character]);
}

function formatTokens(value) {
  const number = Number(value || 0);
  if (number >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(1)}B`;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return String(number);
}

function shorten(value, length = 24) {
  const text = String(value || "unknown");
  return text.length > length ? `${text.slice(0, length - 3)}...` : text;
}

function intensity(value, maximum) {
  if (!value || !maximum) return 0;
  return Math.max(1, Math.min(4, Math.ceil(Math.sqrt(value / maximum) * 4)));
}

function rightAlignedX(value, end, fontSize) {
  return Math.max(32, Math.round(end - String(value).length * fontSize * 0.62));
}

function boolOption(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return !["0", "false", "off", "no"].includes(String(value).toLowerCase());
}

export function normalizeCardOptions(input = {}) {
  const layout = input.layout === "compact" ? "compact" : "full";
  return {
    layout,
    heatmap: layout === "compact" ? false : boolOption(input.heatmap, true),
    compare: boolOption(input.compare, layout === "full"),
    meme: boolOption(input.meme, false),
    rank: boolOption(input.rank, true),
  };
}

function calendarHeatmap(days, baseY) {
  const values = days.length ? days : Array.from({ length: 84 }, () => ({ date: "", tokens: 0 }));
  const maximum = Math.max(...values.map((day) => day.tokens), 0);
  return values.slice(-84).map((day, index) => {
    const x = 42 + Math.floor(index / 7) * 18;
    const y = baseY + (index % 7) * 18;
    return `<rect x="${x}" y="${y}" width="13" height="13" rx="2" class="heat${intensity(day.tokens, maximum)}"><title>${escapeXml(day.date)} | ${escapeXml(formatTokens(day.tokens))} tokens</title></rect>`;
  }).join("");
}

function hourlyHeatmap(hours, baseY) {
  const values = hours.length ? hours : Array.from({ length: 24 }, (_, hour) => ({ hour, tokens: 0 }));
  const maximum = Math.max(...values.map((hour) => hour.tokens), 0);
  return values.map((hour, index) => {
    const x = 340 + index * 18;
    return `<rect x="${x}" y="${baseY}" width="13" height="72" rx="2" class="heat${intensity(hour.tokens, maximum)}"><title>${String(hour.hour).padStart(2, "0")}:00 UTC | ${escapeXml(formatTokens(hour.tokens))} tokens in 30 days</title></rect>`;
  }).join("");
}

function heatmapBlock(summary, y) {
  const cellsY = y + 70;
  return `<text x="42" y="${y + 24}" class="section">DAILY HEAT / 12 WEEKS</text><text x="340" y="${y + 24}" class="section">ACTIVE HOURS / 30 DAYS UTC</text>
  <text x="42" y="${y + 51}" class="muted">7 DAYS / COLUMN</text><text x="42" y="${y + 215}" class="muted">12 WEEKS AGO</text><text x="220" y="${y + 215}" class="muted">NOW</text>
  ${calendarHeatmap(summary.daily || [], cellsY)}${hourlyHeatmap(summary.hourly || [], cellsY + 18)}
  <text x="340" y="${y + 70}" class="muted">00</text><text x="448" y="${y + 70}" class="muted">06</text><text x="556" y="${y + 70}" class="muted">12</text><text x="664" y="${y + 70}" class="muted">18</text><text x="772" y="${y + 70}" class="muted">23</text>
  <text x="340" y="${y + 215}" class="muted">${Number(summary.month_requests || 0).toLocaleString("en-US")} REQUESTS IN 30 DAYS</text>`;
}

function comparison(items, x, title, y, width, labelLength) {
  const visible = items.slice(0, 3);
  const total = items.reduce((sum, item) => sum + item.tokens, 0) || 1;
  const body = visible.length ? visible.map((item, index) => {
    const rowY = y + 58 + index * 47;
    const percentage = Math.round(item.tokens / total * 100);
    const percentageLabel = `${percentage}%`;
    return `<text x="${x}" y="${rowY}" class="row">${escapeXml(shorten(item.key, labelLength))}</text>
      <text x="${rightAlignedX(percentageLabel, x + width, 11)}" y="${rowY}" class="pct">${percentageLabel}</text>
      <rect x="${x}" y="${rowY + 13}" width="${Math.max(3, Math.round(width * percentage / 100))}" height="4" rx="2" class="bar"/>`;
  }).join("") : `<text x="${x}" y="${y + 58}" class="muted">No activity yet</text>`;
  return `<text x="${x}" y="${y + 20}" class="section">${escapeXml(title)}</text>${body}`;
}

function comparisonBlock(summary, y, compact) {
  const columns = compact
    ? [[32, "HARNESSES / 30D"], [250, "PROVIDERS / 30D"], [468, "MODELS / 30D"]]
    : [[42, "HARNESSES / 30D"], [310, "PROVIDERS / 30D"], [578, "MODELS / 30D"]];
  const width = compact ? 174 : 220;
  const labelLength = compact ? 16 : 20;
  return [summary.by_harness || [], summary.by_provider || [], summary.by_model || []]
    .map((items, index) => comparison(items, columns[index][0], columns[index][1], y, width, labelLength))
    .join("");
}

function memeBlock(summary, y, width) {
  const messages = [
    "THIS IS FINE. THE CONTEXT WINDOW IS NOT.",
    "THE TOKENS WERE LOAD-BEARING.",
    "ONE MORE PROMPT SHOULD FIX IT.",
    "LOCALLY AGGREGATED. PUBLICLY JUDGED.",
  ];
  const message = messages[Math.abs(Number(summary.all_time_tokens || 0)) % messages.length];
  return `<g transform="rotate(-1 ${width / 2} ${y + 43})"><rect x="42" y="${y + 10}" width="${width - 84}" height="58" rx="4" class="meme-box"/><text x="${width / 2}" y="${y + 47}" text-anchor="middle" class="meme">${escapeXml(message)}</text></g>`;
}

function statsBlock(summary, compact) {
  const stats = [
    ["PAST 24 HOURS", summary.day_tokens],
    ["PAST 7 DAYS", summary.week_tokens],
    ["PAST 30 DAYS", summary.month_tokens],
    ["ALL TIME", summary.all_time_tokens],
  ];
  if (!compact) {
    return stats.map(([label, value], index) => {
      const x = 42 + index * 193;
      return `<text x="${x}" y="111" class="stat-label muted">${label}</text><text x="${x}" y="148" class="stat">${escapeXml(formatTokens(value))}</text>`;
    }).join("");
  }
  return stats.map(([label, value], index) => {
    const x = 32 + (index % 2) * 326;
    const y = index < 2 ? 106 : 171;
    return `<text x="${x}" y="${y}" class="stat-label muted">${label}</text><text x="${x}" y="${y + 34}" class="stat">${escapeXml(formatTokens(value))}</text>`;
  }).join("");
}

export function renderServerCard(summary, slug, rawOptions = {}) {
  const options = normalizeCardOptions(rawOptions);
  const compact = options.layout === "compact";
  const width = compact ? 680 : 840;
  let cursor = compact ? 230 : 180;
  const blocks = [];
  if (options.heatmap) {
    blocks.push(heatmapBlock(summary, cursor));
    cursor += 260;
  }
  if (options.compare) {
    blocks.push(`<line x1="${compact ? 32 : 42}" x2="${width - (compact ? 32 : 42)}" y1="${cursor - 22}" y2="${cursor - 22}" class="rule"/>`);
    blocks.push(comparisonBlock(summary, cursor, compact));
    cursor += 195;
  }
  if (options.meme) {
    blocks.push(memeBlock(summary, cursor, width));
    cursor += 88;
  }
  const footerRuleY = cursor;
  const height = cursor + 65;
  const footerY = height - 24;
  const rank = summary.rank && summary.participants ? `#${summary.rank} OF ${summary.participants}` : "AWAITING RANK";
  const updated = summary.generated_at.slice(0, 16).replace("T", " ");
  const owner = `@${slug}`;
  const updatedLabel = `UPDATED ${updated} UTC`;
  const description = `${formatTokens(summary.week_tokens)} AI coding tokens in seven days${options.rank ? `; ranked ${rank.toLowerCase()} among TokensBurned users` : ""}.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(slug)} on TokensBurned</title><desc id="desc">${escapeXml(description)}</desc>
  <defs><linearGradient id="ember" x1="0" x2="1"><stop offset="0" stop-color="#ff5a1f"/><stop offset="1" stop-color="#ffb000"/></linearGradient></defs>
  <style>
    .bg{fill:#171513}.frame,.rule{stroke:#3b3733}.frame{fill:none}.paper{fill:#f4efe5}.muted{fill:#938d85}.ember{fill:#ff6b28}.bar{fill:url(#ember)}
    .heat0{fill:#292622}.heat1{fill:#63301f}.heat2{fill:#a54121}.heat3{fill:#e45824}.heat4{fill:#ff9a3d}.meme-box{fill:#211d1a;stroke:#ff6b28;stroke-width:2}.meme{fill:#f4efe5;font-size:15px;font-weight:900;letter-spacing:1px}
    text{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}.brand{font-size:18px;font-weight:800;letter-spacing:3px}.owner{font-size:12px}.rank{font-size:11px;font-weight:800;letter-spacing:1.5px;fill:#ff9a3d}.stat-label,.muted{font-size:11px}.stat{font-size:29px;font-weight:800;fill:#f4efe5}.section{font-size:11px;font-weight:800;letter-spacing:1.8px;fill:#ff8a45}.row{font-size:12px;fill:#ded7cd}.pct{font-size:11px;font-weight:700;fill:#f4efe5}
  </style>
  <rect width="${width}" height="${height}" rx="14" class="bg"/><rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="13" class="frame"/>
  <text x="${compact ? 32 : 42}" y="53" class="ember brand">🔥 TOKENSBURNED</text>
  ${options.rank ? `<text x="${rightAlignedX(rank, width - (compact ? 32 : 42), 11)}" y="35" class="rank">${escapeXml(rank)}</text>` : ""}<text x="${rightAlignedX(owner, width - (compact ? 32 : 42), 12)}" y="55" class="muted owner">${escapeXml(owner)}</text>
  <line x1="${compact ? 32 : 42}" x2="${width - (compact ? 32 : 42)}" y1="78" y2="78" class="rule"/>
  ${statsBlock(summary, compact)}${blocks.join("")}
  <line x1="${compact ? 32 : 42}" x2="${width - (compact ? 32 : 42)}" y1="${footerRuleY}" y2="${footerRuleY}" class="rule"/>
  <text x="${compact ? 32 : 42}" y="${footerY}" class="muted">SNAPSHOTS OVERRIDE OVERLAPPING OTEL / NO PROMPTS / NO CODE</text><text x="${rightAlignedX(updatedLabel, width - (compact ? 32 : 42), 11)}" y="${footerY}" class="muted">${escapeXml(updatedLabel)}</text>
</svg>`;
}

export async function refreshUserCard(env, user, now = Date.now()) {
  const summary = await summarizeUser(env, user.user_id || user.id, now);
  const svg = renderServerCard(summary, user.public_slug);
  await env.CARDS.put(`u/${user.public_slug}.svg`, svg, {
    httpMetadata: {
      contentType: "image/svg+xml; charset=utf-8",
      cacheControl: "public, max-age=300, s-maxage=900, stale-while-revalidate=86400",
    },
    customMetadata: { generatedAt: summary.generated_at },
  });
  return { summary, svg };
}
