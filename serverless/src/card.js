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
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function intensity(value, maximum) {
  if (!value || !maximum) return 0;
  return Math.max(1, Math.min(4, Math.ceil(Math.sqrt(value / maximum) * 4)));
}

function rightAlignedX(value, end, fontSize) {
  return Math.max(42, Math.round(end - String(value).length * fontSize * 0.62));
}

function calendarHeatmap(days) {
  const values = days.length ? days : Array.from({ length: 84 }, () => ({ date: "", tokens: 0 }));
  const maximum = Math.max(...values.map((day) => day.tokens), 0);
  return values.slice(-84).map((day, index) => {
    const x = 42 + Math.floor(index / 7) * 18;
    const y = 250 + (index % 7) * 18;
    return `<rect x="${x}" y="${y}" width="13" height="13" rx="2" class="heat${intensity(day.tokens, maximum)}"><title>${escapeXml(day.date)} · ${escapeXml(formatTokens(day.tokens))} tokens</title></rect>`;
  }).join("");
}

function hourlyHeatmap(hours) {
  const values = hours.length ? hours : Array.from({ length: 24 }, (_, hour) => ({ hour, tokens: 0 }));
  const maximum = Math.max(...values.map((hour) => hour.tokens), 0);
  return values.map((hour, index) => {
    const x = 340 + index * 18;
    return `<rect x="${x}" y="268" width="13" height="72" rx="2" class="heat${intensity(hour.tokens, maximum)}"><title>${String(hour.hour).padStart(2, "0")}:00 UTC · ${escapeXml(formatTokens(hour.tokens))} tokens in 30 days</title></rect>`;
  }).join("");
}

function comparison(items, x, title) {
  const visible = items.slice(0, 3);
  const total = items.reduce((sum, item) => sum + item.tokens, 0) || 1;
  const body = visible.length ? visible.map((item, index) => {
    const y = 493 + index * 47;
    const percentage = Math.round(item.tokens / total * 100);
    const percentageLabel = `${percentage}%`;
    return `<text x="${x}" y="${y}" class="row">${escapeXml(shorten(item.key, 20))}</text>
      <text x="${rightAlignedX(percentageLabel, x + 220, 11)}" y="${y}" class="pct">${percentageLabel}</text>
      <rect x="${x}" y="${y + 13}" width="${Math.max(3, Math.round(2.2 * percentage))}" height="4" rx="2" class="bar"/>`;
  }).join("") : `<text x="${x}" y="493" class="muted">No activity yet</text>`;
  return `<text x="${x}" y="455" class="section">${escapeXml(title)}</text>${body}`;
}

export function renderServerCard(summary, slug) {
  const rank = summary.rank && summary.participants
    ? `#${summary.rank} OF ${summary.participants}`
    : "AWAITING RANK";
  const updated = summary.generated_at.slice(0, 16).replace("T", " ");
  const owner = `@${slug}`;
  const updatedLabel = `UPDATED ${updated} UTC`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="700" viewBox="0 0 840 700" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(slug)} on TokensBurned</title>
  <desc id="desc">${escapeXml(formatTokens(summary.week_tokens))} AI coding tokens in seven days; ranked ${escapeXml(rank.toLowerCase())} among TokensBurned users.</desc>
  <defs><linearGradient id="ember" x1="0" x2="1"><stop offset="0" stop-color="#ff5a1f"/><stop offset="1" stop-color="#ffb000"/></linearGradient></defs>
  <style>
    .bg{fill:#171513}.frame,.rule{stroke:#3b3733}.frame{fill:none}.paper{fill:#f4efe5}.muted{fill:#938d85}.ember{fill:#ff6b28}.bar{fill:url(#ember)}
    .heat0{fill:#292622}.heat1{fill:#63301f}.heat2{fill:#a54121}.heat3{fill:#e45824}.heat4{fill:#ff9a3d}
    text{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}.brand{font-size:18px;font-weight:800;letter-spacing:3px}.owner{font-size:12px}.rank{font-size:11px;font-weight:800;letter-spacing:1.5px;fill:#ff9a3d}.stat-label,.muted{font-size:11px}.stat{font-size:29px;font-weight:800;fill:#f4efe5}.section{font-size:11px;font-weight:800;letter-spacing:1.8px;fill:#ff8a45}.row{font-size:12px;fill:#ded7cd}.pct{font-size:11px;font-weight:700;fill:#f4efe5}
  </style>
  <rect width="840" height="700" rx="14" class="bg"/><rect x="1" y="1" width="838" height="698" rx="13" class="frame"/>
  <text x="42" y="53" class="ember brand">🔥 TOKENSBURNED</text>
  <text x="${rightAlignedX(rank, 798, 11)}" y="35" class="rank">${escapeXml(rank)}</text><text x="${rightAlignedX(owner, 798, 12)}" y="55" class="muted owner">${escapeXml(owner)}</text>
  <line x1="42" x2="798" y1="78" y2="78" class="rule"/>
  ${[
    ["PAST 24 HOURS", summary.day_tokens],
    ["PAST 7 DAYS", summary.week_tokens],
    ["PAST 30 DAYS", summary.month_tokens],
    ["ALL TIME", summary.all_time_tokens],
  ].map(([label, value], index) => {
    const x = 42 + index * 193;
    return `<text x="${x}" y="111" class="stat-label muted">${label}</text><text x="${x}" y="148" class="stat">${escapeXml(formatTokens(value))}</text>`;
  }).join("")}
  <text x="42" y="204" class="section">DAILY HEAT / 12 WEEKS</text><text x="340" y="204" class="section">ACTIVE HOURS / 30 DAYS UTC</text>
  <text x="42" y="231" class="muted">7 DAYS / COLUMN</text><text x="42" y="395" class="muted">12 WEEKS AGO</text><text x="220" y="395" class="muted">NOW</text>
  ${calendarHeatmap(summary.daily || [])}${hourlyHeatmap(summary.hourly || [])}
  <text x="340" y="250" class="muted">00</text><text x="448" y="250" class="muted">06</text><text x="556" y="250" class="muted">12</text><text x="664" y="250" class="muted">18</text><text x="772" y="250" class="muted">23</text>
  <text x="340" y="395" class="muted">${Number(summary.month_requests || 0).toLocaleString("en-US")} REQUESTS IN 30 DAYS</text>
  <line x1="42" x2="798" y1="418" y2="418" class="rule"/>
  ${comparison(summary.by_harness || [], 42, "HARNESSES / 30D")}
  ${comparison(summary.by_provider || [], 310, "PROVIDERS / 30D")}
  ${comparison(summary.by_model || [], 578, "MODELS / 30D")}
  <line x1="42" x2="798" y1="634" y2="634" class="rule"/>
  <text x="42" y="676" class="muted">SNAPSHOTS OVERRIDE OVERLAPPING OTEL</text><text x="${rightAlignedX(updatedLabel, 798, 11)}" y="676" class="muted">${escapeXml(updatedLabel)}</text>
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
