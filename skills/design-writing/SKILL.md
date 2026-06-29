---
name: design-writing
description: Use when writing or reviewing any UI copy — button labels, empty states, errors, toasts, confirmations, dates/numbers/currency formatting, or capitalization.
---

## Voice

1. **Direct, not chatty.** Say what's true. Don't apologise, hedge, or over-explain.
2. **Second person, present tense** — "You haven't assigned anyone yet", not "Users need to assign someone."
3. **Active voice** — "You submitted this request", not "This request was submitted."
4. **Plain English over jargon.** Define a specialised term once, or link to a glossary.
5. **No exclamation marks.** Not in buttons, not in toasts.

Voice is constant; tone flexes with context:

| Context | Tone | Example |
|---|---|---|
| Routine action confirmed | Neutral, flat | "Changes saved." |
| First-time / milestone success | Light, still factual | "First request submitted. An approver will take a look." |
| Non-blocking warning | Measured | "This request is above your team's weekly limit. You can still submit it." |
| Blocking error | Direct, helpful | "We couldn't submit. Your connection dropped — try again when you're back online." |
| Destructive confirm | Direct, consequence-first | "Deleting removes the request and its receipts. This can't be undone." |
| Permission denied | Factual, no blame | "You don't have access to this workspace. Ask an admin to invite you." |
| Empty state (first use) | Orienting | "No requests yet. When someone on your team submits, it'll show up here." |

Use contractions ("you're", "can't") — they keep voice friendly without getting chatty. Don't say "please" in button labels or validation copy ("Please enter your email" → "Enter your email"). Don't switch to third person.

## UX copy by surface

1. **Button labels are verbs + object** — `Save changes`, `Submit request`, `Delete user`. Not "OK", not bare "Submit".
2. **Mirror the destructive verb in destructive confirmations** — title "Delete request?" → button "Delete request". Avoid "Confirm".
3. **Empty states: concept → reason → action**, in that order.
4. **Errors name the thing, the reason, and the fix** — "Email is already in use. Try signing in instead.", not "Invalid input."
5. **Toasts fit one line on mobile.** If a success message needs two lines, it belongs in a dialog or a page.
6. **Don't congratulate.** "Saved" is enough.

| Surface | Pattern | Weak | Strong |
|---|---|---|---|
| Primary button | Verb + object | `OK` | `Save changes` |
| Confirmation dialog | Title as question, button mirrors verb | "Are you sure?" | "Delete request REQ-2039?" |
| Empty state | Concept → reason → action | "No data." | "No requests yet. Submit one to get started." |
| Inline error | What's wrong → how to fix | "Invalid." | "Enter a valid work email." |
| Success toast | Past-tense statement | "Saved!" | "Changes saved." |
| Loading | Present-tense verb, only if >400ms | "Please wait." | "Saving…" |

## Writing style — capitalisation, punctuation, numbers, dates

1. **Sentence case everywhere** — titles, buttons, menu items, table headers. Never title case ("Create Request" → "Create request").
2. **Serial comma** — "Requests, approvals, and refunds."
3. **No trailing punctuation in labels/buttons/single-line helper text.** Full sentences elsewhere get periods.
4. **Numerals for all UI numbers** (`3 pending`, not "three pending").
5. **Dates: `MMM D, YYYY`** (`Apr 16, 2026`) by default; relative (`2 days ago`) for recency — never mixed in the same list/column.
6. **Currency always shows symbol + amount** (`$2,500.00`), `en-US` formatting unless the project overrides it.
7. **Never truncate without a tooltip, expandable, or detail link.**

Acronyms: spell out on first occurrence per surface, short form after — except universal ones (`URL`, `API`, `PDF`, `CSV`, `ID`) which never need expansion. Acronyms stay uppercase even in sentence-case labels (`API`, not `Api`); plurals take no apostrophe (`APIs`, not `API's`). Avoid internal shorthand in UI copy — spell out "Request", "Organization", not "Req", "Org".

| Context | Correct | Wrong |
|---|---|---|
| Badge | `3 pending` | `Three pending` |
| List header | `12 requests` | `12 Requests` |
| Date | `Apr 16, 2026` | `16/04/2026` |
| Currency | `$2,500.00` | `2500 USD` |
| Range | `Apr 10 – Apr 16, 2026` (en dash) | `04/10 - 04/16` |
| Empty count | `0 results` | `No results` (reserve "No results" for empty-state titles, not counts) |

Use en dash (`–`) for ranges, em dash (`—`) for sentence breaks. "sign in"/"sign up" as verbs (two words); "sign-in"/"sign-up" as nouns (hyphenated).
