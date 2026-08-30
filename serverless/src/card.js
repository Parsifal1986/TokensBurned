import { summarizeUser } from "./summary.js";

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;",
  })[character]);
}

function formatTokens(value) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function rows(items, y) {
  const total = items.reduce((sum, item) => sum + item.tokens, 0) || 1;
  return items.slice(0, 3).map((item, index) => {
    const percentage = Math.round(item.tokens / total * 100);
    const rowY = y + index * 27;
    return `<text x="42" y="${rowY}" class="label">${escapeXml(item.key)}</text>
    <rect x="224" y="${rowY - 12}" width="220" height="8" rx="2" class="track"/>
    <rect x="224" y="${rowY - 12}" width="${Math.max(2, Math.round(2.2 * percentage))}" height="8" rx="2" class="bar"/>
    <text x="480" y="${rowY}" class="pct">${percentage}%</text>`;
  }).join("\n");
}

export function renderServerCard(summary, slug) {
  const harnesses = summary.by_harness.length
    ? rows(summary.by_harness, 226)
    : `<text x="42" y="226" class="muted">No activity yet.</text>`;
  const topModel = summary.by_model[0]?.key || "Awaiting first burn";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="390" viewBox="0 0 760 390" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(slug)} on TokensBurned</title>
  <desc id="desc">${escapeXml(formatTokens(summary.week_tokens))} AI coding tokens in the last seven days.</desc>
  <defs><linearGradient id="heat" x1="0" x2="1"><stop offset="0" stop-color="#ff5a1f"/><stop offset="1" stop-color="#ffb000"/></linearGradient></defs>
  <style>
    .bg{fill:#171513}.frame{fill:none;stroke:#3b3733}.paper{fill:#f4efe5}.muted{fill:#8f8981}.ember{fill:#ff6b28}.track{fill:#312d29}.bar{fill:url(#heat)}
    text{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}.brand{font-size:18px;font-weight:800;letter-spacing:3px}.big{font-size:46px;font-weight:800}.unit,.muted{font-size:12px}.eyebrow{font-size:11px;font-weight:700;letter-spacing:2px;fill:#ff8a45}.label{font-size:14px;fill:#ded7cd}.pct{font-size:13px;fill:#f4efe5;text-anchor:end}.model{font-size:14px;font-weight:700;fill:#ffb000}
  </style>
  <rect width="760" height="390" rx="14" class="bg"/><rect x="1" y="1" width="758" height="388" rx="13" class="frame"/>
  <text x="42" y="55" class="ember brand">🔥 TOKENSBURNED</text><text x="718" y="54" class="muted" text-anchor="end">${escapeXml(slug)}</text>
  <line x1="42" x2="718" y1="82" y2="82" stroke="#3b3733"/>
  <text x="42" y="116" class="muted">LAST 7 DAYS</text><text x="42" y="163" class="paper big">${escapeXml(formatTokens(summary.week_tokens))}</text>
  <text x="718" y="128" class="muted" text-anchor="end">${summary.week_requests.toLocaleString("en-US")} REQUESTS</text>
  <text x="718" y="151" class="muted" text-anchor="end">${escapeXml(formatTokens(summary.all_time_tokens))} ALL TIME</text>
  <text x="42" y="194" class="eyebrow">HARNESS</text>${harnesses}
  <line x1="42" x2="718" y1="319" y2="319" stroke="#3b3733"/>
  <text x="42" y="349" class="muted">TOP MODEL</text><text x="42" y="373" class="model">${escapeXml(topModel)}</text>
  <text x="718" y="373" class="muted" text-anchor="end">UPDATED ${escapeXml(summary.generated_at.slice(0, 16).replace("T", " "))} UTC</text>
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

