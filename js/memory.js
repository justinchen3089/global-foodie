// Persistent traveler memory (stored in this browser's localStorage).
const KEY = 'globalfoodie.memory.v1';

export const CATEGORIES = ['allergy', 'diet', 'like', 'dislike', 'spice_tolerance', 'note'];
const LIST_FIELD = { allergy: 'allergies', diet: 'diet', like: 'likes', dislike: 'dislikes', note: 'notes' };

const empty = () => ({ allergies: [], diet: [], likes: [], dislikes: [], spice_tolerance: null, notes: [], history: [], last_location: null, restrictions_status: null });

export function loadMemory() {
  try { return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return empty(); }
}

function save(m) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new CustomEvent('globalfoodie:memory', { detail: m }));
  return m;
}

export function remember(category, value) {
  const m = loadMemory();
  const v = String(value ?? '').trim();
  if (!v) throw new Error('value is required');
  if (category === 'spice_tolerance') m.spice_tolerance = v;
  else {
    const f = LIST_FIELD[category];
    if (!f) throw new Error(`Unknown category "${category}". Use one of: ${CATEGORIES.join(', ')}`);
    if (!m[f].some((x) => x.toLowerCase() === v.toLowerCase())) m[f].push(v);
    if (category === 'allergy' || category === 'diet') m.restrictions_status = 'has';
  }
  return save(m);
}

export function forget(category, value) {
  const m = loadMemory();
  if (category === 'spice_tolerance') m.spice_tolerance = null;
  else if (category === 'history') m.history = m.history.filter((h) => h.dish.toLowerCase() !== String(value).toLowerCase());
  else {
    const f = LIST_FIELD[category];
    if (!f) throw new Error(`Unknown category "${category}"`);
    m[f] = m[f].filter((x) => x.toLowerCase() !== String(value).toLowerCase());
  }
  return save(m);
}

export function logChoice(entry) {
  const m = loadMemory();
  m.history.unshift({ date: new Date().toISOString().slice(0, 10), ...entry });
  m.history = m.history.slice(0, 50);
  return save(m);
}

export function setLastLocation(loc) {
  const m = loadMemory();
  m.last_location = { ...loc, saved_at: new Date().toISOString() };
  return save(m);
}

/** 'none' = traveler said no restrictions, 'skipped' = chose not to say, 'has' = some on file. */
export function setRestrictionsStatus(status) {
  const m = loadMemory();
  m.restrictions_status = status;
  if (status === 'none') { m.allergies = []; m.diet = []; }
  return save(m);
}

/** Replace the traveler's allergy/diet lists (used by sample scenarios). */
export function setRestrictions({ allergies = [], diet = [], none = false } = {}) {
  const m = loadMemory();
  m.allergies = none ? [] : [...allergies];
  m.diet = none ? [] : [...diet];
  m.restrictions_status = none ? 'none' : (m.allergies.length || m.diet.length) ? 'has' : 'skipped';
  return save(m);
}

export function clearMemory() { return save(empty()); }
