import { runAgent } from './agent.js';
import { TOOL_LABELS, TOOL_MAP } from './tools.js';
import * as mem from './memory.js';
import { renderMarkdown } from './markdown.js';
import { CONFIG } from './config.js';
import { runPreview, previewLocate, sampleRestaurants, setScenarioLocation } from './preview.js';
import { SCENARIOS } from './scenarios.js';
import { AGENTS, AGENT_BY_TOOL } from './agents.js';
import { showLocation, showRestaurants, refreshMap, hasLocation, focusPlace, setPlaceActions } from './map.js';

const $ = (s) => document.querySelector(s);

// ---------- Settings ----------
// The Gemini key lives on the proxy (Cloudflare Worker). The site only knows the proxy URL.
const getSettings = () => ({ proxyUrl: CONFIG.PROXY_URL });
const proxyConfigured = () => CONFIG.PROXY_URL && !CONFIG.PROXY_URL.includes('YOUR-SUBDOMAIN');

// ---------- Chat state ----------
let history = [];
let pendingImages = [];
let busy = false;
let turn = 0;
let sessionTurns = 0;
let session = {}; // per-chat state shared with the agents (e.g. attached photos)
const messagesEl = $('#messages');

function resetChat() {
  history = []; turn = 0; sessionTurns = 0; session = {};
  messagesEl.querySelectorAll('.msg, .working').forEach((n) => n.remove());
  $('#welcome').hidden = false;
  $('#trace').innerHTML = '<p class="muted">Each step the agent takes — tool calls, inputs and results — appears here.</p>';
  syncOnboarding();
}
$('#newChat').addEventListener('click', resetChat);

function scrollDown() { messagesEl.scrollTop = messagesEl.scrollHeight; }

function addMessage(role, html, cls = '') {
  $('#welcome').hidden = true;
  const div = document.createElement('div');
  div.className = `msg ${role} ${cls}`.trim();
  div.innerHTML = html;
  messagesEl.appendChild(div);
  scrollDown();
  return div;
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------- Trace panel ----------
const traceEl = $('#trace');
function traceTurn(text) {
  traceEl.querySelector(':scope > p.muted')?.remove();
  const l = document.createElement('div');
  l.className = 'turn-label';
  l.textContent = `Turn ${turn} · “${text.slice(0, 48)}${text.length > 48 ? '…' : ''}”`;
  traceEl.appendChild(l);
}
const stepEls = new Map();
const lastChild = new Map();
function traceStart(call, step) {
  const el = document.createElement('details');
  const sub = call.agent && call.agent !== 'orchestrator' && AGENTS[call.agent];
  const isDelegation = !!AGENT_BY_TOOL[call.name];
  el.className = `step running${sub ? ' nested' : ''}${isDelegation ? ' delegation' : ''}`;
  const who = sub ? `<span class="agent-badge">${sub.emoji} ${sub.name}</span>` : isDelegation ? '<span class="agent-badge orch">🤖 Orchestrator →</span>' : '';
  el.innerHTML = `<summary>${who}<span>${isDelegation ? AGENTS[AGENT_BY_TOOL[call.name]].emoji + ' ' + AGENTS[AGENT_BY_TOOL[call.name]].name : TOOL_LABELS[call.name] || '🔧'}</span>${isDelegation ? '' : `<code>${call.name}</code>`}<span class="status">running…</span></summary>
    <div class="k">step ${step} · input</div><pre>${escapeHtml(JSON.stringify(call.input, null, 2))}</pre>`;
  // Nest an agent's own tool calls directly under the delegation that started it.
  const parent = call.parentId && stepEls.get(call.parentId);
  if (parent) { const after = lastChild.get(call.parentId) || parent; after.after(el); lastChild.set(call.parentId, el); }
  else traceEl.appendChild(el);
  traceEl.scrollTop = traceEl.scrollHeight;
  stepEls.set(call.id, el);
}
function traceEnd(call, content, isError) {
  const el = stepEls.get(call.id); if (!el) return;
  el.classList.remove('running');
  el.classList.add(isError ? 'failed' : 'done');
  el.querySelector('.status').textContent = isError ? 'error' : 'done';
  let pretty = content;
  try { pretty = JSON.stringify(JSON.parse(content), null, 2); } catch { /* keep raw */ }
  el.insertAdjacentHTML('beforeend', `<div class="k">output</div><pre>${escapeHtml(pretty.slice(0, 6000))}</pre>`);
}

// ---------- Sending ----------
const input = $('#input');
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; });
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#composer').requestSubmit(); } });

$('#composer').addEventListener('submit', (e) => { e.preventDefault(); send(input.value.trim()); });
document.querySelectorAll('[data-prompt]').forEach((b) => b.addEventListener('click', () => {
  send(b.dataset.prompt);
}));

async function send(text, opts = {}) {
  if (busy || (!text && !pendingImages.length)) return;
  const settings = getSettings();
  if (!CONFIG.PREVIEW && !proxyConfigured()) {
    addMessage('error', 'Global Foodie isn\'t connected to Gemini yet. Set <code>PROXY_URL</code> in <code>js/config.js</code> to your Cloudflare Worker URL (see README), or set <code>PREVIEW: true</code> for a demo.', 'error');
    return;
  }

  const maxTurns = CONFIG.LIMITS?.MAX_TURNS_PER_SESSION || 20;
  if (sessionTurns >= maxTurns) {
    addMessage('error', `This chat reached its limit of ${maxTurns} messages (a cost cap for the public demo). Click <b>New chat</b> to keep going.`, 'error');
    return;
  }
  sessionTurns++;
  busy = true; $('#sendBtn').disabled = true;
  const images = pendingImages; pendingImages = []; renderAttachments();
  input.value = ''; input.style.height = 'auto';
  turn++;
  traceTurn(text || '(photo)');

  const thumbs = images.length ? `<div class="thumbs">${images.map((i) => `<img src="${i.dataUrl}" alt="attached photo">`).join('')}</div>` : '';
  addMessage('user', thumbs + escapeHtml(text || '').replace(/\n/g, '<br>'));

  const working = document.createElement('div');
  working.className = 'working';
  working.innerHTML = '<span class="dots"><span></span><span></span><span></span></span><span class="label">Thinking…</span>';
  messagesEl.appendChild(working); scrollDown();
  const setStatus = (s) => { working.querySelector('.label').textContent = s; };

  const snapshot = history.length;
  const searchSuggestions = [];
  try {
    await (CONFIG.PREVIEW ? runPreview : runAgent)({
      settings, history, userText: text, images, scenarioId: opts.scenarioId, session,
      hooks: {
        onText: (t, isFinal) => {
          const el = addMessage('assistant', linkPins(renderMarkdown(t)), isFinal ? '' : 'interim');
          messagesEl.appendChild(working); // keep indicator last
          if (isFinal) working.remove(); else el.scrollIntoView({ block: 'end' });
        },
        onToolStart: (call, step) => { setStatus(`${call.agent && AGENTS[call.agent] ? AGENTS[call.agent].emoji + ' ' + AGENTS[call.agent].name + ': ' : ''}${TOOL_LABELS[call.name] || call.name}…`); traceStart(call, step); },
        onToolEnd: (call, content, isError) => { traceEnd(call, content, isError); setStatus('Thinking…'); if (!isError) updateMapFromTool(call.name, content); },
        onDisplay: (d) => { if (d.searchSuggestionsHtml) searchSuggestions.push(d.searchSuggestionsHtml); },
        onCapped: (n, max, role) => traceEl.insertAdjacentHTML('beforeend', `<div class="step failed"><summary>⛔ ${n} extra tool call(s) skipped: ${role === 'orchestrator' || !AGENTS[role] ? 'orchestrator' : AGENTS[role].name} limit of ${max} per message</summary></div>`),
        confirm: (call, label) => { setStatus('Waiting for your approval…'); return askApproval(call, label, working); },
      },
    });
  } catch (err) {
    history.length = snapshot; // roll back a half-finished turn so the conversation stays valid
    addMessage('error', escapeHtml(err.message) + (/401|403|invalid.*key|authentication/i.test(err.message) ? '<br><small>Check your API key in Settings.</small>' : ''), 'error');
  } finally {
    if (searchSuggestions.length) showSearchSuggestions(searchSuggestions[searchSuggestions.length - 1]);
    working.remove();
    busy = false; $('#sendBtn').disabled = false;
    input.focus();
  }
}

// Google requires showing "Search Suggestions" when an answer uses Google Search grounding.
function showSearchSuggestions(html) {
  const wrap = addMessage('assistant', '<div class="small muted">Related Google searches</div>', 'suggestions');
  const frame = document.createElement('iframe');
  frame.sandbox = 'allow-popups allow-popups-to-escape-sandbox';
  frame.srcdoc = `<base target="_blank">${html}`;
  frame.title = 'Google Search suggestions';
  frame.onload = () => { try { frame.style.height = frame.contentDocument.body.scrollHeight + 16 + 'px'; } catch { frame.style.height = '90px'; } };
  wrap.appendChild(frame);
}

// ---------- Human gate ----------
// Shown in the chat between "the model asked to run a gated tool" and "the tool runs".
// It shows the exact tool name and arguments, and nothing runs until Approve is clicked.
function askApproval(call, label, workingEl) {
  return new Promise((resolve) => {
    const card = addMessage('assistant', `<div class="gate">
      <div class="gate-title">🔒 Approval needed: ${escapeHtml(label)}</div>
      <div class="small muted">Global Foodie wants to do this with exactly these details. Nothing happens until you choose.</div>
      <dl class="gate-args">${Object.entries(call.input || {}).map(([k, v]) => `<dt>${escapeHtml(k.replace(/_/g, ' '))}</dt><dd>${escapeHtml(typeof v === 'string' ? v : JSON.stringify(v))}</dd>`).join('') || '<dt>details</dt><dd>none</dd>'}</dl>
      <div class="gate-actions"><button type="button" class="primary" data-ok="1">Approve</button><button type="button" data-ok="0">Deny</button></div>
    </div>`, 'gate-msg');
    if (workingEl?.isConnected) messagesEl.appendChild(workingEl);
    card.querySelectorAll('.gate-actions button').forEach((b) => b.addEventListener('click', () => {
      const ok = b.dataset.ok === '1';
      card.querySelector('.gate-actions').innerHTML = ok ? '<span class="gate-ok">✅ Approved: the tool ran</span>' : '<span class="gate-no">🚫 Denied: the tool did not run</span>';
      resolve(ok);
    }, { once: true }));
    card.querySelector('.gate-actions .primary').focus();
  });
}

// ---------- Image attachments ----------
async function fileToImage(file, max = 1568) {
  const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const out = c.toDataURL('image/jpeg', 0.85);
  return { mediaType: 'image/jpeg', data: out.split(',')[1], dataUrl: out };
}
$('#fileInput').addEventListener('change', async (e) => {
  for (const f of [...e.target.files].slice(0, 4)) {
    try { pendingImages.push(await fileToImage(f)); } catch { alert(`Couldn't read ${f.name}`); }
  }
  e.target.value = '';
  renderAttachments(); input.focus();
});
function renderAttachments() {
  const box = $('#attachments');
  box.innerHTML = '';
  pendingImages.forEach((img, i) => {
    const d = document.createElement('div'); d.className = 'att';
    d.innerHTML = `<img src="${img.dataUrl}" alt="attachment"><button type="button" aria-label="Remove">✕</button>`;
    d.querySelector('button').onclick = () => { pendingImages.splice(i, 1); renderAttachments(); };
    box.appendChild(d);
  });
}

// ---------- Memory panel ----------
const SECTIONS = [
  ['allergies', 'allergy', 'Allergies'], ['diet', 'diet', 'Diet'], ['likes', 'like', 'Likes'],
  ['dislikes', 'dislike', 'Dislikes'], ['notes', 'note', 'Notes'],
];
function renderMemory() {
  const m = mem.loadMemory();
  const el = $('#memory');
  const chips = (field, cat) => (m[field].length
    ? m[field].map((v) => `<span class="chip ${cat}">${escapeHtml(v)}<button data-forget="${cat}" data-value="${escapeHtml(v)}" aria-label="Remove">✕</button></span>`).join('')
    : '<span class="muted small">—</span>');
  el.innerHTML = `
    ${SECTIONS.map(([f, c, t]) => `<div class="mem-section"><h3>${t}</h3><div class="chips">${chips(f, c)}</div></div>`).join('')}
    <div class="mem-section"><h3>Spice tolerance</h3>${m.spice_tolerance ? `<span class="chip">${escapeHtml(m.spice_tolerance)}<button data-forget="spice_tolerance" aria-label="Remove">✕</button></span>` : '<span class="muted small">—</span>'}</div>
    <div class="mem-section"><h3>Last location</h3><span class="small">${m.last_location ? escapeHtml(m.last_location.place || `${m.last_location.lat}, ${m.last_location.lon}`) : '<span class="muted">—</span>'}</span></div>
    <div class="mem-section"><h3>Past choices</h3>${m.history.length ? `<ul class="history">${m.history.slice(0, 15).map((h) => `<li><b>${escapeHtml(h.dish)}</b>${h.restaurant ? ` @ ${escapeHtml(h.restaurant)}` : ''}${h.rating ? ` · ${'★'.repeat(Math.round(h.rating))}` : ''} <span class="muted">${h.date}</span></li>`).join('')}</ul>` : '<span class="muted small">—</span>'}</div>
    <div class="mem-section"><h3>Add manually</h3>
      <form class="mem-add" id="memAdd">
        <select name="cat">${mem.CATEGORIES.map((c) => `<option>${c}</option>`).join('')}</select>
        <input name="val" placeholder="e.g. peanut" required><button>Add</button>
      </form>
    </div>
    <button id="clearMem" class="ghost small">Clear all memory</button>`;
  el.querySelectorAll('[data-forget]').forEach((b) => b.addEventListener('click', () => mem.forget(b.dataset.forget, b.dataset.value)));
  el.querySelector('#memAdd').addEventListener('submit', (e) => { e.preventDefault(); mem.remember(e.target.cat.value, e.target.val.value); });
  el.querySelector('#clearMem').addEventListener('click', () => { if (confirm('Clear everything Global Foodie remembers about you?')) mem.clearMemory(); });
}
window.addEventListener('globalfoodie:memory', renderMemory);
renderMemory();

// ---------- Tabs & mobile panel ----------
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === b.dataset.tab));
}));


if (CONFIG.PREVIEW) {
  const b = document.createElement('div');
  b.className = 'preview-banner';
  b.innerHTML = '<b>Demo mode</b> · allergy checks, taste matching and memory run for real; location, restaurants and search use sample data until the Gemini agent is connected. <button type="button" id="resetDemo" class="ghost small">↺ Reset demo</button>';
  document.querySelector('.chat').prepend(b);
  b.querySelector('#resetDemo').addEventListener('click', () => {
    try { localStorage.removeItem('globalfoodie.memory.v1'); } catch { /* storage unavailable */ }
    location.reload();
  });
}

// ---------- Map updates from agent tools ----------
function updateMapFromTool(name, content) {
  let out; try { out = JSON.parse(content); } catch { return; }
  if ((name === 'get_current_location' || name === 'geocode_location') && out.lat != null) {
    showLocation({ lat: out.lat, lon: out.lon, place: out.place, sample: CONFIG.PREVIEW });
    syncOnboarding();
  }
  if (name === 'find_nearby_restaurants' && out.restaurants) {
    const cuisine = (out.cuisine_filter || '').split(/[;,]/)[0].replace(/_/g, ' ').trim();
    showRestaurants(out.restaurants, 'Picks', cuisine ? `${cuisine} restaurants` : 'restaurants');
  }
}

// ---------- Onboarding: 1 location (with map) → 2 optional restrictions → 3 craving ----------
const DIET_GROUPS = [
  ['Major allergens (FDA "Big 9")', [
    ['allergy', 'peanut', '🥜 Peanuts'], ['allergy', 'tree nuts', '🌰 Tree nuts'], ['allergy', 'milk', '🥛 Milk / dairy'],
    ['allergy', 'egg', '🥚 Eggs'], ['allergy', 'wheat', '🌾 Wheat'], ['allergy', 'soy', '🫘 Soy'],
    ['allergy', 'fish', '🐟 Fish'], ['allergy', 'shellfish', '🦐 Shellfish'], ['allergy', 'sesame', 'Sesame'],
  ]],
  ['Other common allergies & intolerances', [
    ['allergy', 'gluten', 'Gluten (celiac)'], ['allergy', 'lactose', 'Lactose'], ['allergy', 'mollusks', '🦪 Mollusks'],
    ['allergy', 'mustard', 'Mustard'], ['allergy', 'celery', 'Celery'], ['allergy', 'corn', '🌽 Corn'],
    ['allergy', 'coconut', '🥥 Coconut'], ['allergy', 'sulfites', 'Sulfites'], ['allergy', 'lupin', 'Lupin'],
    ['allergy', 'red meat (alpha-gal)', '🥩 Red meat (alpha-gal)'],
  ]],
  ['Diets', [
    ['diet', 'vegetarian', '🥬 Vegetarian'], ['diet', 'vegan', '🌱 Vegan'], ['diet', 'pescatarian', 'Pescatarian'],
    ['diet', 'halal', 'Halal'], ['diet', 'kosher', 'Kosher'], ['diet', 'no pork', 'No pork'], ['diet', 'no beef', 'No beef'],
    ['diet', 'no alcohol', 'No alcohol'],
  ]],
];
const PRESET = new Set(DIET_GROUPS.flatMap(([, list]) => list.map(([, v]) => v)));
let dietDone = false;

function traceSetup(name, input, fn) {
  if (!traceEl.querySelector('.setup-label')) {
    traceEl.querySelector(':scope > p.muted')?.remove();
    traceEl.insertAdjacentHTML('afterbegin', '<div class="turn-label setup-label">Setup</div>');
  }
  const call = { id: `setup_${Date.now()}_${name}`, name, input };
  traceStart(call, 'setup');
  return Promise.resolve().then(fn).then((out) => { traceEnd(call, JSON.stringify(out), false); return out; },
    (e) => { traceEnd(call, JSON.stringify({ error: e.message }), true); throw e; });
}

async function loadNearby() {
  try {
    const out = await traceSetup('find_nearby_restaurants', { radius_m: 800, limit: 12 }, () =>
      CONFIG.PREVIEW ? sampleRestaurants() : TOOL_MAP.find_nearby_restaurants.run({ radius_m: 800, limit: 12 }));
    showRestaurants(out.restaurants, 'Nearby restaurants', 'restaurants');
  } catch { /* map still shows the location */ }
}

async function setLocation(query) {
  const status = $('#obLocStatus');
  status.textContent = query ? `Finding “${query}”…` : 'Asking your browser for your location…';
  status.className = 'ob-status small';
  try {
    let loc, note = null;
    if (CONFIG.PREVIEW) {
      ({ loc, note } = previewLocate(query));
      await traceSetup(query ? 'geocode_location' : 'get_current_location', query ? { query } : {}, () => loc);
    } else if (query) {
      loc = await traceSetup('geocode_location', { query }, () => TOOL_MAP.geocode_location.run({ query }));
      if (!loc.found) throw new Error(loc.message);
    } else {
      loc = await traceSetup('get_current_location', {}, () => TOOL_MAP.get_current_location.run());
    }
    showLocation({ lat: loc.lat, lon: loc.lon, place: loc.place, sample: CONFIG.PREVIEW });
    status.textContent = note || '';
    syncOnboarding();
    loadNearby();
    setTimeout(() => $('#obDiet').scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
  } catch (e) {
    status.textContent = `${e.message.replace(/ Ask the user.*$/, '')} Type your city or neighborhood instead.`;
    status.className = 'ob-status small error-text';
    $('#obPlace input').focus();
  }
}

$('#obGeo').addEventListener('click', () => setLocation());
$('#obPlace').addEventListener('submit', (e) => { e.preventDefault(); const q = e.target.q.value.trim(); if (q) setLocation(q); });
$('#mapChange').addEventListener('click', () => {
  setView('chat');
  $('#welcome').hidden = false;
  $('#obLocation').classList.remove('done');
  $('#obPlace input').focus();
  messagesEl.scrollTop = 0;
});

function renderDietChips() {
  const m = mem.loadMemory();
  const has = (cat, v) => (cat === 'allergy' ? m.allergies : m.diet).some((x) => x.toLowerCase() === v.toLowerCase());
  const chip = (cat, v, label) => `<button type="button" class="toggle ${has(cat, v) ? 'on' : ''}" data-cat="${cat}" data-v="${escapeHtml(v)}" aria-pressed="${has(cat, v)}">${escapeHtml(label)}</button>`;
  const custom = [...m.allergies.map((v) => ['allergy', v]), ...m.diet.map((v) => ['diet', v])].filter(([, v]) => !PRESET.has(v.toLowerCase()));
  $('#obDietGroups').innerHTML = DIET_GROUPS.map(([title, list]) =>
    `<div class="chip-group"><div class="chip-group-title">${title}</div><div class="chips">${list.map(([c, v, l]) => chip(c, v, l)).join('')}</div></div>`).join('')
    + (custom.length ? `<div class="chip-group"><div class="chip-group-title">Your additions</div><div class="chips">${custom.map(([c, v]) => chip(c, v, `${v} ✕`)).join('')}</div></div>` : '');
  $('#obDietGroups').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    if (b.classList.contains('on')) mem.forget(b.dataset.cat, b.dataset.v); else mem.remember(b.dataset.cat, b.dataset.v);
  }));
}
$('#obOther').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = e.target.v.value.trim();
  if (!v) return;
  v.split(/,|\band\b/).map((s) => s.trim()).filter(Boolean).forEach((x) => mem.remember(e.target.cat.value, x));
  e.target.v.value = '';
  e.target.v.focus();
});
function finishDiet(status) {
  const m = mem.loadMemory();
  if (status) mem.setRestrictionsStatus(status);
  else if (!m.allergies.length && !m.diet.length) mem.setRestrictionsStatus('skipped');
  dietDone = true;
  syncOnboarding();
  $('#obCraving').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
$('#obDietDone').addEventListener('click', () => finishDiet());
// Reopen step 2 so the traveler can add, type or remove allergies after answering it.
function reopenDiet() {
  dietDone = false;
  syncOnboarding();
  $('#obDiet').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  setTimeout(() => $('#obOtherInput').focus(), 150);
}
$('#obDietEdit').addEventListener('click', (e) => { e.stopPropagation(); reopenDiet(); });
$('#obDiet').addEventListener('click', (e) => { if ($('#obDiet').classList.contains('done') && e.target.closest('.ob-title')) reopenDiet(); });
function reopenLocation() { $('#obLocation').classList.remove('done'); $('#obPlace input').focus(); }
$('#obLocEdit').addEventListener('click', (e) => { e.stopPropagation(); reopenLocation(); });
$('#obLocation').addEventListener('click', (e) => { if ($('#obLocation').classList.contains('done') && e.target.closest('.ob-title')) reopenLocation(); });
$('#obNone').addEventListener('click', () => finishDiet('none'));
$('#obSkip').addEventListener('click', () => finishDiet('skipped'));

function syncOnboarding() {
  const m = mem.loadMemory();
  const hasLoc = !!m.last_location && hasLocation();
  // Allergies never depend on location: step 2 is always open. Step 3 opens once step 2 is answered.
  $('#obLocation').classList.toggle('done', hasLoc);
  $('#obDiet').classList.toggle('locked', false);
  $('#obDiet').classList.toggle('done', dietDone);
  $('#obCraving').classList.toggle('locked', !dietDone);
  const summary = m.restrictions_status === 'none' ? 'No restrictions'
    : m.allergies.length || m.diet.length ? [...m.allergies, ...m.diet].join(', ') : m.restrictions_status === 'skipped' ? 'Skipped' : '';
  $('#obDiet .ob-title').dataset.summary = summary;
  $('#obLocation .ob-title').dataset.summary = m.last_location?.place || '';
  renderDietChips();
}
window.addEventListener('globalfoodie:memory', syncOnboarding);

// Restore a saved location on load (map first).
{
  if (mem.loadMemory().restrictions_status) dietDone = true;
  const last = mem.loadMemory().last_location;
  if (last?.lat != null) { showLocation({ lat: last.lat, lon: last.lon, place: last.place, sample: CONFIG.PREVIEW || /SAMPLE/.test(last.source || '') }); loadNearby(); }
  syncOnboarding();
}

// ---------- Sample scenarios ----------
function renderScenarios() {
  $('#scenarioGrid').innerHTML = SCENARIOS.map((sc) => {
    const who = sc.profile.none ? 'No restrictions' : [...(sc.profile.allergies || []), ...(sc.profile.diet || [])].join(', ');
    return `<button type="button" class="scenario" data-id="${sc.id}"><span class="sc-emoji">${sc.emoji}</span><span class="sc-title">${escapeHtml(sc.title)}</span><span class="sc-meta">📍 ${escapeHtml(sc.city)} · ${escapeHtml(who)}</span></button>`;
  }).join('');
  $('#scenarioGrid').querySelectorAll('.scenario').forEach((b) => b.addEventListener('click', () => runScenario(SCENARIOS.find((s) => s.id === b.dataset.id))));
}

async function runScenario(sc) {
  if (busy) return;
  resetChat();
  mem.setRestrictions({ allergies: sc.profile.allergies, diet: sc.profile.diet, none: sc.profile.none });
  if (sc.profile.spice) mem.remember('spice_tolerance', sc.profile.spice);
  const loc = CONFIG.PREVIEW ? setScenarioLocation(sc) : { lat: sc.lat, lon: sc.lon, place: sc.place, source: `scenario: ${sc.id}` };
  if (!CONFIG.PREVIEW) mem.setLastLocation(loc);
  await traceSetup('scenario', { traveler: sc.title, location: sc.place, profile: sc.profile }, () => ({ loaded: true, location: loc.place }));
  showLocation({ lat: loc.lat, lon: loc.lon, place: loc.place, sample: CONFIG.PREVIEW });
  dietDone = true;
  syncOnboarding();
  send(sc.prompt, { scenarioId: sc.id });
}
renderScenarios();
$('#openScenarios').addEventListener('click', () => { if (busy) return; resetChat(); setTimeout(() => $('.scenarios').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); });

// ---------- Step 3: "Craving for…" ----------
const CRAVINGS = [
  ['noodles', '🍜 Noodles'], ['something spicy', '🌶️ Something spicy'], ['seafood', '🦐 Seafood'], ['BBQ', '🍖 BBQ'],
  ['tacos', '🌮 Tacos'], ['pizza', '🍕 Pizza'], ['soup', '🍲 Soup'], ['sushi', '🍣 Sushi'], ['curry', '🍛 Curry'],
  ['a burger', '🍔 Burger'], ['something light and healthy', '🥗 Something light'], ['something sweet', '🍰 Something sweet'],
  ['comfort food', '🫶 Comfort food'], ['a local specialty', '📍 Local specialty'], ['something cheap (under $15)', '💵 Cheap eats'],
];
const cravingSel = new Set();
function renderCravings() {
  $('#cravingChips').innerHTML = CRAVINGS.map(([v, label]) =>
    `<button type="button" class="toggle ${cravingSel.has(v) ? 'on' : ''}" data-v="${escapeHtml(v)}" aria-pressed="${cravingSel.has(v)}">${label}</button>`).join('');
  $('#cravingChips').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    cravingSel.has(b.dataset.v) ? cravingSel.delete(b.dataset.v) : cravingSel.add(b.dataset.v);
    renderCravings();
  }));
}
renderCravings();
$('#cravingForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const typed = $('#cravingInput').value.trim();
  const items = [...cravingSel, ...(typed ? [typed] : [])];
  if (!items.length) { $('#cravingInput').focus(); $('#cravingInput').placeholder = 'Pick a chip or type what you\'re craving…'; return; }
  const msg = `Craving for: ${items.join(', ')}. What should I order, and where?`;
  cravingSel.clear(); renderCravings(); $('#cravingInput').value = '';
  send(msg);
});

// ---------- Upload my food / a menu ----------
const UPLOAD_PROMPTS = {
  dish: "Here's a photo of my food. What is this dish, what's in it, and is it okay for me to eat?",
  menu: "Here's a photo of a menu. Read it and tell me what I should order, based on what I'm craving and what I can't eat.",
};
let uploadKind = 'dish';
document.querySelectorAll('[data-upload]').forEach((b) => b.addEventListener('click', () => { uploadKind = b.dataset.upload; $('#foodInput').click(); }));
$('#foodInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try { pendingImages = [await fileToImage(file)]; } catch { alert(`Couldn't read ${file.name}`); return; }
  renderAttachments();
  send(UPLOAD_PROMPTS[uploadKind]);
});

// Footer link to the governance note in this site's own GitHub repo (works out <user>/<repo> from the github.io address).
{
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  const repo = location.pathname.split('/').filter(Boolean)[0];
  if (m) $('#govLink').href = `https://github.com/${m[1]}/${repo || `${m[1]}.github.io`}/blob/main/GOVERNANCE.md`;
}

// ---------- Layout: chat + map, debug view ----------
const DEBUG = new URLSearchParams(location.search).has('debug') || location.hash === '#debug';
if (DEBUG) { $('#side').hidden = false; document.body.classList.add('debug'); }

function setView(view) {
  document.body.dataset.view = view;
  document.querySelectorAll('#viewSwitch button').forEach((b) => b.classList.toggle('active', b.dataset.show === view));
  if (view === 'map') { $('#mapBadge').hidden = true; refreshMap(); }
}
document.querySelectorAll('#viewSwitch button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.show)));
setView('chat');

// New places found: show a count on the phone's Map tab.
window.addEventListener('globalfoodie:places', (e) => {
  if (document.body.dataset.view !== 'map' && e.detail.count) { $('#mapBadge').textContent = e.detail.count; $('#mapBadge').hidden = false; }
});

// "pin 2" in an answer becomes a button that jumps to that place on the map.
function linkPins(html) {
  return html.replace(/\b([Pp]in)\s+(?:<strong>)?(\d{1,2})(?:<\/strong>)?/g, (_, word, n) => `<button type="button" class="pin-ref" data-pin="${n}" title="Show on the map">📍 ${word} ${n}</button>`);
}
messagesEl.addEventListener('click', (e) => {
  const b = e.target.closest('.pin-ref');
  if (!b) return;
  if (window.matchMedia('(max-width: 860px)').matches) setView('map');
  setTimeout(() => focusPlace(+b.dataset.pin - 1), 60);
});

// Place cards: "Ask about it" asks the agent about that restaurant.
setPlaceActions({
  onAsk: (p) => {
    setView('chat');
    send(`Tell me about ${p.name}${p.cuisine && p.cuisine !== 'unknown' ? ` (${p.cuisine.replace(/;/g, ', ')})` : ''}, ${p.distance_text || ''} away. What should I order there?`);
  },
});

// Footer: clear everything saved in this browser (two clicks, no pop-up).
{
  const btn = $('#clearData');
  let armed = false;
  btn.addEventListener('click', () => {
    if (!armed) { armed = true; btn.textContent = 'Click again to clear'; setTimeout(() => { armed = false; btn.textContent = 'Clear my saved data'; }, 4000); return; }
    mem.clearMemory();
    location.reload();
  });
}

// Footer: when this version was published (GitHub Pages sends the file's last-modified time).
{
  const el = $('#buildInfo');
  if (el && el.textContent.trim() === 'version: local' && location.hostname.endsWith('github.io')) {
    const d = new Date(document.lastModified);
    if (!isNaN(d)) el.textContent = `updated ${d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
  }
}
