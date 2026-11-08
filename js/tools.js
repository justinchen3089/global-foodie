// Tools the agent can call. Each tool: { name, description, parameters (JSON Schema), run(args, ctx) }.
import { DISHES, FLAVOR_TAGS, findDish, findDishScored } from './data/dishes.js';
import { checkRestrictions, normalizeRestrictions } from './data/allergens.js';
import * as mem from './memory.js';
import { formatDistance, walkMinutes } from './units.js';

const UA_LANG = 'en';

async function getJSON(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { Accept: 'application/json', ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`${new URL(url).host} returned HTTP ${res.status}`);
  return res.json();
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

function summarizePlace(j) {
  const a = j.address || {};
  return {
    place: j.display_name,
    neighborhood: a.suburb || a.neighbourhood || a.quarter || null,
    city: a.city || a.town || a.village || a.municipality || a.county || null,
    country: a.country || null,
    country_code: (a.country_code || '').toUpperCase() || null,
  };
}

async function reverseGeocode(lat, lon) {
  const j = await getJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1&accept-language=${UA_LANG}`);
  return summarizePlace(j);
}

function userRestrictions(extra) {
  const m = mem.loadMemory();
  const list = extra && extra.length ? extra : [...m.allergies, ...m.diet];
  return normalizeRestrictions(list);
}

function dishSummary(dish) {
  return {
    name: dish.name, local_name: dish.local || null, cuisine: dish.cuisine, country: dish.country,
    description: dish.desc, typical_ingredients: dish.ingredients, spice_level_0_to_5: dish.spice,
    flavors: dish.flavors, diet: dish.diet, tip: dish.tip || null,
  };
}

// ---------------------------------------------------------------------------

export const TOOLS = [
  {
    name: 'get_current_location',
    description: 'Get the traveler\'s current GPS location from their device (browser geolocation) and reverse-geocode it to a neighborhood/city/country. Use when the user says "near me", "where I am", or asks you to locate them. The browser will ask the user for permission.',
    parameters: { type: 'object', properties: {} },
    async run() {
      if (!('geolocation' in navigator)) throw new Error('Geolocation not supported. Ask the user to type their city or neighborhood.');
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve,
          (e) => reject(new Error(`Geolocation failed (${e.message || 'permission denied'}). Ask the user to type their city, neighborhood or hotel address.`)),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 300000 }));
      const { latitude: lat, longitude: lon, accuracy } = pos.coords;
      let place = {};
      try { place = await reverseGeocode(lat, lon); } catch { /* coordinates are still useful */ }
      const loc = { lat: +lat.toFixed(5), lon: +lon.toFixed(5), accuracy_m: Math.round(accuracy), ...place, source: 'device geolocation' };
      mem.setLastLocation(loc);
      return loc;
    },
  },
  {
    name: 'geocode_location',
    description: 'Convert a place the user typed (city, neighborhood, landmark, hotel, address) into coordinates. Use before find_nearby_restaurants when the user tells you where they are.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'e.g. "Sukhumvit, Bangkok" or "Old Quarter Hanoi"' } }, required: ['query'] },
    async run({ query }) {
      const j = await getJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=${UA_LANG}&q=${encodeURIComponent(query)}`);
      if (!j.length) return { found: false, message: `No match for "${query}". Ask the user for a more specific place.` };
      const loc = { lat: +(+j[0].lat).toFixed(5), lon: +(+j[0].lon).toFixed(5), ...summarizePlace(j[0]), source: `typed: ${query}` };
      mem.setLastLocation(loc);
      return { found: true, ...loc };
    },
  },
  {
    name: 'find_nearby_restaurants',
    description: 'Find restaurants near a coordinate using OpenStreetMap. Optionally filter by cuisine keywords (e.g. "thai;noodle", "mexican", "korean"). Results include distance, opening hours, diet tags and a map link. OSM has no menus, so describe places as "likely serves" a dish based on cuisine. If lat/lon are omitted, the last known location is used.',
    parameters: {
      type: 'object',
      properties: {
        lat: { type: 'number' }, lon: { type: 'number' },
        cuisine: { type: 'string', description: 'Semicolon-separated cuisine/name keywords, e.g. "noodle;thai"' },
        radius_m: { type: 'number', description: 'Search radius in meters (default 1200, max 5000)' },
        limit: { type: 'number', description: 'Max results (default 8)' },
      },
    },
    async run({ lat, lon, cuisine, radius_m = 1200, limit = 8 }) {
      if (lat == null || lon == null) {
        const last = mem.loadMemory().last_location;
        if (!last) throw new Error('No location known. Call get_current_location or geocode_location first.');
        ({ lat, lon } = last);
      }
      const r = Math.min(Math.max(+radius_m || 1200, 200), 5000);
      const q = `[out:json][timeout:25];(node["amenity"~"^(restaurant|fast_food|food_court|cafe)$"](around:${r},${lat},${lon});way["amenity"~"^(restaurant|fast_food|food_court)$"](around:${r},${lat},${lon}););out center tags 200;`;
      const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
      let data, lastErr;
      for (const ep of endpoints) {
        try {
          const res = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
          if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
          data = await res.json(); break;
        } catch (e) { lastErr = e; }
      }
      if (!data) throw new Error(`Restaurant search failed: ${lastErr?.message}. Try again or suggest the user search a map app.`);

      const all = data.elements.filter((e) => e.tags?.name).map((e) => {
        const t = e.tags, la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon;
        const diet = Object.fromEntries(Object.entries(t).filter(([k]) => k.startsWith('diet:')).map(([k, v]) => [k.slice(5), v]));
        return {
          name: t.name, name_en: t['name:en'] || null, type: t.amenity, cuisine: t.cuisine || 'unknown',
          distance_m: haversine(lat, lon, la, lo), lat: la, lon: lo,
          distance_text: formatDistance(haversine(lat, lon, la, lo)), walk_min: walkMinutes(haversine(lat, lon, la, lo)),
          address: [t['addr:housenumber'], t['addr:street'], t['addr:city']].filter(Boolean).join(' ') || null,
          opening_hours: t.opening_hours || null, website: t.website || t['contact:website'] || null,
          diet_tags: Object.keys(diet).length ? diet : null,
          maps_url: `https://www.google.com/maps/search/?api=1&query=${la},${lo}`,
        };
      }).sort((a, b) => a.distance_m - b.distance_m);

      let matches = all;
      if (cuisine) {
        const kws = cuisine.toLowerCase().split(/[;,|]/).map((s) => s.trim()).filter(Boolean);
        matches = all.filter((p) => kws.some((k) => p.cuisine.toLowerCase().includes(k) || `${p.name} ${p.name_en || ''}`.toLowerCase().includes(k)));
      }
      const out = matches.slice(0, Math.min(+limit || 8, 15));
      return {
        center: { lat, lon }, radius_m: r, cuisine_filter: cuisine || null,
        total_places_in_radius: all.length, matching: matches.length, restaurants: out,
        other_nearby: matches.length < 3 ? all.filter((p) => !out.includes(p)).slice(0, 5) : undefined,
        note: 'Source: OpenStreetMap contributors. No menus — infer likely dishes from cuisine and confirm on arrival.',
      };
    },
  },
  {
    name: 'lookup_dish',
    description: 'Look up a dish in Global Foodie\'s built-in dish database: description, typical ingredients, spice level (0–5), flavor profile and ordering tips. Returns found:false if unknown — then use research_web.',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    async run({ name }) {
      const dish = findDish(name);
      if (!dish) return { found: false, message: `"${name}" is not in the local database. Use research_web to learn about it.` };
      return { found: true, ...dishSummary(dish) };
    },
  },
  {
    name: 'recommend_by_taste',
    description: `Suggest dishes from the database that match flavors the traveler likes, while excluding dishes that conflict with their allergies/diet (taken from memory unless given). Translate what the user says into flavor tags first (e.g. "spicy harissa" → spicy, smoky, garlicky, chili-paste). Allowed tags: ${FLAVOR_TAGS.join(', ')}.`,
    parameters: {
      type: 'object',
      properties: {
        liked_flavors: { type: 'array', items: { type: 'string', enum: FLAVOR_TAGS } },
        cuisine_or_country: { type: 'string', description: 'Prefer this cuisine/country/region (e.g. "Thai", "Thailand", "Mexican"). Optional.' },
        avoid_cuisines: { type: 'array', items: { type: 'string' }, description: 'Cuisines/regions to skip, e.g. ["Mediterranean", "Middle Eastern"]' },
        dish_type: { type: 'string', description: 'Optional: noodles, soup, rice, curry, tacos, street food…' },
        max_spice: { type: 'number', description: '0–5' },
        restrictions: { type: 'array', items: { type: 'string' }, description: 'Override allergies/diet; defaults to memory.' },
        limit: { type: 'number' },
      },
      required: ['liked_flavors'],
    },
    async run({ liked_flavors = [], cuisine_or_country, avoid_cuisines = [], dish_type, max_spice, restrictions, limit = 6 }) {
      const rs = userRestrictions(restrictions);
      const tagsOf = (dish) => [dish.cuisine, dish.country, ...dish.groups].join(' ').toLowerCase();
      const avoid = avoid_cuisines.map((s) => s.toLowerCase());
      let pool = DISHES.filter((dish) => !avoid.some((a) => tagsOf(dish).includes(a)));
      if (max_spice != null) pool = pool.filter((dish) => dish.spice <= max_spice);
      const filterBy = (p, key) => {
        if (!key) return p;
        const k = key.toLowerCase(); const f = p.filter((dish) => tagsOf(dish).includes(k) || dish.name.toLowerCase().includes(k));
        return f.length ? f : p;
      };
      pool = filterBy(filterBy(pool, cuisine_or_country), dish_type);
      const excluded = [];
      const scored = pool.map((dish) => {
        const checks = checkRestrictions({ dish, restrictions: rs });
        const conflicts = checks.filter((c) => c.status === 'contains');
        const cautions = checks.filter((c) => c.status === 'possible');
        const matched = dish.flavors.filter((f) => liked_flavors.includes(f));
        return { dish, conflicts, cautions, matched, score: matched.length * 2 - cautions.length * 0.5 };
      }).filter((x) => {
        if (x.conflicts.length) { excluded.push(`${x.dish.name} (${x.conflicts.map((c) => c.label).join(', ')})`); return false; }
        return x.matched.length > 0;
      }).sort((a, b) => b.score - a.score || b.dish.spice - a.dish.spice);

      return {
        restrictions_applied: rs.map((r) => r.label),
        recommendations: scored.slice(0, limit).map((x) => ({
          ...dishSummary(x.dish), matched_flavors: x.matched,
          allergen_verdict: x.cautions.length ? 'ask_staff_first' : 'no_known_conflict',
          cautions: x.cautions.map((c) => `${c.label}: ${c.evidence.join('; ')}`),
        })),
        excluded_for_restrictions: excluded.slice(0, 12),
        note: 'Database recommendations are a starting point; you may also suggest local dishes you know of — run check_allergens on them.',
      };
    },
  },
  {
    name: 'check_allergens',
    description: 'Cross-check a dish against the traveler\'s allergies and dietary restrictions using the allergy database. ALWAYS call this before recommending a dish. If the dish is not in the database, pass the ingredients you found via research_web or read from the menu. Returns per-restriction status (contains / possible / not_detected), hidden sources to ask about, and a verdict: avoid | ask_staff_first | no_known_conflict | unknown.',
    parameters: {
      type: 'object',
      properties: {
        dish_name: { type: 'string' },
        ingredients: { type: 'array', items: { type: 'string' }, description: 'Known/likely ingredients (optional if dish is in the database)' },
        restrictions: { type: 'array', items: { type: 'string' }, description: 'Override; defaults to the allergies + diet in memory' },
      },
      required: ['dish_name'],
    },
    async run({ dish_name, ingredients = [], restrictions }) {
      const rs = userRestrictions(restrictions);
      if (!rs.length) {
        const status = mem.loadMemory().restrictions_status;
        const dish = findDish(dish_name);
        return {
          dish: dish_name, verdict: status === 'none' ? 'no_restrictions' : 'no_restrictions_on_file',
          major_allergens_in_typical_recipe: (dish?.allergens || []).map((a) => a),
          message: status === 'none'
            ? 'The traveler said they have no allergies or restrictions. Recommend freely; no allergy warnings needed.'
            : 'No allergies on file (the traveler skipped or has not said). Do not block: recommend normally and just list the major allergens briefly.',
        };
      }
      const match = findDishScored(dish_name);
      // If the agent supplied ingredients and the name only loosely matches a database dish
      // (e.g. "Manhattan clam chowder" vs "New England Clam Chowder"), trust the ingredients.
      const dish = ingredients.length && match.score < 1 ? null : match.dish;
      if (!dish && !ingredients.length) {
        return { dish: dish_name, found_in_database: false, verdict: 'unknown', message: 'Dish not in database and no ingredients given. Research its typical ingredients with research_web, then call check_allergens again with them.' };
      }
      const results = checkRestrictions({ dish, ingredients, restrictions: rs });
      const verdict = results.some((r) => r.status === 'contains') ? 'avoid'
        : results.some((r) => r.status === 'possible') || !dish ? 'ask_staff_first' : 'no_known_conflict';
      return {
        dish: dish_name, matched_database_dish: dish?.name || null, found_in_database: !!dish,
        closest_database_dish: !dish && match.dish ? match.dish.name : undefined,
        ingredients_considered: [...(dish?.ingredients || []), ...ingredients],
        results, verdict,
        advice: verdict === 'avoid' ? 'Do not recommend this dish; suggest a safer alternative.'
          : verdict === 'ask_staff_first' ? 'Recommend only with a clear "confirm with staff" note and mention the specific ingredients to ask about.'
            : 'No known conflict in the typical recipe. Recipes vary and cross-contact is possible — advise confirming with staff.',
      };
    },
  },
  {
    name: 'research_web',
    description: 'Research an unfamiliar dish, ingredient, menu term, food culture or restaurant. Runs a Google Search (via Gemini grounding) and a Wikipedia lookup in parallel. Returns an answer with source links and, when available, a photo URL you can show as a markdown image. Cite sources as links in your answer.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    async run({ query }, ctx) {
      const out = { query };
      const tasks = [];
      tasks.push((async () => {
        const s = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`);
        const hits = s.query?.search || [];
        if (!hits.length) { out.wikipedia = null; return; }
        const sum = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hits[0].title.replace(/ /g, '_'))}`);
        out.wikipedia = {
          title: sum.title, summary: sum.extract, url: sum.content_urls?.desktop?.page,
          image: sum.thumbnail?.source || null,
          other_results: hits.slice(1).map((h) => h.title),
        };
      })().catch((e) => { out.wikipedia_error = e.message; }));
      if (ctx.settings?.proxyUrl) {
        tasks.push((async () => {
          const res = await fetch(`${ctx.settings.proxyUrl.replace(/\/+$/, '')}/search`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
          });
          const g = await res.json();
          if (!res.ok) throw new Error(g.error || `HTTP ${res.status}`);
          out.google_search = { answer: g.answer, sources: g.sources, queries: g.search_queries };
          if (g.search_suggestions_html) out._display = { searchSuggestionsHtml: g.search_suggestions_html };
        })().catch((e) => { out.google_search_error = e.message; }));
      }
      await Promise.all(tasks);
      return out;
    },
  },
  {
    name: 'remember',
    description: 'Save something about the traveler to long-term memory so future sessions know it. Use immediately when they state an allergy, diet, a liked/disliked food or flavor, spice tolerance, or another useful preference.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: mem.CATEGORIES },
        value: { type: 'string', description: 'e.g. "peanut", "vegetarian", "spicy harissa from Cava", "cilantro", "medium (3/5)"' },
      },
      required: ['category', 'value'],
    },
    async run({ category, value }) { mem.remember(category, value); return { saved: true, category, value }; },
  },
  {
    name: 'forget',
    description: 'Remove an item from memory when the user says it no longer applies.',
    parameters: { type: 'object', properties: { category: { type: 'string', enum: [...mem.CATEGORIES, 'history'] }, value: { type: 'string' } }, required: ['category'] },
    async run({ category, value }) { mem.forget(category, value); return { removed: true, category, value }; },
  },
  {
    name: 'log_choice',
    description: 'Record what the traveler decided to order (and later how they liked it) so future recommendations can learn from it.',
    parameters: {
      type: 'object',
      properties: {
        dish: { type: 'string' }, restaurant: { type: 'string' }, location: { type: 'string' },
        rating: { type: 'number', description: '1–5 if the user gave feedback' }, notes: { type: 'string' },
      },
      required: ['dish'],
    },
    async run(entry) { mem.logChoice(entry); return { logged: true, ...entry }; },
  },
  {
    name: 'get_memory',
    description: 'Read the full traveler profile and history of past choices.',
    parameters: { type: 'object', properties: {} },
    async run() { return mem.loadMemory(); },
  },
];

export const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

export const TOOL_LABELS = {
  get_current_location: '📍 Locating you',
  geocode_location: '🗺️ Finding that place',
  find_nearby_restaurants: '🍽️ Searching nearby restaurants',
  lookup_dish: '📖 Looking up dish',
  recommend_by_taste: '👅 Matching your taste',
  check_allergens: '🛡️ Checking allergens',
  research_web: '🔎 Researching',
  remember: '🧠 Saving to memory',
  forget: '🧹 Updating memory',
  log_choice: '📝 Logging your choice',
  get_memory: '🧠 Reading memory',
  scenario: '🧳 Loading sample traveler',
};
