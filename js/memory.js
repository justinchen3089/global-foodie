// Persistent traveler memory (stored in this browser's localStorage).
import { hasSensitive } from './privacy.js';

const KEY = 'globalfoodie.memory.v1';

export const CATEGORIES = ['allergy', 'diet', 'like', 'dislike', 'spice_tolerance', 'note'];
const LIST_FIELD = { allergy: 'allergies', diet: 'diet', like: 'likes', dislike: 'dislikes', note: 'notes' };

const empty = () => ({ allergies: [], diet: [], likes: [], dislikes: [], spice_tolerance: null, notes: [], history: [], last_location: null, restrictions_status: null });

export function loadMemory() {
  let m;
  try { m = { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return empty(); }
  // Drop anything sensitive that may have been stored by an older version.
  for (const f of ['allergies', 'diet', 'likes', 'dislikes', 'notes']) if (Array.isArray(m[f])) m[f] = m[f].filter((x) => !hasSensitive(x));
  if (m.spice_tolerance && hasSensitive(m.spice_tolerance)) m.spice_tolerance = null;
  if (Array.isArray(m.history)) m.history = m.history.filter((h) => !hasSensitive(JSON.stringify(h)));
  return m;
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
  if (hasSensitive(v) || v.includes('[removed]')) throw new Error('Not saved: that looks like private information (a key, password, card, ID number or contact detail). Global Foodie never stores it.');
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

/** Forget only the location (location is kept for the current visit, never across visits). */
export function clearLocation() { const m = loadMemory(); m.last_location = null; return save(m); }

/** Mark memory as filled in by a sample scenario, so it is wiped on the next visit. */
export function markScenario() { const m = loadMemory(); m.from_scenario = true; return save(m); }
