// Public settings for the website. NOTHING SECRET goes in this file —
// it is published on GitHub Pages and anyone can read it.
export const CONFIG = {
  // URL of your deployed Cloudflare Worker that holds the Gemini key (see README → "Set up your Gemini key").
  PROXY_URL: 'https://global-foodie-proxy.YOUR-SUBDOMAIN.workers.dev',

  // Optional: a Google Maps *Embed API* key (a separate key, restricted to your github.io site).
  // Leave empty to use Google Maps' keyless embed, which works for basic maps and searches.
  GOOGLE_MAPS_EMBED_KEY: '',

  // 'imperial' (miles/feet, for the U.S.) or 'metric'.
  UNITS: 'imperial',

  // Cost caps enforced in the browser (the proxy enforces its own caps too).
  LIMITS: {
    MAX_TOOL_CALLS_PER_TURN: 8,   // orchestrator calls per message (agent delegations + its own tools)
    MAX_MODEL_CALLS_PER_TURN: 6,  // orchestrator model calls per message
    MAX_TOTAL_MODEL_CALLS: 18,    // all six agents together, per message
    MAX_TOTAL_TOOL_CALLS: 24,     // all six agents together, per message
    MAX_TURNS_PER_SESSION: 20,    // messages per chat
  },

  // true = replay sample scenarios with no Gemini calls (for demos before the proxy is set up).
  PREVIEW: false,
};
