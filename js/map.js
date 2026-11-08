// Map card with two views:
//   • Google Maps: an embedded Google map (Embed API if a key is set, otherwise Google's keyless embed)
//   • Pins: our own map with numbered pins for the agent's picks (Leaflet + OpenStreetMap;
//     a simple drawn map in preview mode or if Leaflet can't load)
// Plus a clickable list of the places; clicking one focuses it on the Google map.
import { CONFIG } from './config.js';
import { formatDistance } from './units.js';

let state = { center: null, place: '', places: [], sample: false, view: null, googleQuery: 'restaurants', focus: null };
let lmap = null, pinLayer = null, userMarker = null;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const useLeaflet = () => typeof window.L !== 'undefined' && !state.sample;
const dist = (p) => p.distance_text || formatDistance(p.distance_m);

// ---------- Google Maps embed ----------
function googleEmbedUrl() {
  const { lat, lon } = state.center;
  const key = CONFIG.GOOGLE_MAPS_EMBED_KEY;
  if (state.focus) {
    const p = state.focus;
    const q = `${p.name}${p.address ? ', ' + p.address : ''}`;
    return key
      ? `https://www.google.com/maps/embed/v1/search?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&center=${p.lat},${p.lon}&zoom=17`
      : `https://maps.google.com/maps?q=${encodeURIComponent(`${p.lat},${p.lon} (${p.name})`)}&z=17&output=embed`;
  }
  return key
    ? `https://www.google.com/maps/embed/v1/search?key=${encodeURIComponent(key)}&q=${encodeURIComponent(state.googleQuery)}&center=${lat},${lon}&zoom=15`
    : `https://maps.google.com/maps?q=${encodeURIComponent(`${state.googleQuery} near ${lat},${lon}`)}&ll=${lat},${lon}&z=15&output=embed`;
}

function renderGoogle() {
  const el = $('gmap');
  if (state.sample) {
    el.innerHTML = `<div class="gmap-note"><div><b>Google Maps loads on your live site.</b><br>Previews can't embed other websites, so this tab is blank here. Use the <b>Pins</b> tab, or open the search in Google Maps:<br><a href="https://www.google.com/maps/search/${encodeURIComponent(state.googleQuery)}/@${state.center.lat},${state.center.lon},15z" target="_blank" rel="noopener">Open “${esc(state.googleQuery)}” in Google Maps ↗</a></div></div>`;
    return;
  }
  const src = googleEmbedUrl();
  let frame = el.querySelector('iframe');
  if (!frame) {
    el.innerHTML = '';
    frame = document.createElement('iframe');
    frame.title = 'Google Maps';
    frame.loading = 'lazy';
    frame.referrerPolicy = 'no-referrer-when-downgrade';
    frame.allowFullscreen = true;
    el.appendChild(frame);
  }
  if (frame.src !== src) frame.src = src;
}

// ---------- Public API ----------
export function showLocation({ lat, lon, place, sample = false }) {
  state.center = { lat, lon };
  state.place = place || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  state.sample = sample;
  state.places = [];
  state.focus = null;
  state.googleQuery = 'restaurants';
  $('mapCard').hidden = false;
  $('mapPlace').textContent = `📍 ${state.place}`;
  if (!state.view) setView(sample ? 'pins' : 'google');
  else render(true);
  renderList();
}

export function showRestaurants(list = [], label = 'Nearby restaurants', googleQuery) {
  state.places = list.filter((p) => p.lat != null && p.lon != null).slice(0, 15);
  state.focus = null;
  if (googleQuery) state.googleQuery = googleQuery;
  $('mapCount').textContent = state.places.length ? `${label}: ${state.places.length}` : '';
  render(false);
  renderList();
}

export function refreshMap() { render(false); }

export function setView(view) {
  state.view = view;
  document.querySelectorAll('.map-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $('gmap').hidden = view !== 'google';
  $('map').hidden = view !== 'pins';
  render(false);
}

function focusPlace(i) {
  state.focus = state.places[i];
  document.querySelectorAll('.place-list button').forEach((b, j) => b.classList.toggle('active', j === i));
  if (state.view === 'google') renderGoogle();
  else if (lmap && pinLayer) pinLayer.getLayers()[i]?.openPopup();
}

// ---------- Rendering ----------
function render(recenter) {
  if (!state.center || $('mapBody').hidden) return;
  if (state.view === 'google') renderGoogle();
  else if (useLeaflet()) renderLeaflet(recenter);
  else renderDrawn();
}

function renderList() {
  const el = $('placeList');
  el.innerHTML = state.places.map((p, i) =>
    `<button type="button" data-i="${i}"><span class="n">${i + 1}</span>${esc(p.name)} <span class="muted">· ${esc(dist(p))}</span></button>`).join('');
  el.hidden = !state.places.length;
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => focusPlace(+b.dataset.i)));
}

function popupHtml(p, i) {
  return `<b>${i + 1}. ${esc(p.name)}</b><br>${esc((p.cuisine || '').replace(/;/g, ', '))} · ${esc(dist(p))}${p.walk_min ? ` (${p.walk_min} min walk)` : ''}${p.opening_hours ? `<br>🕒 ${esc(p.opening_hours)}` : ''}<br><a href="${esc(p.maps_url)}" target="_blank" rel="noopener">Open in Google Maps</a>`;
}

function renderLeaflet(recenter) {
  const L = window.L, { lat, lon } = state.center;
  if (!lmap) {
    $('map').innerHTML = '';
    lmap = L.map($('map'), { zoomControl: true, scrollWheelZoom: false }).setView([lat, lon], 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(lmap);
    pinLayer = L.layerGroup().addTo(lmap);
  }
  if (userMarker) userMarker.remove();
  userMarker = L.circleMarker([lat, lon], { radius: 9, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(lmap).bindTooltip('You are here');
  pinLayer.clearLayers();
  state.places.forEach((p, i) => {
    L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'pin', html: `<span>${i + 1}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }) })
      .bindPopup(popupHtml(p, i)).addTo(pinLayer);
  });
  setTimeout(() => {
    lmap.invalidateSize();
    if (state.places.length) lmap.fitBounds(L.latLngBounds([[lat, lon], ...state.places.map((p) => [p.lat, p.lon])]).pad(0.15));
    else if (recenter) lmap.setView([lat, lon], 15);
  }, 50);
}

function renderDrawn() {
  const el = $('map');
  const W = el.clientWidth || 640, H = el.clientHeight || 240;
  const { lat, lon } = state.center;
  const k = Math.cos((lat * Math.PI) / 180) * 111320;
  const pts = state.places.map((p) => ({ ...p, dx: (p.lon - lon) * k, dy: (p.lat - lat) * 110540 }));
  const maxD = Math.max(400, ...pts.map((p) => Math.hypot(p.dx, p.dy))) * 1.25;
  const s = (Math.min(W, H) / 2 - 16) / maxD;
  const cx = W / 2, cy = H / 2;
  const ring = CONFIG.UNITS === 'metric' ? [500, '500 m'] : [402, '¼ mi'];
  let streets = '';
  for (let x = -W; x < W * 2; x += 70) streets += `<line x1="${x}" y1="-20" x2="${x + 60}" y2="${H + 20}" />`;
  for (let y = -10; y < H + 20; y += 55) streets += `<line x1="-20" y1="${y}" x2="${W + 20}" y2="${y + 18}" />`;
  const pins = pts.map((p, i) => {
    const x = cx + p.dx * s, y = cy - p.dy * s;
    return `<a href="${esc(p.maps_url)}" target="_blank" rel="noopener"><g class="dpin" transform="translate(${x.toFixed(1)},${y.toFixed(1)})">
      <title>${esc(p.name)} · ${esc(dist(p))}</title><circle r="11" /><text y="4" text-anchor="middle">${i + 1}</text></g></a>`;
  }).join('');
  const note = state.sample ? 'Sample map · preview mode (the live site shows Google Maps and OpenStreetMap)' : 'Map tiles unavailable: showing a simplified map';
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" role="img" aria-label="Map of your location and nearby restaurants">
    <rect width="${W}" height="${H}" fill="#eef1e6"/>
    <path d="M -10 ${H * 0.78} C ${W * 0.3} ${H * 0.62}, ${W * 0.55} ${H * 0.98}, ${W + 10} ${H * 0.8}" stroke="#bfdbfe" stroke-width="16" fill="none"/>
    <g stroke="#fff" stroke-width="5" opacity=".9">${streets}</g>
    <circle cx="${cx}" cy="${cy}" r="${(ring[0] * s).toFixed(1)}" fill="rgba(37,99,235,.06)" stroke="rgba(37,99,235,.35)" stroke-dasharray="4 4"/>
    ${pins}
    <circle cx="${cx}" cy="${cy}" r="9" fill="#2563eb" stroke="#fff" stroke-width="3"><title>You are here</title></circle>
    <text x="10" y="${H - 10}" class="dnote">${esc(note)}</text>
    <text x="${cx + ring[0] * s + 4}" y="${cy + 4}" class="dnote">${ring[1]}</text>
  </svg>`;
}

// ---------- Wiring ----------
document.querySelectorAll('.map-tabs button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
window.addEventListener('resize', () => { if (state.view === 'pins' && !useLeaflet()) render(false); });
