import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const script = await fs.readFile(new URL('../public/live-card.js', import.meta.url), 'utf8');
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function viewer(fetchImpl) {
  const elements = Object.fromEntries(['live-form','live-name','live-image','live-status','live-start','live-stop'].map(id => [id, {
    value: id === 'live-name' ? 'octocat' : '', events: {}, hidden: true,
    addEventListener(name, callback) { this.events[name] = callback; }, reportValidity() { return true; },
  }]));
  const timers = new Map(); let nextId = 0, now = 0;
  const document = { hidden: false, documentElement: { lang: 'en' }, events: {}, querySelector(selector) { return elements[selector.slice(1)]; }, addEventListener(name, callback) { this.events[name] = callback; } };
  const calls = [];
  vm.runInNewContext(script, {
    document, window: { addEventListener() {} }, AbortController,
    URL: { createObjectURL() { return 'blob:local'; }, revokeObjectURL() {} },
    Date: { now: () => now },
    setTimeout(fn, ms) { const id = ++nextId; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); },
    fetch: async (...args) => { calls.push(args); return fetchImpl(...args); },
  });
  return { elements, calls, timers, document, advance(ms) { now += ms; }, async submit() { elements['live-form'].events.submit({ preventDefault() {} }); await settle(); } };
}

test('live viewer starts only on request, follows server cadence, and omits credentials', async () => {
  const v = viewer(async () => new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml', 'X-TokensBurned-Refresh-After': '300' } }));
  assert.equal(v.calls.length, 0);
  await v.submit();
  assert.equal(v.calls.length, 1);
  assert.equal(v.calls[0][0], 'https://api.tokensburned.com/v1/cards/u/octocat.svg');
  assert.equal(v.calls[0][1].credentials, 'omit');
  assert.equal(v.calls[0][1].redirect, 'error');
  assert.equal(v.elements['live-image'].src, 'blob:local');
  assert.deepEqual([...v.timers.values()].map(t => t.ms), [300_000]);
  await v.submit(); assert.equal(v.calls.length, 1, 'repeat submits cannot accelerate polling');
  v.document.hidden = true; v.document.events.visibilitychange();
  assert.equal(v.timers.size, 0);
  v.advance(300_000); v.document.hidden = false; v.document.events.visibilitychange();
  assert.equal([...v.timers.values()][0].ms, 0);
  v.elements['live-stop'].events.click(); assert.equal(v.timers.size, 0);
});

test('unknown/free cadence is conservative and Retry-After is honored without retry loops', async () => {
  const free = viewer(async () => new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml', 'X-TokensBurned-Refresh-After': '1' } }));
  await free.submit();
  assert.deepEqual([...free.timers.values()].map(t => t.ms), [3_600_000]);
  const limited = viewer(async () => new Response('{}', { status: 429, headers: { 'Retry-After': '7200' } }));
  await limited.submit();
  assert.deepEqual([...limited.timers.values()].map(t => t.ms), [7_200_000]);
  assert.equal(limited.elements['live-image'].hidden, true);
});
