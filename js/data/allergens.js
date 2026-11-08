// Allergy & dietary-restriction database.
// Each restriction has keyword triggers (matched against ingredient text),
// phrases to strip first (to avoid false positives like "coconut milk" → dairy),
// "implies" (dish allergen ids that violate this restriction), and hidden sources
// a traveler might not expect.

export const RESTRICTIONS = {
  peanut: {
    label: 'Peanut',
    keywords: ['peanut', 'groundnut', 'satay sauce', 'peanut sauce', 'peanut oil', 'arachis', 'cacahuete', 'cacahuate', 'maní', 'arachide', 'ถั่วลิสง'],
    exclude: [],
    hidden: 'Satay/peanut sauces, massaman curry, som tam, pad thai garnish, Thai noodle-soup condiment trays, kung pao, mole, dan dan toppings, West African groundnut stew, chili crisp, some frying oils.',
  },
  tree_nut: {
    label: 'Tree nuts',
    keywords: ['almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'brazil nut', 'pine nut', 'chestnut', 'praline', 'marzipan', 'frangipane', 'nuts', 'nut paste', 'pesto', 'baklava'],
    exclude: ['water chestnut', 'nutmeg', 'coconut', 'butternut', 'doughnut', 'donut'],
    hidden: 'Indian curry bases (cashew/almond paste), biryani garnish, pesto, mole, baklava and many desserts, some Thai curries (cashew).',
  },
  milk: {
    label: 'Milk / dairy',
    keywords: ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'ghee', 'paneer', 'whey', 'casein', 'curd', 'crema', 'queso', 'kefir', 'labneh', 'feta', 'parmesan', 'pecorino', 'mozzarella', 'béchamel', 'bechamel', 'niter kibbeh', 'evaporated milk', 'condensed milk', 'raita', 'lassi', 'buttermilk', 'provolone', 'cheez whiz', 'cheddar', 'swiss cheese'],
    exclude: ['coconut milk', 'coconut cream', 'soy milk', 'almond milk', 'oat milk', 'rice milk', 'peanut butter', 'nut butter', 'cocoa butter', 'bean curd', 'cream of tartar'],
    hidden: 'Ghee in Indian cooking, butter finishing sauces, creamy tom yum (evaporated milk), Thai tea, crema on Mexican dishes.',
  },
  egg: {
    label: 'Egg',
    keywords: ['egg', 'mayonnaise', 'mayo', 'aioli', 'meringue', 'custard', 'tamago', 'egg noodle', 'albumen'],
    exclude: [],
    hidden: 'Egg noodles (ramen, wonton, khao soi), batters, mayo-based sauces, fried rice, glazes on breads.',
  },
  gluten: {
    label: 'Gluten / wheat',
    keywords: ['wheat', 'flour', 'bread', 'baguette', 'pita', 'naan', 'soy sauce', 'seitan', 'barley', 'rye', 'semolina', 'couscous', 'bulgur', 'udon', 'ramen', 'soba', 'tempura', 'panko', 'breadcrumbs', 'pasta', 'spaghetti', 'flour tortilla', 'beer', 'malt', 'egg noodle', 'wheat noodle', 'dumpling wrapper', 'hoisin', 'oyster sauce', 'doubanjiang', 'gochujang', 'roux', 'batter', 'bun', 'hoagie', 'biscuit', 'crouton', 'cracker', 'sourdough', 'french bread'],
    exclude: ['rice flour', 'corn flour', 'cornflour', 'tapioca flour', 'chickpea flour', 'gram flour', 'tamari', 'corn tortilla', 'buckwheat', 'rice noodle', 'glass noodle'],
    hidden: 'Soy sauce (contains wheat), oyster/hoisin sauce, batters, thickened gravies, beer marinades, soba (often blended with wheat), shared fryers.',
  },
  soy: {
    label: 'Soy',
    keywords: ['soy', 'soya', 'tofu', 'edamame', 'miso', 'soy sauce', 'tempeh', 'natto', 'doenjang', 'gochujang', 'doubanjiang', 'tao jiao', 'bean curd', 'kecap manis', 'tamari', 'hoisin'],
    exclude: [],
    hidden: 'Almost all East/Southeast Asian sauces (soy sauce, oyster sauce, hoisin, kecap manis), chili pastes, soybean oil.',
  },
  fish: {
    label: 'Fish',
    keywords: ['fish', 'anchovy', 'fish sauce', 'nam pla', 'nuoc mam', 'nước mắm', 'bonito', 'katsuobushi', 'dashi', 'tuna', 'salmon', 'cod', 'mackerel', 'sardine', 'worcestershire', 'fish ball', 'fish cake', 'jeotgal'],
    exclude: ['fish sauce-free'],
    hidden: 'Fish sauce in nearly all Thai/Vietnamese dishes, dashi in Japanese soups/sauces, anchovy in kimchi and Caesar dressing, Worcestershire sauce.',
  },
  crustacean: {
    label: 'Shellfish (crustaceans)',
    keywords: ['shrimp', 'prawn', 'crab', 'lobster', 'crayfish', 'crawfish', 'langoustine', 'shrimp paste', 'kapi', 'belacan', 'terasi', 'dried shrimp', 'salted shrimp', 'saeujeot'],
    exclude: [],
    hidden: 'Shrimp paste in Thai/Malay curry pastes and sambal, dried shrimp in som tam and XO sauce, salted shrimp in kimchi.',
  },
  mollusc: {
    label: 'Molluscs',
    keywords: ['squid', 'octopus', 'clam', 'mussel', 'oyster', 'scallop', 'oyster sauce', 'cuttlefish', 'snail', 'escargot', 'abalone', 'calamari'],
    exclude: [],
    hidden: 'Oyster sauce in Chinese and Thai stir-fries.',
  },
  sesame: {
    label: 'Sesame',
    keywords: ['sesame', 'tahini', 'gomasio', 'za\'atar', 'zaatar', 'halva', 'benne'],
    exclude: [],
    hidden: 'Sesame oil in Korean/Chinese dishes, tahini in Middle Eastern sauces, buns topped with seeds, za\'atar.',
  },
  mustard: {
    label: 'Mustard',
    keywords: ['mustard seed', 'mustard oil', 'dijon', 'mustard sauce', 'mustard'],
    exclude: ['mustard greens', 'pickled mustard'],
    hidden: 'Indian tempering (mustard seeds/oil), dressings, marinades.',
  },
  celery: {
    label: 'Celery',
    keywords: ['celery', 'celeriac'],
    exclude: [],
    hidden: 'Stocks, soups and spice blends (especially in Europe).',
  },
  sulphites: {
    label: 'Sulphites',
    keywords: ['wine', 'sulphite', 'sulfite', 'dried fruit', 'vinegar'],
    exclude: [],
    hidden: 'Wine-based sauces, dried fruit, some pickles.',
  },
  pork: {
    label: 'Pork',
    keywords: ['pork', 'bacon', 'ham', 'lard', 'chorizo', 'pancetta', 'guanciale', 'prosciutto', 'char siu', 'chashu', 'tonkotsu', 'carnitas', 'al pastor', 'sausage'],
    exclude: [],
    hidden: 'Lard in pastries/refried beans, pork broth in noodle soups, minced pork in tofu dishes.',
  },
  beef: {
    label: 'Beef',
    keywords: ['beef', 'veal', 'brisket', 'oxtail', 'bulgogi', 'steak', 'ribeye', 'carne asada', 'pastrami', 'burnt ends', 'short ribs'],
    exclude: ['tuna steak', 'salmon steak', 'swordfish steak', 'cauliflower steak', 'tofu steak'],
    hidden: 'Beef broth in pho and noodle soups, stock cubes.',
  },
  alcohol: {
    label: 'Alcohol',
    keywords: ['wine', 'beer', 'sake', 'mirin', 'rum', 'brandy', 'shaoxing', 'cooking wine', 'liqueur', 'vodka', 'tequila'],
    exclude: [],
    hidden: 'Mirin and sake in Japanese sauces, Shaoxing wine in Chinese cooking, wine reductions.',
  },
  corn: {
    label: 'Corn',
    keywords: ['corn', 'cornmeal', 'cornstarch', 'corn starch', 'corn tortilla', 'masa', 'hominy', 'polenta', 'grits', 'corn syrup', 'cornbread', 'tortilla chips', 'popcorn', 'maize', 'elote'],
    exclude: [],
    hidden: 'Corn tortillas and chips, cornstarch-thickened sauces and batters, corn syrup in BBQ sauces and sodas, corn oil in fryers.',
  },
  coconut: {
    label: 'Coconut',
    keywords: ['coconut', 'coconut milk', 'coconut cream', 'coconut oil', 'kerisik', 'copra'],
    exclude: [],
    hidden: 'Thai, Indian and Caribbean curries, desserts, some vegan cheeses and frying oils.',
  },
  alpha_gal: {
    label: 'Red meat (alpha-gal)',
    keywords: ['beef', 'pork', 'lamb', 'mutton', 'venison', 'veal', 'bison', 'goat', 'bacon', 'ham', 'sausage', 'lard', 'tallow', 'gelatin', 'brisket', 'burnt ends', 'pastrami', 'chorizo', 'andouille', 'pepperoni', 'salami', 'hot dog', 'ribs', 'carne asada', 'carnitas', 'al pastor', 'ribeye', 'steak', 'oxtail'],
    exclude: ['tuna steak', 'salmon steak', 'swordfish steak', 'cauliflower steak', 'tofu steak'],
    implies: ['beef', 'pork'],
    hidden: 'Lard or beef tallow in fryers and pastry, gelatin, pork in baked beans and greens (ham hock), beef stock. Some people with alpha-gal also react to dairy.',
  },
  pescatarian: {
    label: 'Pescatarian',
    keywords: ['chicken', 'pork', 'beef', 'lamb', 'mutton', 'goat', 'duck', 'turkey', 'meat', 'bacon', 'ham', 'gelatin', 'lard', 'sausage', 'chorizo', 'andouille', 'brisket', 'pastrami', 'veal', 'blood', 'steak'],
    exclude: [],
    implies: ['pork', 'beef'],
    hidden: 'Meat stocks, lard and bacon fat used in "vegetable" sides.',
  },
  vegetarian: {
    label: 'Vegetarian',
    keywords: ['chicken', 'pork', 'beef', 'lamb', 'mutton', 'goat', 'duck', 'meat', 'fish', 'shrimp', 'prawn', 'bacon', 'ham', 'gelatin', 'lard', 'anchovy', 'fish sauce', 'oyster sauce', 'shrimp paste', 'bonito', 'dashi', 'sausage', 'chorizo', 'guanciale', 'blood', 'veal'],
    exclude: [],
    implies: ['fish', 'crustacean', 'mollusc', 'pork', 'beef'],
    hidden: 'Fish sauce, shrimp paste, dashi, meat stocks and lard are common even in "vegetable" dishes.',
  },
  vegan: {
    label: 'Vegan',
    keywords: ['chicken', 'pork', 'beef', 'lamb', 'mutton', 'goat', 'duck', 'meat', 'fish', 'shrimp', 'prawn', 'bacon', 'ham', 'gelatin', 'lard', 'anchovy', 'fish sauce', 'oyster sauce', 'shrimp paste', 'bonito', 'dashi', 'sausage', 'blood', 'egg', 'milk', 'cheese', 'butter', 'cream', 'yogurt', 'ghee', 'paneer', 'honey', 'crema', 'queso'],
    exclude: ['coconut milk', 'coconut cream', 'soy milk', 'peanut butter', 'bean curd'],
    implies: ['fish', 'crustacean', 'mollusc', 'pork', 'beef', 'milk', 'egg'],
    hidden: 'Fish sauce, ghee, egg washes, honey glazes, butter finishes.',
  },
};

// Map free-text user input to restriction ids.
const ALIASES = {
  nut: ['peanut', 'tree_nut'], nuts: ['peanut', 'tree_nut'],
  'tree nut': ['tree_nut'], 'tree nuts': ['tree_nut'], almond: ['tree_nut'], cashew: ['tree_nut'],
  dairy: ['milk'], lactose: ['milk'], cheese: ['milk'],
  wheat: ['gluten'], celiac: ['gluten'], coeliac: ['gluten'],
  eggs: ['egg'], soya: ['soy'], soybean: ['soy'],
  shellfish: ['crustacean', 'mollusc'], seafood: ['fish', 'crustacean', 'mollusc'],
  shrimp: ['crustacean'], prawn: ['crustacean'], crab: ['crustacean'], lobster: ['crustacean'], crustaceans: ['crustacean'],
  mollusk: ['mollusc'], molluscs: ['mollusc'], squid: ['mollusc'], oyster: ['mollusc'], clam: ['mollusc'],
  sulfite: ['sulphites'], sulfites: ['sulphites'], sulphite: ['sulphites'],
  halal: ['pork', 'alcohol'], kosher: ['pork', 'crustacean', 'mollusc'],
  'no pork': ['pork'], 'no beef': ['beef'], hindu: ['beef'],
  'plant based': ['vegan'], 'plant-based': ['vegan'], veggie: ['vegetarian'],
  milk: ['milk'],
  'red meat': ['alpha_gal'], 'alpha-gal': ['alpha_gal'], 'alpha gal': ['alpha_gal'], 'mammalian meat': ['alpha_gal'], 'red meat (alpha-gal)': ['alpha_gal'],
  maize: ['corn'], 'no alcohol': ['alcohol'], 'pescetarian': ['pescatarian'],
  mollusks: ['mollusc'], 'crustacean shellfish': ['crustacean'], 'soybeans': ['soy'],
};

const clean = (s) => String(s || '').toLowerCase().normalize('NFKC')
  .replace(/allerg(y|ies|ic)( to)?/g, '').replace(/intoleran(t|ce)( to)?/g, '')
  .replace(/-?free\b/g, '').replace(/^no\s+/, '').replace(/\s+/g, ' ').trim();

/** Turn ["peanuts", "shellfish", "halal"] into [{id, label, ...}] */
export function normalizeRestrictions(list) {
  const out = new Map();
  for (const raw of list || []) {
    const s = clean(raw);
    if (!s) continue;
    let ids = ALIASES[s] || (RESTRICTIONS[s] ? [s] : null);
    if (!ids && s.endsWith('s') && RESTRICTIONS[s.slice(0, -1)]) ids = [s.slice(0, -1)];
    if (!ids && ALIASES[s.replace(/s$/, '')]) ids = ALIASES[s.replace(/s$/, '')];
    if (!ids) {
      const match = Object.entries(RESTRICTIONS).find(([, r]) => r.label.toLowerCase() === s);
      if (match) ids = [match[0]];
    }
    if (ids) ids.forEach((id) => out.set(id, { id, ...RESTRICTIONS[id] }));
    else out.set('custom:' + s, { id: 'custom:' + s, label: s, keywords: [s], exclude: [], hidden: 'Custom restriction — confirm with staff.' });
  }
  return [...out.values()];
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Return the keywords from a restriction found in text (after removing excluded phrases). */
export function findKeywords(restriction, text) {
  let t = ' ' + String(text || '').toLowerCase() + ' ';
  for (const ex of restriction.exclude || []) t = t.split(ex.toLowerCase()).join(' ');
  const hits = [];
  for (const kw of restriction.keywords || []) {
    const re = new RegExp(`(?<![a-z])${escapeRe(kw.toLowerCase())}(?:s|es)?(?![a-z])`, 'i');
    if (re.test(t)) hits.push(kw);
  }
  return hits;
}

/**
 * Check a dish (from the database and/or a list of ingredients) against restrictions.
 * dish: {allergens:[], may_contain:[], ingredients:[]} or null
 */
export function checkRestrictions({ dish, ingredients = [], restrictions }) {
  const ingText = [...(dish?.ingredients || []), ...ingredients].join(', ');
  const results = restrictions.map((r) => {
    const evidence = [];
    let status = 'not_detected';
    const ids = [r.id, ...(r.implies || [])];
    const dbContains = (dish?.allergens || []).filter((a) => ids.includes(a));
    const dbMay = (dish?.may_contain || []).filter((a) => ids.includes(a));
    const kw = findKeywords(r, ingText);
    if (dbContains.length) evidence.push(`typical recipe contains: ${dbContains.map((a) => RESTRICTIONS[a]?.label || a).join(', ')}`);
    if (kw.length) evidence.push(`ingredient match: ${kw.join(', ')}`);
    if (dbContains.length || kw.length) status = 'contains';
    else if (dbMay.length) {
      status = 'possible';
      evidence.push(`often/sometimes contains: ${dbMay.map((a) => RESTRICTIONS[a]?.label || a).join(', ')}`);
    }
    return { restriction: r.id, label: r.label, status, evidence, hidden_sources: r.hidden };
  });
  return results;
}
