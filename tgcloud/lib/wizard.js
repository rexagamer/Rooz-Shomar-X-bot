import { SUPPORTED_YEAR_MIN, SUPPORTED_YEAR_MAX, getDaysInJalaliMonth } from './jalali.js';
import { parseIntegerInput, parseMonthInput, parseTitleInput } from './input-parsers.js';
import { getState, setState, clearState } from './state-service.js';
import { createEntry, updateEntry, getEntry } from './date-service.js';
import { getSettings } from './settings-service.js';
import { T, formatEntryBlock } from './formatters.js';
import {
  confirmKeyboard, editMenuKeyboard, wizardYearKeyboard, wizardMonthKeyboard,
  wizardTitleKeyboard, TITLE_SUGGESTIONS,
} from './keyboards.js';
import { render, send, showDashboard, showDateList, todayOf } from './screens.js';

const FLOWS = {
  add: { first: 'year', next: { year: 'month', month: 'day', day: 'title', title: 'confirm' } },
  edit_date: { first: 'year', next: { year: 'month', month: 'day', day: 'confirm' } },
  edit_title: { first: 'title', next: { title: 'confirm' } },
};

function promptKeyboard(step, payload) {
  if (step === 'year') {
    const today = todayOf({ now: Date.now() }); // fallback; usually overridden
    return wizardYearKeyboard(payload?._currentYear ?? 1404);
  }
  if (step === 'month') return wizardMonthKeyboard();
  if (step === 'title') return wizardTitleKeyboard();
  return undefined;
}

export async function startWizard(c, kind, base = {}) {
  const { first } = FLOWS[kind];
  const today = todayOf(c.deps);
  const payload = { kind, _currentYear: today.year, ...base };
  await setState(c.deps.store, c.userId, `w_${first}`, payload, c.deps.now);
  const kb = promptKeyboard(first, payload);
  await send(c, T.prompts[first], kb);
}

async function sendConfirm(c, p) {
  await send(
    c, T.confirmDraft(p.kind, p),
    confirmKeyboard('wc', 'wx', p.kind === 'add' ? '✅ ثبت تاریخ' : '✅ ذخیره تغییرات', '❌ لغو'),
  );
}

async function advance(c, step, p) {
  const next = FLOWS[p.kind].next[step];
  await setState(c.deps.store, c.userId, `w_${next}`, p, c.deps.now);
  if (next === 'confirm') await sendConfirm(c, p);
  else {
    const kb = promptKeyboard(next, p);
    await send(c, T.prompts[next], kb);
  }
}

/** Handle year button callback */
export async function handleWizardYearButton(c, yearStr) {
  const st = await getState(c.deps.store, c.userId, c.deps.now);
  if (!st || st.state !== 'w_year') return T.expired;
  const y = Number(yearStr);
  if (y < SUPPORTED_YEAR_MIN || y > SUPPORTED_YEAR_MAX) return T.badYear;
  const p = { ...st.payload, year: y };
  await advance(c, 'year', p);
  return undefined;
}

/** Handle month button callback */
export async function handleWizardMonthButton(c, monthNum) {
  const st = await getState(c.deps.store, c.userId, c.deps.now);
  if (!st || st.state !== 'w_month') return T.expired;
  const p = { ...st.payload, month: monthNum };
  await advance(c, 'month', p);
  return undefined;
}

/** Handle title suggestion button callback */
export async function handleWizardTitleButton(c, suggestionIndex) {
  const st = await getState(c.deps.store, c.userId, c.deps.now);
  if (!st || st.state !== 'w_title') return T.expired;
  const title = TITLE_SUGGESTIONS[suggestionIndex];
  if (title === null) {
    // "custom" button: just tell the user to type
    await send(c, 'عنوان دلخواهت رو بنویس:');
    return undefined;
  }
  const p = { ...st.payload, title };
  await advance(c, 'title', p);
  return undefined;
}

/** Handles a free-text message while a wizard state is active. */
export async function handleWizardText(c, st, text) {
  const step = st.state.slice(2);
  const p = { ...st.payload };
  if (!FLOWS[p.kind]) {
    await clearState(c.deps.store, c.userId);
    await send(c, T.expired);
    return;
  }
  switch (step) {
    case 'year': {
      const y = parseIntegerInput(text);
      if (y === null || y < SUPPORTED_YEAR_MIN || y > SUPPORTED_YEAR_MAX) return send(c, T.badYear);
      p.year = y;
      break;
    }
    case 'month': {
      const m = parseMonthInput(text);
      if (m === null) return send(c, T.badMonth);
      p.month = m;
      break;
    }
    case 'day': {
      const max = getDaysInJalaliMonth(p.year, p.month);
      const d = parseIntegerInput(text);
      if (d === null || d < 1 || d > max) return send(c, T.badDay(p.year, p.month, max));
      p.day = d;
      break;
    }
    case 'title': {
      const t = parseTitleInput(text);
      if (t === null) return send(c, T.badTitle);
      p.title = t;
      break;
    }
    default:
      return sendConfirm(c, p);
  }
  return advance(c, step, p);
}

/** Button: ✅ on the confirmation step. */
export async function confirmWizard(c) {
  const { store, now } = c.deps;
  const st = await getState(store, c.userId, now);
  if (!st || st.state !== 'w_confirm' || !FLOWS[st.payload.kind]) return T.expired;
  const p = st.payload;
  const draft = { title: p.title, year: p.year, month: p.month, day: p.day };
  const result = p.kind === 'add'
    ? await createEntry(store, c.userId, draft, { now })
    : await updateEntry(store, c.userId, p.id, draft, { now });
  await clearState(store, c.userId);
  if (!result.ok) {
    await render(c, c.messageId, T.saveFailed(result.reason));
    return undefined;
  }
  const todayIso = todayOf(c.deps).gregorianDate;
  const settings = await getSettings(store, c.userId);
  await render(c, c.messageId, p.kind === 'add'
    ? T.saved(result.entry, todayIso, settings.displayMode)
    : T.updated(result.entry, todayIso, settings.displayMode));
  await showDashboard(c);
  return undefined;
}

// ---------- edit entry points (called from callbacks) ----------

export async function openEditMenu(c, id) {
  const entry = await getEntry(c.deps.store, c.userId, id);
  if (!entry) return T.notFound;
  const settings = await getSettings(c.deps.store, c.userId);
  await render(
    c, c.messageId,
    `${formatEntryBlock(entry, todayOf(c.deps).gregorianDate, settings.displayMode)}\n\n${T.editWhat}`,
    editMenuKeyboard(id),
  );
  return undefined;
}

export async function beginEdit(c, id, kind) {
  const entry = await getEntry(c.deps.store, c.userId, id);
  if (!entry) return T.notFound;
  const base = kind === 'edit_title'
    ? { id, year: entry.jalaliYear, month: entry.jalaliMonth, day: entry.jalaliDay }
    : { id, title: entry.title };
  await render(c, c.messageId, T.editing(entry));
  await startWizard(c, kind, base);
  return undefined;
}
