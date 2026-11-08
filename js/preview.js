// Preview mode: replays sample scenarios without Gemini or any network access.
// Local tools (allergy check, taste matching, dish lookup, memory) run for real;
// location, restaurant search and web search return clearly marked SAMPLE data.
import { TOOL_MAP } from './tools.js';
import { GATED_TOOLS } from './agent.js';
import { loadMemory, setLastLocation } from './memory.js';
import { formatDistance, walkMinutes } from './units.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Real neighborhood centers so typed places work offline in preview mode.
const CITIES = {
  'new york': [40.7265, -73.9815, 'East Village, New York, NY'], nyc: [40.7265, -73.9815, 'East Village, New York, NY'],
  brooklyn: [40.7081, -73.9571, 'Williamsburg, Brooklyn, NY'], chicago: [41.8925, -87.6262, 'River North, Chicago, IL'],
  'los angeles': [34.0617, -118.3000, 'Koreatown, Los Angeles, CA'], la: [34.0617, -118.3000, 'Koreatown, Los Angeles, CA'],
  'san francisco': [37.7599, -122.4148, 'Mission District, San Francisco, CA'], 'san diego': [32.7479, -117.1302, 'North Park, San Diego, CA'],
  'new orleans': [29.9584, -90.0644, 'French Quarter, New Orleans, LA'], austin: [30.2500, -97.7494, 'South Congress, Austin, TX'],
  houston: [29.7499, -95.3584, 'Midtown, Houston, TX'], 'kansas city': [39.0907, -94.5822, 'Crossroads, Kansas City, MO'],
  nashville: [36.1580, -86.7763, 'Lower Broadway, Nashville, TN'], miami: [25.7656, -80.2190, 'Little Havana, Miami, FL'],
  boston: [42.3647, -71.0542, 'North End, Boston, MA'], philadelphia: [39.9496, -75.1503, 'Center City, Philadelphia, PA'],
  washington: [38.9097, -77.0434, 'Dupont Circle, Washington, DC'], dc: [38.9097, -77.0434, 'Dupont Circle, Washington, DC'],
  seattle: [47.6097, -122.3422, 'Pike Place, Seattle, WA'], honolulu: [21.2810, -157.8370, 'Waikiki, Honolulu, HI'],
  'las vegas': [36.1147, -115.1728, 'The Strip, Las Vegas, NV'], denver: [39.7392, -104.9903, 'LoDo, Denver, CO'],
  atlanta: [33.7701, -84.3870, 'Midtown, Atlanta, GA'], portland: [45.5231, -122.6765, 'Downtown Portland, OR'],
  baltimore: [39.2858, -76.6131, 'Inner Harbor, Baltimore, MD'], 'santa fe': [35.6870, -105.9378, 'Plaza, Santa Fe, NM'],
  bangkok: [13.7372, 100.5603, 'Sukhumvit, Bangkok, Thailand'], tokyo: [35.6595, 139.7005, 'Shibuya, Tokyo, Japan'],
  'mexico city': [19.4194, -99.1617, 'Roma Norte, Mexico City, Mexico'], paris: [48.8566, 2.3522, 'Paris, France'],
  london: [51.5136, -0.1365, 'Soho, London, UK'], rome: [41.8986, 12.4769, 'Centro Storico, Rome, Italy'],
};

/** Preview stand-in for geolocation / geocoding. */
export function previewLocate(query) {
  const q = String(query || '').toLowerCase();
  const key = Object.keys(CITIES).sort((a, b) => b.length - a.length).find((c) => new RegExp(`\\b${c}\\b`).test(q));
  const [lat, lon, place] = CITIES[key || 'new york'];
  const loc = { lat, lon, place: `${place} (sample)`, source: 'SAMPLE: preview mode' };
  setLastLocation(loc);
  return { loc, note: key ? null : query ? `"${query}" isn't in the preview's sample list, so I used New York.` : 'Location access isn\'t available in preview, so I used a sample location (New York).' };
}

export function setScenarioLocation(sc) {
  const loc = { lat: sc.lat, lon: sc.lon, place: `${sc.place} (sample)`, source: 'SAMPLE: preview mode' };
  setLastLocation(loc);
  return loc;
}

const OFFSETS = [[0.0016, 0.0013], [0.0033, -0.0028], [-0.0040, 0.0039], [-0.0021, -0.0047], [0.0049, 0.0036], [-0.0057, -0.0012]];
const GENERIC = [['Sample Corner Diner', 'american;diner'], ['Sample Taquería', 'mexican'], ['Sample Noodle Bar', 'asian;noodle'],
  ['Sample Pizza Slice Shop', 'pizza'], ['Sample BBQ Joint', 'barbecue'], ['Sample Café', 'coffee_shop;breakfast']];

/** Sample restaurants placed around the current location. names: [[name, cuisine], ...] */
export function sampleRestaurants(names = GENERIC) {
  const c = loadMemory().last_location || { lat: 40.7265, lon: -73.9815 };
  const k = Math.cos((c.lat * Math.PI) / 180) * 111320;
  const restaurants = names.map(([name, cuisine], i) => {
    const [dLat, dLon] = OFFSETS[i % OFFSETS.length];
    const lat = c.lat + dLat, lon = c.lon + dLon, m = Math.round(Math.hypot(dLat * 110540, dLon * k));
    return { name, cuisine, lat, lon, distance_m: m, distance_text: formatDistance(m), walk_min: walkMinutes(m),
      maps_url: `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(5)},${lon.toFixed(5)}` };
  }).sort((a, b) => a.distance_m - b.distance_m);
  return { note: 'SAMPLE DATA for preview mode. The live site searches OpenStreetMap.', restaurants };
}

const places = (cuisine, names) => ({ tool: 'find_nearby_restaurants', input: { cuisine }, sample: () => sampleRestaurants(names) });
const check = (dish_name, ingredients) => ({ tool: 'check_allergens', input: ingredients ? { dish_name, ingredients } : { dish_name } });

const SCRIPTS = {
  'bangkok-peanut': {
    match: /peanut|noodle|thai|bangkok/i,
    steps: [
      { tool: 'remember', input: { category: 'allergy', value: 'peanut' } },
      { tool: 'recommend_by_taste', input: { liked_flavors: ['savory', 'spicy', 'herby', 'smoky', 'mild'], cuisine_or_country: 'Thailand', dish_type: 'noodles' } },
      check('Pad Thai'), check('Pad See Ew'), check('Pad Kee Mao'), check('Khao Soi'),
      places('thai', [['Sample Noodle House', 'thai;noodle'], ['Sample Northern Thai Kitchen', 'thai'], ['Sample Wok Street Stall', 'thai;street_food']]),
    ],
    answer: `Skip **Pad Thai** ⛔: crushed peanuts are part of the dish, and peanut cross-contact at the wok is common. These noodle dishes are usually made without peanuts:

1. **Pad See Ew** (ผัดซีอิ๊ว): wide rice noodles wok-fried with dark soy sauce, egg and Chinese broccoli. Smoky and savory. 🌶️ 0/5 · ✅ no known peanut conflict
2. **Pad Kee Mao / Drunken Noodles** (ผัดขี้เมา): the same noodles with holy basil, garlic and fresh chilies. 🌶️ 4/5 · ✅ no known peanut conflict. Ask for *phet noi* if you want it milder.
3. **Khao Soi** (ข้าวซอย): Chiang Mai coconut-curry egg-noodle soup with crispy noodles on top. 🌶️ 3/5 · ✅ no known peanut conflict

**Nearby (sample data):** pin **1**, Sample Noodle House, is the closest. It's tagged as a Thai noodle shop, so it likely serves all three.

⚠️ Avoid table-side noodle soups (kuay teow) unless you ask: the condiment tray usually has crushed peanuts.

> **Show this to staff**
> ฉันแพ้ถั่วลิสงรุนแรง กรุณาอย่าใส่ถั่วลิสงหรือน้ำมันถั่วลิสง
> *I have a severe peanut allergy. Please don't use peanuts or peanut oil.*

Recipes vary, so confirm with staff and carry your medication.`,
  },

  'dc-harissa': {
    match: /harissa|cava|new cuisine/i,
    steps: [
      { tool: 'remember', input: { category: 'like', value: 'spicy harissa from Cava' } },
      { tool: 'recommend_by_taste', input: { liked_flavors: ['spicy', 'smoky', 'garlicky', 'chili-paste', 'tangy'], avoid_cuisines: ['Mediterranean', 'Middle Eastern', 'North African'] } },
      { tool: 'lookup_dish', input: { name: 'Chilaquiles Verdes' } },
      places('mexican;caribbean;chicken', [['Sample Taquería', 'mexican'], ['Sample Jerk Shack', 'caribbean'], ['Sample Hot Chicken', 'chicken;american']]),
    ],
    answer: `Harissa's appeal is chili paste plus smoke and garlic. Here are non-Mediterranean dishes with that same kick:

1. **Tacos al Pastor** (Mexican): pork marinated in a dried-chili and achiote paste, which is the closest match to harissa's smoky heat, with pineapple to balance it. 🌶️ 3/5
2. **Chilaquiles Verdes or Green Chile Enchiladas** (Mexican / New Mexican): both are built on a green chile sauce. **Salsa verde** is spicy and tangy like harissa, but brighter and more herby. 🌶️ 3–4/5
3. **Jerk Chicken** (Jamaican): scotch bonnet, allspice and thyme, grilled over wood. The hottest of the three. 🌶️ 5/5

If you want harissa-like heat with something new, try the **salsa verde** dishes. Pin **1**, Sample Taquería, is the closest place for them (sample data), and pin 2 is a jerk spot.

Tell me if you have any allergies and I'll double-check these dishes.`,
  },

  'nola-shellfish': {
    match: /shellfish|shrimp|new orleans|cajun|creole|gumbo/i,
    steps: [
      { tool: 'lookup_dish', input: { name: 'gumbo' } },
      check('Seafood Gumbo'), check('Crawfish Étouffée'), check("Shrimp Po'boy"),
      check('Chicken and Andouille Gumbo'), check('Jambalaya'), check('Red Beans and Rice'),
      places('cajun;creole;american', [['Sample Creole Kitchen', 'creole;cajun'], ['Sample Po-Boy Shop', 'sandwich;seafood'], ['Sample Gumbo House', 'cajun']]),
    ],
    answer: `New Orleans cooking leans heavily on shrimp, crab, crawfish and oysters, so some classics are out. These are your best bets:

1. **Red Beans and Rice**: creamy slow-cooked red beans with smoked sausage, the city's Monday tradition. 🌶️ 2/5 · ✅ no known shellfish conflict
2. **Chicken and Andouille Gumbo**: the Cajun-country gumbo with a dark roux and smoked sausage. 🌶️ 3/5 · ⚠️ ask whether it's made with seafood stock or in the same pot as the seafood gumbo
3. **Jambalaya**: spicy one-pot rice with chicken and andouille. 🌶️ 3/5 · ⚠️ shrimp is often added, so ask for chicken and sausage only

⛔ Skip **seafood gumbo**, **crawfish étouffée** and **shrimp or oyster po'boys**. Po'boy shops often fry everything in the same oil, so even a non-seafood po'boy carries cross-contact risk.

**Nearby (sample data):** pin **1**, Sample Creole Kitchen, is the closest.

> **Show this to staff**
> I have a shellfish allergy (shrimp, crab, crawfish, lobster, oysters and other shellfish). Please make sure my food has no shellfish, no seafood stock, and isn't fried in shared oil.

Recipes vary, so tell your server before you order, and carry your medication.`,
  },

  'austin-celiac': {
    match: /celiac|coeliac|gluten|austin|bbq|barbecue|tex-mex/i,
    steps: [
      check('Texas Brisket'), check('Smoked Turkey'), check('Breakfast Tacos'), check('Beef Fajitas'),
      places('barbecue;mexican;tex-mex', [['Sample BBQ Pit', 'barbecue'], ['Sample Taco Trailer', 'mexican;tex-mex'], ['Sample Tex-Mex Cantina', 'tex-mex']]),
    ],
    answer: `Texas BBQ is one of the easier cuisines for celiac, as long as you skip the bread and ask about sauces.

1. **Texas Brisket**: salt-and-pepper beef smoked for 12+ hours, sold by the pound. 🌶️ 1/5 · ⚠️ ask whether the rub is only salt and pepper, get sauce on the side (some contain wheat or malt), and skip the white bread
2. **Smoked Turkey**: the lean BBQ option. 🌶️ 0/5 · ⚠️ ask the same rub and sauce questions
3. **Breakfast Tacos on corn tortillas**: egg, potato and salsa. 🌶️ 2/5 · ⚠️ flour tortillas are the Texas default, so ask for corn, and ask whether tortillas are warmed on a shared griddle

⛔ **Beef fajitas** come with flour tortillas and often a soy-sauce marinade (regular soy sauce contains wheat). Order them only on corn tortillas, after asking about the marinade.

**Nearby (sample data):** pin **1**, Sample BBQ Pit, and pin **2**, Sample Taco Trailer.

> **Show this to staff**
> I have celiac disease. I can't eat any wheat, barley, rye or malt, even small amounts. Please use clean tongs and a clean surface, and no bread, flour tortillas or regular soy sauce.

Ask whether they have an allergen menu; many Austin spots mark gluten-free items.`,
  },

  'boston-dairy': {
    match: /dairy|lactose|milk|boston|lobster|chowder|new england/i,
    steps: [
      check('New England Clam Chowder'), check('Connecticut Lobster Roll'), check('Maine Lobster Roll'),
      { tool: 'research_web', input: { query: 'Manhattan clam chowder ingredients dairy' }, sample: { query: 'Manhattan clam chowder ingredients dairy', google_search: { answer: 'SAMPLE RESULT (preview mode): Manhattan clam chowder is a tomato-based chowder of clams, tomatoes, potatoes, onion, celery and carrot, often with bacon. Unlike New England chowder, it traditionally has no cream or milk.', sources: [] } } },
      check('Manhattan clam chowder', ['clams', 'tomato', 'potato', 'onion', 'celery', 'carrot', 'bacon']),
      places('seafood', [['Sample Lobster Shack', 'seafood'], ['Sample Oyster Bar', 'seafood;oyster'], ['Sample Harbor Grill', 'seafood;american']]),
    ],
    answer: `Two New England icons, cream chowder and the hot buttered lobster roll, are built on dairy. Here's what works instead:

1. **Maine Lobster Roll**: chilled lobster with a little mayo in a split-top bun. 🌶️ 0/5 · ⚠️ the bun is usually griddled in butter, so ask for it toasted dry or with oil. (Mayo is egg, not dairy.)
2. **Manhattan Clam Chowder**: the tomato-based "red" chowder with clams and vegetables, traditionally made without cream. 🌶️ 1/5 · ⚠️ not every Boston spot makes it, and some finish it with butter, so ask

⛔ Skip **New England clam chowder** (cream and butter) and the **Connecticut-style warm lobster roll** (drenched in melted butter).

**Nearby (sample data):** pin **1**, Sample Lobster Shack, is the closest.

> **Show this to staff**
> I can't have any dairy: no milk, butter, cream or cheese. Please don't toast my bun in butter.`,
  },

  'sd-cilantro': {
    match: /cilantro|coriander|san diego|taco/i,
    steps: [
      check('Baja Fish Tacos'), check('Carne Asada Burrito'), check('Tacos al Pastor'), check('Chilaquiles Verdes'), check('California Burrito'),
      places('mexican', [['Sample Taco Shop', 'mexican'], ['Sample Taquería', 'mexican'], ['Sample Mariscos Truck', 'mexican;seafood']]),
    ],
    answer: `Cilantro isn't one of the standard allergens, but Global Foodie checked every dish against it. It shows up in most Mexican salsas, pico de gallo and guacamole, and as a garnish.

1. **California Burrito**: San Diego's signature, with carne asada, french fries, cheese and sour cream in a flour tortilla. 🌶️ 1/5 · ✅ no cilantro in the standard recipe. Ask for **no guacamole or pico de gallo**, which usually contain it.

⛔ As usually served, these contain cilantro: **fish tacos** (pico), **carne asada burritos** (guac and pico), **tacos al pastor** (cilantro and onion on top) and **chilaquiles verdes** (in the salsa verde). Most taco shops can make tacos without the garnish if you ask, but the salsas are pre-made.

Because cilantro isn't a common allergy, staff may think you just dislike it. Say clearly that it's an allergy.

**Nearby (sample data):** pin **1**, Sample Taco Shop.

> **Show this to staff**
> I'm allergic to cilantro. Please don't add any cilantro, pico de gallo, guacamole or salsa that contains it.
> *Soy alérgico/a al cilantro. Por favor, sin cilantro, sin pico de gallo, sin guacamole y sin salsa que lo contenga.*`,
  },

  'kc-alphagal': {
    match: /alpha|red meat|kansas city|burnt ends/i,
    steps: [
      check('Kansas City Burnt Ends'), check('Texas Brisket'), check('Smoked Turkey'), check('Buffalo Wings'), check('Nashville Hot Chicken'),
      places('barbecue;chicken;wings', [['Sample Smokehouse', 'barbecue'], ['Sample BBQ Joint', 'barbecue'], ['Sample Wing Bar', 'wings;american']]),
    ],
    answer: `You can still eat well at Kansas City BBQ. Stick to poultry, and ask about fats and sides.

1. **Smoked Turkey**: turkey breast smoked low and slow. 🌶️ 0/5 · ✅ no red meat. Ask whether it's basted with butter if dairy also bothers you.
2. **Buffalo Wings**: chicken wings in cayenne-butter hot sauce. 🌶️ 3/5 · ✅ no red meat · contains dairy (butter, blue cheese). Ask whether the fryer uses beef tallow.
3. **Nashville Hot Chicken**: fried chicken with a fiery cayenne paste. 🌶️ 5/5 · ⚠️ the paste is traditionally made with lard, so ask which fat they use

⛔ Skip **burnt ends**, **brisket**, ribs and sausage. Be careful with sides too: baked beans often contain burnt ends or pork, and greens are often cooked with ham hock.

**Nearby (sample data):** pin **1**, Sample Smokehouse.

> **Show this to staff**
> I have alpha-gal syndrome, an allergy to mammal meat. I can't eat beef, pork, lamb, lard, beef tallow or gelatin. Chicken, turkey and fish are fine.`,
  },

  'nyc-firsttime': {
    match: /new york|nyc|japan|first time|bagel|pizza/i,
    steps: [
      { tool: 'remember', input: { category: 'spice_tolerance', value: 'mild' } },
      { tool: 'recommend_by_taste', input: { liked_flavors: ['savory', 'mild', 'rich', 'fresh'], cuisine_or_country: 'New York', max_spice: 1 } },
      { tool: 'lookup_dish', input: { name: 'Bagel with Lox' } },
      places('pizza;bagel;deli', [['Sample Pizza Slice Shop', 'pizza'], ['Sample Bagel Bakery', 'bagel;breakfast'], ['Sample Jewish Deli', 'deli;sandwich']]),
    ],
    answer: `Welcome to New York! Three classics, all mild:

1. **New York-Style Pizza**: big, thin, foldable slices. At a counter, ask for **"a plain slice"** (cheese only). Fold it in half lengthwise to eat it. 🌶️ 0/5
2. **Bagel with Lox**: a chewy bagel with cream cheese ("schmear"), smoked salmon, capers and red onion, a classic NYC breakfast. 🌶️ 0/5
3. **Pastrami on Rye**: peppery smoked beef piled high at a Jewish deli. One sandwich is big enough to share. 🌶️ 1/5 (the mustard has a little kick)

**Nearby (sample data):** pins **1–3** are a slice shop, a bagel bakery and a deli.

**Good to know in the U.S.:**
- At sit-down restaurants, tip **18–20%** of the bill. At counters, a tip is optional.
- Menu prices usually don't include sales tax (about 8.9% in New York City).
- Portions are large, so sharing is normal.`,
  },
};

const FALLBACK = `**Preview mode.** This preview replays eight sample scenarios. Pick one under **"Or try a sample scenario,"** or type a message that mentions one (for example *shellfish*, *celiac*, *cilantro* or *alpha-gal*).

Once you deploy the site with your Gemini proxy, the agent answers anything, including menu photos.`;

export async function runPreview({ userText, images = [], scenarioId, hooks = {} }) {
  const script = images.length ? null
    : SCRIPTS[scenarioId] || Object.values(SCRIPTS).find((s) => s.match.test(userText || ''));
  await wait(500);
  if (!script) { hooks.onText?.(FALLBACK, true); return FALLBACK; }
  let i = 0;
  for (const step of script.steps) {
    const call = { id: `preview_${Date.now()}_${i}`, name: step.tool, input: step.input };
    hooks.onToolStart?.(call, ++i);
    await wait(380);
    let content, isError = false;
    if (GATED_TOOLS[step.tool]) {
      const ok = hooks.confirm ? await hooks.confirm(call, GATED_TOOLS[step.tool]) : false;
      if (!ok) { hooks.onToolEnd?.(call, JSON.stringify({ denied: true, message: 'The traveler declined this action.' }), false); continue; }
    }
    try { content = JSON.stringify(step.sample ? (typeof step.sample === 'function' ? step.sample() : step.sample) : await TOOL_MAP[step.tool].run(step.input, {})); }
    catch (e) { content = JSON.stringify({ error: e.message }); isError = true; }
    hooks.onToolEnd?.(call, content, isError);
  }
  await wait(350);
  hooks.onText?.(script.answer, true);
  return script.answer;
}
