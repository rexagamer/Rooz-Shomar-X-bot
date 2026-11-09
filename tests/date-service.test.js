import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/harness.js';
import { createMemoryStore } from './helpers/memory-store.js';
import { CONFIG } from '../tgcloud/lib/config.js';
import {
  createEntry, updateEntry, removeEntry, listEntries, sortEntries, normalizeDraft,
} from '../tgcloud/lib/date-service.js';

const now = 1_700_000_000_000;
const draft = (title, y = 1404, m = 3, d = 15) => ({ title, year: y, month: m, day: d });

test('create stores canonical Gregorian date and owner', async () => {
  const store = createMemoryStore();
  const r = await createEntry(store, 'A', draft('شروع رابطه'), { now });
  assert.equal(r.ok, true);
  assert.equal(r.entry.gregorianDate, '2025-06-05');
  assert.equal(r.entry.ownerUserId, 'A');
  assert.equal((await store.listDates('A')).length, 1);
});

test('invalid drafts are rejected', async () => {
  const store = createMemoryStore();
  for (const bad of [draft('x', 1404, 12, 30), draft('x', 1404, 13, 1), draft('   '), draft('x'.repeat(81)), draft('x', 1200, 1, 1)]) {
    assert.deepEqual(await createEntry(store, 'A', bad, { now }), { ok: false, reason: 'invalid' });
  }
  assert.equal(normalizeDraft(draft('x', 1403, 12, 30)).gregorianDate, '2025-03-20');
  assert.equal((await store.listDates('A')).length, 0);
});

test('duplicates: same normalized title + date rejected; different title allowed', async () => {
  const store = createMemoryStore();
  await createEntry(store, 'A', draft('شروع رابطه'), { now });
  assert.equal((await createEntry(store, 'A', draft('  شروع   رابطه '), { now })).reason, 'duplicate');
  assert.equal((await createEntry(store, 'A', draft('تولد'), { now })).ok, true);
  assert.equal((await createEntry(store, 'B', draft('شروع رابطه'), { now })).ok, true); // other user
});

test('per-user limit', async () => {
  const store = createMemoryStore();
  for (let i = 0; i < CONFIG.maxDatesPerUser; i += 1) {
    assert.equal((await createEntry(store, 'A', draft(`t${i}`), { now })).ok, true);
  }
  assert.equal((await createEntry(store, 'A', draft('extra'), { now })).reason, 'limit');
});

test('sorting: upcoming soonest first, then past most-recent first', () => {
  const e = (id, g) => ({ id, titleKey: id, gregorianDate: g });
  const sorted = sortEntries(
    [e('old', '2020-01-01'), e('far', '2030-01-01'), e('recent', '2025-11-01'), e('soon', '2025-11-11'), e('today', '2025-11-09')],
    '2025-11-09',
  ).map((x) => x.id);
  assert.deepEqual(sorted, ['today', 'soon', 'far', 'recent', 'old']);
});

test('update: owner only, validated, duplicate-safe', async () => {
  const store = createMemoryStore();
  const { entry } = await createEntry(store, 'A', draft('تولد'), { now });
  await createEntry(store, 'A', draft('سفر', 1404, 4, 1), { now });

  assert.equal((await updateEntry(store, 'B', entry.id, draft('هک'), { now })).reason, 'not_found');
  assert.equal((await store.getDate('A', entry.id)).title, 'تولد');

  assert.equal((await updateEntry(store, 'A', entry.id, draft('سفر', 1404, 4, 1), { now })).reason, 'duplicate');
  assert.equal((await updateEntry(store, 'A', entry.id, draft('تولد', 1404, 12, 30), { now })).reason, 'invalid');

  const ok = await updateEntry(store, 'A', entry.id, draft('تولد من', 1403, 12, 30), { now });
  assert.equal(ok.ok, true);
  assert.equal((await store.getDate('A', entry.id)).gregorianDate, '2025-03-20');
  // saving unchanged values must not count as a duplicate of itself
  assert.equal((await updateEntry(store, 'A', entry.id, draft('تولد من', 1403, 12, 30), { now })).ok, true);
});

test('remove: owner only; listing is isolated', async () => {
  const store = createMemoryStore();
  const { entry } = await createEntry(store, 'A', draft('تولد'), { now });
  assert.equal(await removeEntry(store, 'B', entry.id), null);
  assert.equal((await listEntries(store, 'B', '2025-11-09')).length, 0);
  assert.equal((await listEntries(store, 'A', '2025-11-09')).length, 1);
  assert.equal((await removeEntry(store, 'A', entry.id)).id, entry.id);
  assert.equal((await store.listDates('A')).length, 0);
});
