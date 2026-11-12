# Global Foodie: governance note

**Accountable person:** Justin Chen (GitHub: justinchen3089). I own the repository, the GitHub Pages site (https://justinchen3089.github.io/global-foodie/), the Cloudflare Worker key server and the Gemini API key, and I answer for what the agent does.

## Data the agent reads and stores, and where
- **Messages and food/menu photos.** These go from the visitor's browser → my Cloudflare Worker → the Google Gemini API (Gemini 3.5 Flash, falling back to Flash-Lite when Google is busy). Photos go only to the Image agent's request. The chat itself lives only in the open browser tab. My Worker keeps no database and writes no logs. On Gemini's free tier, Google may use prompts to improve its products, so the page tells visitors not to share sensitive information.
- **Traveler memory.** Allergies, diets, likes, spice level, past orders and last location are stored in the **visitor's own browser** (`localStorage`). They're sent to Gemini inside prompts, but never stored on any server of mine. Visitors can change their allergies in step 2, or erase everything with **"Clear my saved data"**.
- **Location.** Taken from browser GPS (after the browser's permission prompt) or a typed place, and looked up on OpenStreetMap. Restaurant data comes from OpenStreetMap, research from Google Search and Wikipedia. These lookups store nothing.
- **Secrets.** The Gemini key is an encrypted Cloudflare secret, and the GitHub Actions copies are encrypted repository secrets. Keys are never in the code, the website or the chat.

## Where the human gate sits
- **Actions gated:** saving to memory (`remember`, `forget`, `log_choice`, run by the Memory agent) and reading GPS (`get_current_location`, run by the Geolocation agent).
- **Between which steps:** after the agent's Gemini call proposes the tool call, and **before** the tool runs. The loop in `js/agent.js` waits for the click.
- **What the screen shows:** a yellow chat card, "🔒 Approval needed: Save this to your traveler memory". It lists **every argument with its exact value** (for example **Category:** allergy · **Value:** sesame) and has **Approve** and **Deny** buttons. On Deny the tool doesn't run, and the agent is told so.

## What a stranger with the link can and cannot do
**Can:** chat about food, set their own allergies, get recommendations, trigger web, map and allergy lookups, and save data to **their own** browser after approving it.

**Cannot:**
- See anyone else's data, the API key or the hidden instructions. The Worker adds a server policy to every request, and the caller can't remove it.
- Send email, pay, book or delete anything. No such tools exist.
- Exceed the caps:
  - **Per message:** 8 orchestrator calls, 18 model calls and 24 tool calls across all agents.
  - **Per chat:** 20 messages.
  - **Per answer:** 2,048 output tokens, and a 45-second time limit for each Gemini call.
  - **From other websites:** blocked; the Worker only accepts requests from my site.

**Known gaps:**
- There's no per-visitor rate limit, and a script can fake the website origin. Cost is bounded by the caps and by Google's spending limit on the key.
- Prompt injection can still produce off-topic or wrong text. Allergy advice is based on typical recipes, so the agent always tells visitors to confirm with restaurant staff.
