# Global Foodie: governance note

**Accountable person:** [YOUR FULL NAME], owner of this repository, the Cloudflare Worker and the Google AI Studio key. Contact: [YOUR SCHOOL EMAIL].

## What data the agent reads and stores, and where

| Data | Where it goes | Kept? |
|---|---|---|
| Chat messages and menu photos | Visitor's browser → my Cloudflare Worker → Google Gemini API (photos go only to the Image agent's request) | Chat lives only in the open browser tab and is gone on refresh. My Worker writes no logs or database. Google processes requests under the Gemini API terms; on the free tier Google may use them to improve its products, so the app tells users not to type sensitive information. |
| Traveler memory: allergies, diets, likes, spice level, notes, order history, last location | Visitor's own browser (`localStorage`) | Yes, on that device only. It is never sent to my server for storage. It is sent to Gemini inside the prompt so the agent can use it. The visitor can change allergies in step 2, and erase everything with **"Clear my saved data"** at the bottom of the page. |
| Device location (GPS) | Browser → OpenStreetMap Nominatim (to name the area) → memory | Only after the browser's permission prompt **and** an in-app Approve click, or when the visitor taps "Use my location." |
| Public data the tools read | OpenStreetMap (Overpass, Nominatim), Wikipedia, Google Search (through Gemini grounding), and the built-in dish and allergy database | Not stored. |
| Secrets | `GEMINI_API_KEY` is an encrypted Cloudflare Worker secret | Never in the repo, the UI or the browser. |

## Where the human gate sits

- **Actions:** `remember`, `forget` and `log_choice` (they write to persistent memory) and `get_current_location` (it reads private GPS data).
- **Between which steps:** after an agent's Gemini call returns a function call and **before** the tool runs (`runLoop` in `js/agent.js` waits on `confirm()`). Only the Memory agent can call the memory tools, and only the Geolocation agent can call GPS, so every write goes through this one gate.
- **What the screen shows:** a yellow card in the chat, for example "🔒 Approval needed: Save this to your traveler memory". It shows the action and **every argument with its exact value**, as readable labels (**Category:** allergy · **Value:** sesame), with **Approve** and **Deny** buttons. On Deny the tool does not run, and the agent is told the traveler declined. Developers can see the raw tool call (`remember({...})`) in the hidden trace panel by opening the site with `?debug`.

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
- Exceed the cost caps. Per message: 18 model calls and 24 tool calls across all six agents, 8 orchestrator calls, and a step limit per agent. Per chat: 20 messages. Per answer: 2,048 output tokens. Per IP: 60 requests per minute. Per request: 8 MB. Google AI Studio also has a spending cap.
- Use my proxy from another website (origin allowlist).

**Known residual risks:**
- A script can fake the Origin header. The rate limit and spending cap bound the cost.
- Prompt injection can still produce off-topic or wrong text.
- Allergy advice comes from typical recipes, so the agent always tells users to confirm with staff.
