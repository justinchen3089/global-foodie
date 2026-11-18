// Sensitive-information filter.
// Global Foodie never needs secrets or personal identifiers, so anything that looks like one is
// removed before a message leaves the browser, before anything is saved to memory, and again
// from anything shown on screen. The Cloudflare Worker runs the same check on its side.

const RULES = [
  // API keys, tokens and credentials
  { type: 'api_key', label: 'an API key', re: /\bAIza[0-9A-Za-z_\-]{30,}/g },
  { type: 'api_key', label: 'an API key', re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_\-]{16,}/g },
  { type: 'api_key', label: 'an API key', re: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { type: 'api_key', label: 'an access token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g },
  { type: 'api_key', label: 'an access key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { type: 'api_key', label: 'an access token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { type: 'api_key', label: 'an access token', re: /\beyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g },
  { type: 'api_key', label: 'a private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g },
  { type: 'api_key', label: 'an access token', re: /\bBearer\s+[A-Za-z0-9._\-]{16,}/gi },
  // "password: hunter2", "api key = abc123", "my pin is 1234"
  { type: 'password', label: 'a password or secret', re: /\b(?:password|passcode|passwd|pwd)\b\s*(?:is|=|:)\s*\S+/gi },
  { type: 'password', label: 'a password or secret', re: /\b(?:pin|api[\s_-]?key|secret|token|access[\s_-]?key|private[\s_-]?key)\b\s*(?:is|=|:)\s*(?:\S*\d\S*|\S{12,})/gi },
  // Government IDs
  { type: 'id_number', label: 'an ID number', re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: 'id_number', label: 'an ID number', re: /\b(?:ssn|social security(?: number)?|passport(?: number| no\.?)?|driver'?s? licen[cs]e(?: number)?|routing(?: number)?|account(?: number| no\.?))\b\s*(?:is|=|:|#)?\s*[A-Z0-9][A-Z0-9 -]{4,}\d/gi },
  // Contact details
  { type: 'email', label: 'an email address', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { type: 'phone', label: 'a phone number', re: /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b|\+\d{1,3}[\s.-]?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g },
];

// Card numbers: 13 to 19 digits (spaces or dashes allowed) that pass the Luhn check.
const CARD_RE = /\b(?:\d[ -]?){12,18}\d\b/g;
function luhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = +digits[digits.length - 1 - i];
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

const MARK = '[removed]';

/**
 * Remove sensitive information from text.
 * Returns { text, found } where found lists what was removed, e.g. [{ type: 'api_key', label: 'an API key' }].
 */
export function redact(text) {
  let out = String(text ?? '');
  const found = [];
  out = out.replace(CARD_RE, (m) => {
    const digits = m.replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) { found.push({ type: 'card', label: 'a card number' }); return MARK; }
    return m;
  });
  for (const r of RULES) {
    out = out.replace(r.re, () => { found.push({ type: r.type, label: r.label }); return MARK; });
  }
  return { text: out, found };
}

/** True when the text contains something that must not be sent or saved. */
export const hasSensitive = (text) => redact(text).found.length > 0;

/** "an API key and a card number" */
export function describeFound(found) {
  const labels = [...new Set(found.map((f) => f.label))];
  return labels.length <= 1 ? (labels[0] || '') : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** True when nothing but removed markers and punctuation is left. */
export const onlyRemoved = (text) => !String(text).replaceAll(MARK, '').replace(/[\s\p{P}]/gu, '');

/** Remove only secrets (keys, passwords, card and ID numbers) — used on the agent's answers,
 *  which may legitimately contain a restaurant's phone number. */
export function redactSecrets(text) {
  const { text: out, found } = redact(text);
  if (!found.some((f) => f.type === 'email' || f.type === 'phone')) return { text: out, found };
  // Re-run without the contact-detail rules.
  let t = String(text ?? '');
  const kept = [];
  t = t.replace(CARD_RE, (m) => { const d = m.replace(/\D/g, ''); if (d.length >= 13 && d.length <= 19 && luhn(d)) { kept.push({ type: 'card', label: 'a card number' }); return MARK; } return m; });
  for (const r of RULES) if (r.type !== 'email' && r.type !== 'phone') t = t.replace(r.re, () => { kept.push({ type: r.type, label: r.label }); return MARK; });
  return { text: t, found: kept };
}
