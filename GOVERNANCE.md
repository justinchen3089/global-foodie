# Global Foodie: governance note

**Accountable person:** [YOUR FULL NAME], owner of this repository, the Cloudflare Worker and the Google AI Studio key. Contact: [YOUR SCHOOL EMAIL].

## What data the agent reads and stores, and where

| Data | Where it goes | Kept? |
|---|---|---|
| Chat messages and menu photos | Visitor's browser → my Cloudflare Worker → Google Gemini API | Chat lives only in the open browser tab and is gone on refresh. My Worker writes no logs or database. Google processes requests under the Gemini API terms; on the free tier Google may use them to improve its products, so the app tells users not to type sensitive information. |
| Traveler memory: allergies, diets, likes, spice level, notes, order history, last location | Visitor's own browser (`localStorage`) | Yes, on that device only. It is never sent to my server for storage. It is sent to Gemini inside the prompt so the agent can use it. The visitor can view, edit or clear it in the **Memory** tab. |
| Device location (GPS) | Browser → OpenStreetMap Nominatim (to name the area) → memory | Only after the browser's permission prompt **and** an in-app Approve click, or when the visitor taps "Use my location." |
| Public data the tools read | OpenStreetMap (Overpass, Nominatim), Wikipedia, Google Search (through Gemini grounding), and the built-in dish and allergy database | Not stored. |
| Secrets | `GEMINI_API_KEY` is an encrypted Cloudflare Worker secret | Never in the repo, the UI or the browser. |

## Where the human gate sits

- **Actions:** `remember`, `forget` and `log_choice` (they write to persistent memory) and `get_current_location` (it reads private GPS data).
- **Between which steps:** after Gemini returns a function call and **before** the tool runs (`runAgent` in `js/agent.js` waits on `confirm()`).
- **What the screen shows:** a yellow card in the chat: "🔒 Approval needed: Save this to your traveler memory." It shows the exact function name and its JSON arguments, for example `remember({"category": "allergy", "value": "sesame"})`, with **Approve** and **Deny** buttons. On Deny the tool does not run, and the model is told the traveler declined.

Search, lookup and allergy-check tools run without a gate, because they only read public data.

## What a stranger with the link can and cannot do

**Can:**
- Chat about food.
- Set their own allergies and get recommendations.
- Trigger web, map and allergy lookups.
- Save data to their own browser's memory, after approving it.

**Cannot:**
- See anyone else's data. Memory is per-browser, and the server stores nothing.
- Get the API key or the hidden instructions. A server-side policy is prepended to every request and can't be removed by the caller.
- Send email, make payments or bookings, or delete anything. No such tools exist.
- Exceed the cost caps: 8 tool calls per message, 20 messages per chat, 2,048 output tokens per answer, 30 requests per minute per IP, and 8 MB per request. Google AI Studio also has a spending cap.
- Use my proxy from another website (origin allowlist).

**Known residual risks:**
- A script can fake the Origin header. The rate limit and spending cap bound the cost.
- Prompt injection can still produce off-topic or wrong text.
- Allergy advice comes from typical recipes, so the agent always tells users to confirm with staff.
