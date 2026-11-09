import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, NOW } from './helpers/harness.js';
import { createMemoryStore } from './helpers/memory-store.js';
import { CONFIG } from '../tgcloud/lib/config.js';
import { T } from '../tgcloud/lib/formatters.js';
import { createEntry, updateEntry } from '../tgcloud/lib/date-service.js';
import {
  createShare, previewImport, importShare, listShares, revokeShare,
} from '../tgcloud/lib/sharing-service.js';
import { normalizeShareCode, hashShareCode } from '../tgcloud/lib/share-code.js';

const CODE_RE = /[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}/;
const draft = (title, d = 15) => ({ title, year: 1404, month: 3, day: d });

async function seed() {
  const store = createMemoryStore();
  const a = (await createEntry(store, 'A', draft('شروع رابطه'), { now: NOW })).entry;
  const b = (await createEntry(store, 'A', draft('تولد', 20), { now: NOW })).entry;
  const c = (await createEntry(store, 'A', draft('سفر', 25), { now: NOW })).entry;
  return { store, a, b, c };
}

async function importFor(store, user, code, now = NOW) {
  const p = await previewImport(store, user, code, now);
  assert.equal(p.ok, true);
  return importShare(store, user, p.share.id, now);
}

test('share all and share selected', async () => {
  const { store, a, b } = await seed();
  const all = await createShare(store, 'A', null, NOW);
  assert.equal(all.share.dateCount, 3);
  const some = await createShare(store, 'A', [a.id, b.id], NOW);
  assert.equal(some.share.dateCount, 2);
  assert.match(some.code, CODE_RE);
  assert.equal((await listShares(store, 'A')).length, 2);
});

test('only the sharer’s own entries can enter a snapshot', async () => {
  const { store, a } = await seed();
  const foreign = (await createEntry(store, 'B', draft('خصوصی B'), { now: NOW })).entry;
  const r = await createShare(store, 'A', [a.id, foreign.id], NOW);
  assert.equal(r.share.dateCount, 1);
  assert.ok(!r.share.snapshot.includes('خصوصی'));
  assert.equal((await createShare(store, 'A', [foreign.id], NOW)).reason, 'empty');
  assert.equal((await createShare(createMemoryStore(), 'Z', null, NOW)).reason, 'empty');
});

test('only a hash is stored, never the code', async () => {
  const { store } = await seed();
  const r = await createShare(store, 'A', null, NOW);
  const raw = normalizeShareCode(r.code);
  assert.equal(r.share.codeHash, await hashShareCode(raw));
  assert.ok(!JSON.stringify(r.share).includes(raw));
});

test('import into another account; copies are independent', async () => {
  const { store, a } = await seed();
  const { code } = await createShare(store, 'A', null, NOW);
  const r = await importFor(store, 'B', code);
  assert.equal(r.added.length, 3);
  const copies = await store.listDates('B');
  assert.ok(copies.every((e) => e.ownerUserId === 'B' && e.sourceShareId !== ''));

  const copy = copies.find((e) => e.title === 'شروع رابطه');
  await updateEntry(store, 'B', copy.id, draft('عنوان B'), { now: NOW });
  assert.equal((await store.getDate('A', a.id)).title, 'شروع رابطه'); // owner untouched
  assert.equal(await store.getDate('A', copy.id), null); // B's row is not A's
});

test('snapshots are immutable: later edits do not leak into the code', async () => {
  const { store, a } = await seed();
  const { code } = await createShare(store, 'A', [a.id], NOW);
  await updateEntry(store, 'A', a.id, draft('عوض شد'), { now: NOW });
  await importFor(store, 'B', code);
  assert.equal((await store.listDates('B'))[0].title, 'شروع رابطه');
});

test('multiple recipients can use the same active code', async () => {
  const { store } = await seed();
  const { code } = await createShare(store, 'A', null, NOW);
  assert.equal((await importFor(store, 'B', code)).added.length, 3);
  assert.equal((await importFor(store, 'C', code)).added.length, 3);
  assert.equal((await store.listDates('B')).length, 3);
  assert.equal((await store.listDates('C')).length, 3);
});

test('importing the same code again creates no duplicates', async () => {
  const { store } = await seed();
  const { code } = await createShare(store, 'A', null, NOW);
  await importFor(store, 'B', code);
  const again = await importFor(store, 'B', code);
  assert.equal(again.added.length, 0);
  assert.equal(again.duplicates, 3);
  assert.equal((await store.listDates('B')).length, 3);
});

test('same date with a different title is allowed on import', async () => {
  const { store, a } = await seed();
  await createEntry(store, 'B', draft('چیز دیگه'), { now: NOW });
  const { code } = await createShare(store, 'A', [a.id], NOW);
  assert.equal((await importFor(store, 'B', code)).added.length, 1);
  assert.equal((await store.listDates('B')).length, 2);
});

test('case and separators in codes are ignored', async () => {
  const { store } = await seed();
  const { code } = await createShare(store, 'A', null, NOW);
  const messy = code.toLowerCase().replaceAll('-', ' ');
  assert.equal((await previewImport(store, 'B', messy, NOW)).ok, true);
});

test('malformed and unknown codes are rejected with no information leak', async () => {
  const { store } = await seed();
  assert.equal((await previewImport(store, 'B', 'nope', NOW)).reason, 'malformed');
  assert.equal((await previewImport(store, 'B', 'AAAA-AAAA-AAAA-AAAA', NOW)).reason, 'not_found');
  assert.equal((await store.listDates('B')).length, 0);
});

test('revoked codes are rejected; owner-only; copies survive', async () => {
  const { store } = await seed();
  const { code, share } = await createShare(store, 'A', null, NOW);
  await importFor(store, 'B', code);

  assert.equal(await revokeShare(store, 'B', share.id, NOW), false); // not the owner
  assert.equal((await previewImport(store, 'C', code, NOW)).ok, true);

  assert.equal(await revokeShare(store, 'A', share.id, NOW), true);
  assert.equal((await previewImport(store, 'C', code, NOW)).reason, 'not_found'); // same as unknown
  assert.equal((await store.listDates('B')).length, 3); // already-imported copies stay
  assert.equal((await listShares(store, 'A')).length, 0);
});

test('revocation between preview and confirm wins', async () => {
  const { store } = await seed();
  const { code, share } = await createShare(store, 'A', null, NOW);
  const p = await previewImport(store, 'B', code, NOW);
  await revokeShare(store, 'A', share.id, NOW);
  assert.equal((await importShare(store, 'B', p.share.id, NOW)).ok, false);
  assert.equal((await store.listDates('B')).length, 0);
});

test('failed attempts are rate limited per user, then recover', async () => {
  const { store } = await seed();
  const { code } = await createShare(store, 'A', null, NOW);
  for (let i = 0; i < CONFIG.importMaxFailures; i += 1) {
    assert.equal((await previewImport(store, 'B', 'AAAA-AAAA-AAAA-AAAA', NOW)).reason, 'not_found');
  }
  assert.equal((await previewImport(store, 'B', code, NOW)).reason, 'rate_limited');
  assert.equal((await previewImport(store, 'C', code, NOW)).ok, true); // other users unaffected
  assert.equal((await previewImport(store, 'B', code, NOW + CONFIG.importWindowMs + 1)).ok, true);
});

test('active share limit', async () => {
  const { store } = await seed();
  for (let i = 0; i < CONFIG.maxActiveShares; i += 1) assert.equal((await createShare(store, 'A', null, NOW)).ok, true);
  assert.equal((await createShare(store, 'A', null, NOW)).reason, 'limit');
});

// ---------- through the Telegram UI ----------

async function seedUi(h) {
  for (const [title, d] of [['شروع رابطه', 15], ['تولد', 20]]) {
    await createEntry(h.store, '111', draft(title, d), { now: h.deps.now });
  }
}

test('UI: /share all -> code -> recipient /import -> confirm', async () => {
  const h = createHarness();
  await seedUi(h);
  await h.say(111, '/share');
  assert.deepEqual(h.buttons(h.lastSent().keyboard).map((b) => b.callback_data), ['sa', 'ss', 'sx']);
  await h.press(111, 'sa');
  const code = CODE_RE.exec(h.lastEdited().text)[0];
  assert.ok(h.lastEdited().text.includes(`/import ${code}`));

  await h.say(222, `/import ${code}`);
  const preview = h.lastSent();
  assert.ok(preview.text.includes('این کد شامل ۲ تاریخه'));
  assert.ok(preview.text.includes('تولد — ۲۰ خرداد ۱۴۰۴'));
  assert.equal((await h.store.listDates('222')).length, 0); // nothing before confirmation
  await h.press(222, 'ic');
  assert.equal((await h.store.listDates('222')).length, 2);
  assert.ok(h.lastEdited().text.includes('۲ تاریخ به لیستت اضافه شد'));
});

test('UI: selecting individual dates', async () => {
  const h = createHarness();
  await seedUi(h);
  await h.say(111, '/share');
  await h.press(111, 'ss');
  await h.press(111, 'sg');
  assert.equal(h.lastToast(), T.selectAtLeastOne);

  const keys = h.buttons(h.lastEdited().keyboard).map((b) => b.callback_data);
  const pick = keys.find((k) => k.startsWith('st:'));
  await h.press(111, pick);
  await h.press(111, 'sg');
  const code = CODE_RE.exec(h.lastEdited().text)[0];
  await h.say(222, `/import ${code}`);
  await h.press(222, 'ic');
  assert.equal((await h.store.listDates('222')).length, 1);
});

test('UI: cannot toggle another user’s entry into a selection', async () => {
  const h = createHarness();
  await seedUi(h);
  const foreign = (await createEntry(h.store, '222', draft('B خصوصی'), { now: h.deps.now })).entry;
  await h.say(111, '/share');
  await h.press(111, 'ss');
  await h.press(111, `st:${foreign.id}`);
  assert.equal(h.lastToast(), T.notFound);
});

test('UI: no dates -> explains', async () => {
  const h = createHarness();
  await h.say(111, '/share');
  assert.equal(h.lastSent().text, T.noDatesToShare);
});

test('UI: confirm buttons without state do nothing', async () => {
  const h = createHarness();
  await h.press(222, 'ic');
  assert.equal(h.lastToast(), T.expired);
  assert.equal((await h.store.listDates('222')).length, 0);
});

test('UI: /myshares revoke flow, owner-only buttons', async () => {
  const h = createHarness();
  await seedUi(h);
  await h.say(111, '/share');
  await h.press(111, 'sa');
  const code = CODE_RE.exec(h.lastEdited().text)[0];
  const [share] = await h.store.listActiveShares('111');

  await h.say(111, '/myshares');
  assert.ok(h.lastSent().text.includes('۲ تاریخ'));
  assert.ok(h.buttons(h.lastSent().keyboard).some((b) => b.callback_data === `mr:${share.id}`));

  await h.press(222, `mrc:${share.id}`); // not the owner
  assert.equal(h.lastToast(), T.notFound);
  assert.equal((await h.store.listActiveShares('111')).length, 1);

  await h.press(111, `mr:${share.id}`);
  assert.ok(h.lastEdited().text.includes('باطل بشه'));
  await h.press(111, `mrc:${share.id}`);
  assert.equal((await h.store.listActiveShares('111')).length, 0);

  await h.say(222, `/import ${code}`);
  assert.equal(h.lastSent().text, T.importNotFound);
});

test('UI: /import usage, malformed and rate-limit messages', async () => {
  const h = createHarness();
  await h.say(222, '/import');
  assert.equal(h.lastSent().text, T.importUsage);
  await h.say(222, '/import xyz');
  assert.equal(h.lastSent().text, T.importMalformed);
});
