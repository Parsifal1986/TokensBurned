import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { nextUploadAt, readOutbox, rememberServerPlan, resetOutboxAcknowledgements, syncUsageEntries } from '../src/server-outbox.js';
import { fetchServerPlan } from '../src/server.js';
const now = Date.UTC(2026, 8, 7, 12);
const plan = { id: 'pro_preview', upload_interval_seconds: 300, refresh_interval_seconds: 300, expires_at: new Date(now + 86_400_000).toISOString() };
const entry = (revision = 1) => ({ bucket: Math.floor(now / 900_000), session: 'test', harness: 'codex', provider: 'openai', model: 'gpt-5', revision, input: revision * 10 });
async function options(t, fetchImpl) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'burn-plan-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { now, token: 'test-token', outboxFile: path.join(directory, 'outbox.json'), fetchImpl };
}
const ack = init => new Response(JSON.stringify({ plan, acked_days: JSON.parse(init.body).days }));

test('upload responses negotiate Pro cadence; expired and malformed plans fall back to free', async t => {
  let calls = 0;
  const opts = await options(t, async (_url, init) => { calls++; return ack(init); });
  await syncUsageEntries([entry()], opts);
  await syncUsageEntries([entry(2)], { ...opts, now: now + 299_000, force: true });
  assert.equal(calls, 1);
  await syncUsageEntries([], { ...opts, now: now + 300_000 });
  assert.equal(calls, 2);
  let outbox = await readOutbox(opts.outboxFile);
  assert.equal(outbox.plan.id, 'pro_preview');
  assert.equal(nextUploadAt(outbox, 3_600_000, now + 86_400_000), now + 3_600_000);
  await rememberServerPlan({ ...plan, upload_interval_seconds: 1 }, opts.outboxFile, now);
  assert.equal((await readOutbox(opts.outboxFile)).plan.id, 'free');
  await rememberServerPlan(plan, opts.outboxFile, now);
  await resetOutboxAcknowledgements(opts.outboxFile);
  outbox = await readOutbox(opts.outboxFile);
  assert.equal(outbox.plan, undefined, 'a different connection must not inherit Pro');
});

test('concurrent hooks share one persisted upload lease', async t => {
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const opts = await options(t, async (_url, init) => { calls++; entered(); await gate; return ack(init); });
  const first = syncUsageEntries([entry()], opts);
  await started;
  await Promise.all(Array.from({ length: 15 }, () => syncUsageEntries([entry(2)], { ...opts, force: true })));
  assert.equal(calls, 1);
  release(); await first;
  const outbox = await readOutbox(opts.outboxFile);
  assert.equal(outbox.upload_lease_until, undefined);
  assert.equal(Object.values(outbox.days)[0].revision > Object.values(outbox.days)[0].acked_revision, true);
});

test('429 and network backoff survive later hooks and force uploads', async t => {
  let calls = 0;
  const opts = await options(t, async () => { calls++; return new Response(JSON.stringify({ error: { code: 'account_work_limited', retry_at: new Date(now + 300_000).toISOString() } }), { status: 429 }); });
  await assert.rejects(() => syncUsageEntries([entry()], opts), e => e.status === 429);
  await syncUsageEntries([entry(2)], { ...opts, force: true, now: now + 299_000 });
  assert.equal(calls, 1);
  const fail = async () => { calls++; throw new Error('offline'); };
  await assert.rejects(() => syncUsageEntries([], { ...opts, now: now + 300_000, fetchImpl: fail }));
  const outbox = await readOutbox(opts.outboxFile);
  assert.equal(Date.parse(outbox.upload_retry_at), now + 420_000);
  await syncUsageEntries([], { ...opts, force: true, now: now + 419_000 });
  assert.equal(calls, 2);
});

test('plan status uses authenticated API origin and never browser storage', async () => {
  let target, headers;
  assert.deepEqual(await fetchServerPlan({ token: 'device-token', apiOrigin: 'https://api.example', fetchImpl: async (url, init) => { target = url; headers = init.headers; return new Response(JSON.stringify(plan)); } }), plan);
  assert.equal(target, 'https://api.example/v1/me/plan');
  assert.equal(headers.Authorization, 'Bearer device-token');
});

// A successful server response can ask us to wait past the next UTC window.
test('server next-flush time survives new entries, forced callers and connection reset', async t => {
  let calls = 0;
  const start = now + 290_000;
  const opts = await options(t, async (_url, init) => {
    calls++;
    return new Response(JSON.stringify({ plan, next_flush_after: 600, acked_days: JSON.parse(init.body).days }));
  });
  await syncUsageEntries([entry()], { ...opts, now: start });
  const allowedAt = start + 600_000;
  await syncUsageEntries([entry(2)], { ...opts, now: start + 1, upload: false });
  const queued = await readOutbox(opts.outboxFile);
  assert.equal(Date.parse(queued.server_next_upload_at), allowedAt);
  assert.equal(nextUploadAt(queued, 3_600_000, start + 1), allowedAt);
  await rememberServerPlan(plan, opts.outboxFile, start + 1);
  await syncUsageEntries([], { ...opts, now: allowedAt - 1, force: true });
  assert.equal(calls, 1);
  await syncUsageEntries([], { ...opts, now: allowedAt });
  assert.equal(calls, 2);
  await resetOutboxAcknowledgements(opts.outboxFile);
  assert.equal((await readOutbox(opts.outboxFile)).server_next_upload_at, undefined);
});
