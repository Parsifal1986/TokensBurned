import { MEMES } from "./constants.js";
import { addDays, clamp, localDateKey, sortedEntries } from "./utils.js";

function emptyDay() {
  return {
    total_tokens: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    sessions: 0,
    by_harness: {},
    by_provider: {},
    by_model: {},
    by_stack: {},
  };
}

function increment(record, key, amount) {
  record[key] = (record[key] || 0) + amount;
}

export function addEvent(stats, event) {
  if (stats.seen_event_ids.includes(event.id)) return false;

  const dateKey = localDateKey(new Date(event.timestamp));
  const day = stats.daily[dateKey] ?? emptyDay();
  const tokenTotal = Object.values(event.usage).reduce((sum, value) => sum + value, 0);
  const provider = event.backend.provider || "unknown";
  const model = event.backend.resolved_model || event.backend.reported_model || "unknown";
  const stack = `${event.harness.id}::${provider}::${model}`;

  day.total_tokens += tokenTotal;
  day.input_tokens += event.usage.input_tokens;
  day.output_tokens += event.usage.output_tokens;
  day.cache_read_tokens += event.usage.cache_read_tokens;
  day.cache_write_tokens += event.usage.cache_write_tokens;
  day.sessions += 1;
  increment(day.by_harness, event.harness.id, tokenTotal);
  increment(day.by_provider, provider, tokenTotal);
  increment(day.by_model, model, tokenTotal);
  increment(day.by_stack, stack, tokenTotal);
  stats.daily[dateKey] = day;
  stats.seen_event_ids.push(event.id);
  if (stats.seen_event_ids.length > 10_000) {
    stats.seen_event_ids = stats.seen_event_ids.slice(-10_000);
  }
  return true;
}

function mergeRecords(target, source) {
  for (const [key, value] of Object.entries(source || {})) increment(target, key, value);
}

export function summarize(stats, now = new Date()) {
  const todayKey = localDateKey(now);
  const weekStart = addDays(todayKey, -6);
  const allDays = Object.entries(stats.daily).sort(([a], [b]) => a.localeCompare(b));
  const week = {
    total_tokens: 0,
    sessions: 0,
    by_harness: {},
    by_provider: {},
    by_model: {},
    by_stack: {},
  };
  let allTime = 0;

  for (const [date, day] of allDays) {
    allTime += day.total_tokens || 0;
    if (date < weekStart || date > todayKey) continue;
    week.total_tokens += day.total_tokens || 0;
    week.sessions += day.sessions || 0;
    mergeRecords(week.by_harness, day.by_harness);
    mergeRecords(week.by_provider, day.by_provider);
    mergeRecords(week.by_model, day.by_model);
    mergeRecords(week.by_stack, day.by_stack);
  }

  return {
    today: stats.daily[todayKey] ?? emptyDay(),
    week,
    all_time_tokens: allTime,
    streak: calculateStreak(stats.daily, todayKey),
    burn_score: calculateBurnScore(week, calculateStreak(stats.daily, todayKey)),
    dependency: calculateDependency(week.total_tokens, week.sessions),
    level: burnerLevel(week.total_tokens / 7),
    meme: memeForDay(todayKey),
    most_used_stack: sortedEntries(week.by_stack)[0] ?? null,
  };
}

export function calculateStreak(daily, todayKey = localDateKey()) {
  let cursor = daily[todayKey]?.total_tokens > 0 ? todayKey : addDays(todayKey, -1);
  let streak = 0;
  while (daily[cursor]?.total_tokens > 0) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function calculateBurnScore(week, streak) {
  const tokenPoints = Math.log10(Math.max(week.total_tokens, 1)) * 820;
  const sessionPoints = Math.min(week.sessions, 80) * 18;
  const streakPoints = Math.min(streak, 365) * 23;
  const diversityPoints = Object.keys(week.by_harness).length * 180;
  return Math.round(tokenPoints + sessionPoints + streakPoints + diversityPoints);
}

export function calculateDependency(weeklyTokens, sessions) {
  const tokenFactor = Math.log10(Math.max(weeklyTokens, 1)) / 8;
  const sessionFactor = Math.min(sessions / 70, 1);
  return Math.round(clamp((tokenFactor * 0.8 + sessionFactor * 0.2) * 100, 0, 99));
}

export function burnerLevel(tokensPerDay) {
  if (tokensPerDay < 100_000) return "HAND WARMER";
  if (tokensPerDay < 1_000_000) return "TOASTER";
  if (tokensPerDay < 5_000_000) return "SPACE HEATER";
  if (tokensPerDay < 20_000_000) return "INDUSTRIAL FURNACE";
  if (tokensPerDay < 100_000_000) return "SMALL DATA CENTER";
  return "ENVIRONMENTAL INCIDENT";
}

export function memeForDay(dateKey) {
  const number = Number(dateKey.replaceAll("-", ""));
  return MEMES[number % MEMES.length];
}
