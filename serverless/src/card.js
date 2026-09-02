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
  const requestedTheme = String(input.theme || "dark").toLowerCase();
  return {
    layout,
    heatmap: layout === "compact" ? false : boolOption(input.heatmap, true),
    compare: boolOption(input.compare, layout === "full"),
    meme: boolOption(input.meme, false),
    rank: boolOption(input.rank, true),
    theme: ["auto", "light", "dark"].includes(requestedTheme) ? requestedTheme : "dark",
  };
}

export function normalizeCardPolicy(input = {}, fallback = true) {
  const enabled = (value) => value === undefined ? fallback : Boolean(Number(value));
  return {
    publicCard: enabled(input.public_card),
    harness: enabled(input.publish_harness),
    provider: enabled(input.publish_provider),
    model: enabled(input.publish_model),
    heatmap: enabled(input.publish_heatmap),
    rank: enabled(input.publish_rank),
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

function comparisonBlock(summary, y, compact, policy) {
  const available = [
    [policy.harness, "HARNESSES / 30D", summary.by_harness || []],
    [policy.provider, "PROVIDERS / 30D", summary.by_provider || []],
    [policy.model, "MODELS / 30D", summary.by_model || []],
  ].filter(([visible]) => visible);
  const start = compact ? 32 : 42;
  const usable = compact ? 616 : 756;
  const gap = 24;
  const width = Math.floor((usable - gap * Math.max(0, available.length - 1)) / Math.max(1, available.length));
  const labelLength = compact ? 16 : 20;
  return available
    .map(([, title, items], index) => comparison(items, start + index * (width + gap), title, y, width, labelLength))
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

export function renderServerCard(summary, slug, rawOptions = {}, rawPolicy = {}) {
  const policy = normalizeCardPolicy(rawPolicy);
  const requested = normalizeCardOptions(rawOptions);
  const options = {
    ...requested,
    heatmap: requested.heatmap && policy.heatmap,
    compare: requested.compare && (policy.harness || policy.provider || policy.model),
    rank: requested.rank && policy.rank,
  };
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
    blocks.push(comparisonBlock(summary, cursor, compact, policy));
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc" data-card-theme="${options.theme}">
  <title id="title">${escapeXml(slug)} on TokensBurned</title><desc id="desc">${escapeXml(description)}</desc>
  <defs><linearGradient id="ember" x1="0" x2="1"><stop offset="0" class="gradient-start"/><stop offset="1" class="gradient-end"/></linearGradient></defs>
  <style>
    svg{color-scheme:dark light;--tb-bg:#171513;--tb-frame:#3b3733;--tb-paper:#f4efe5;--tb-muted:#938d85;--tb-accent:#ff6b28;--tb-rank:#ff9a3d;--tb-section:#ff8a45;--tb-row:#ded7cd;--tb-heat0:#292622;--tb-heat1:#63301f;--tb-heat2:#a54121;--tb-heat3:#e45824;--tb-heat4:#ff9a3d;--tb-meme:#211d1a;--tb-gradient-start:#ff5a1f;--tb-gradient-end:#ffb000}
    svg[data-card-theme="light"]{color-scheme:light;--tb-bg:#f5f0e7;--tb-frame:#c9c0b5;--tb-paper:#211d19;--tb-muted:#6f675f;--tb-accent:#d84f1f;--tb-rank:#b63d15;--tb-section:#bf451a;--tb-row:#4b443e;--tb-heat0:#e3dbd0;--tb-heat1:#ffd3bd;--tb-heat2:#ffb184;--tb-heat3:#f47b46;--tb-heat4:#cf481c;--tb-meme:#fff8ee;--tb-gradient-start:#cf461b;--tb-gradient-end:#dc8a00}
    @media(prefers-color-scheme:light){svg[data-card-theme="auto"]{color-scheme:light;--tb-bg:#f5f0e7;--tb-frame:#c9c0b5;--tb-paper:#211d19;--tb-muted:#6f675f;--tb-accent:#d84f1f;--tb-rank:#b63d15;--tb-section:#bf451a;--tb-row:#4b443e;--tb-heat0:#e3dbd0;--tb-heat1:#ffd3bd;--tb-heat2:#ffb184;--tb-heat3:#f47b46;--tb-heat4:#cf481c;--tb-meme:#fff8ee;--tb-gradient-start:#cf461b;--tb-gradient-end:#dc8a00}}
    .bg{fill:var(--tb-bg)}.frame,.rule{stroke:var(--tb-frame)}.frame{fill:none}.paper{fill:var(--tb-paper)}.muted{fill:var(--tb-muted)}.ember{fill:var(--tb-accent)}.bar{fill:url(#ember)}.gradient-start{stop-color:var(--tb-gradient-start)}.gradient-end{stop-color:var(--tb-gradient-end)}
    .heat0{fill:var(--tb-heat0)}.heat1{fill:var(--tb-heat1)}.heat2{fill:var(--tb-heat2)}.heat3{fill:var(--tb-heat3)}.heat4{fill:var(--tb-heat4)}.meme-box{fill:var(--tb-meme);stroke:var(--tb-accent);stroke-width:2}.meme{fill:var(--tb-paper);font-size:15px;font-weight:900;letter-spacing:1px}
    text{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}.brand{font-size:18px;font-weight:800;letter-spacing:3px}.owner{font-size:12px}.rank{font-size:11px;font-weight:800;letter-spacing:1.5px;fill:var(--tb-rank)}.stat-label,.muted{font-size:11px}.stat{font-size:29px;font-weight:800;fill:var(--tb-paper)}.section{font-size:11px;font-weight:800;letter-spacing:1.8px;fill:var(--tb-section)}.row{font-size:12px;fill:var(--tb-row)}.pct{font-size:11px;font-weight:700;fill:var(--tb-paper)}
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
  const userId = user.user_id || user.id;
  const stored = user.public_card === undefined
    ? await env.DB.prepare(
      `SELECT id, public_slug, public_card, publish_harness, publish_provider,
              publish_model, publish_heatmap, publish_rank
         FROM users WHERE id = ?`,
    ).bind(userId).first()
    : user;
  if (!stored || !Number(stored.public_card)) {
    if (stored?.public_slug) await env.CARDS.delete(`u/${stored.public_slug}.svg`);
    return { summary: null, svg: null, published: false };
  }
  const summary = await summarizeUser(env, userId, now);
  const svg = renderServerCard(summary, stored.public_slug, {}, stored);
  await env.CARDS.put(`u/${stored.public_slug}.svg`, svg, {
    httpMetadata: {
      contentType: "image/svg+xml; charset=utf-8",
      cacheControl: "public, max-age=3600, stale-while-revalidate=86400",
    },
    customMetadata: { generatedAt: summary.generated_at },
  });
  return { summary, svg, published: true };
}
