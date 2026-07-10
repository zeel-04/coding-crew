---
name: design-patterns
description: Use when building or reviewing a screen, form, table, or dialog — mobile adaptation, modal-vs-sheet/overlay choice, sticky headers or action bars, forms, loading/empty/error states, or confirmation of destructive actions.
---

## Global principles

1. **Mobile-first** — design for touch/small viewports first, then progressively enhance for desktop; swap components rather than just scaling them down.
2. **Tokens are the contract** — no hand-authored hex/px/radii.
3. **No shadows, no blur, opaque surfaces.** Sticky/overlay backgrounds are always solid, never translucent — content must never bleed through on scroll.
4. **Accessibility is non-negotiable:** WCAG 2.2 AA.
5. **Copy is UI** — labels, empty states, and errors get the same intentionality as layout.
6. **Trust shadcn defaults**; override only when needed, and say why.
7. **Action placement:** primary action right-aligned on desktop / full-width on mobile; secondary actions `ghost`/`outline`, immediately to its left. Applies to forms, dialogs, confirmations, and sticky footers alike — sections below only call out where they deviate (e.g. Confirmations styles the primary button `destructive`, not default).
8. **One signal per action, never stacked** — one confirm, one loading indicator, one error surface for the same event.
9. **Debounce indicators, not requests** — don't show a loading/spinner state for anything resolving in under 300ms; a flash reads as a glitch.

---

## Mobile adaptation

1. **Design mobile-first** (`<768px`), progressively enhance via `md:`/`lg:`.
2. **Swap the component, don't compress it**, when a desktop pattern doesn't translate.
3. **Hover-only affordances don't exist on touch** — anything hover-revealed must be tappable on mobile.
4. **Primary actions within thumb reach** — bottom-sticky bars or full-screen sheets, not header toolbars.
5. **Touch targets ≥ 44×44px.** Non-negotiable.

| Desktop | Mobile |
|---|---|
| Data table | Stacked cards (2–3 key fields, rest in a details drawer) |
| Multi-column form | Single column, full-width controls |
| Persistent sidebar nav | Hamburger-triggered `Sheet` |
| Hover row actions | Always-visible `...` menu |
| Top toolbar | Bottom sticky action bar |
| Modal (standard or large) | Full-screen `Sheet` |

Ship one component per role (`<CreateRequestDialog>` desktop, `<CreateRequestSheet>` mobile) sharing the same inner form body — content single-sourced, container swapped. Don't rely on `overflow-x: auto` to fit a desktop table on mobile. Don't hide meaningful content at mobile sizes — move it to a different surface instead.

## Overlays (modal vs sheet)

Viewport determines format — modal is desktop's only overlay container; sheet is mobile's.

1. **Use an overlay at all only when the task is secondary** to what's behind it — navigate to a page instead when the content is a destination in its own right.
2. **Desktop: modal for everything**, including long or complex content — don't switch containers just because it scrolls. Standard modal when content fits without scrolling (confirmations, short single-purpose forms); **65–70% of viewport**, with internal scroll, for long/multi-section forms and detail views. Footer actions (Save/Cancel) can pin to the modal's own bottom edge once it's tall enough to need it.
3. **Mobile: swap to a full-screen `Sheet`** instead of scaling the modal further — see Mobile adaptation. A 65–70%-viewport modal doesn't work on a small screen.
4. **Never nest a modal inside another modal, and never stack modals** — if content still doesn't fit at 65–70%, that's a sign it needs its own page, not a bigger overlay.
5. **Close via an explicit dismiss action or backdrop click.**

A confirmation dialog is a modal — see Confirmations for its content and button order.

## Sticky elements

Pin only when losing the element forces the user to scroll back for **reachability** (e.g. Save/Cancel on a long form) or **context** (e.g. table column headers). Length alone never justifies stickiness.

- `position: sticky` fails silently inside a parent with `overflow: hidden` and no defined height — give the scroll container an explicit height.
- **Desktop:** title left in a sticky top bar; commit actions in a sticky footer (placement/styling per Global principles). Disable Save until the form is modified — this is a *dirty-state* gate, independent of the *validity* gate in Forms (which should never disable Submit).
- **Mobile, short forms:** top-bar Save (Back/title/Cancel/Save together) — iOS Mail/Settings convention.
- **Mobile, weighty actions** (checkout, payment, publish): full-width sticky footer CTA, padded clear of the home indicator.
- When a screen enters edit mode, hide tab bars and FABs — a Create FAB and a Cancel/Save pair are different mental models and must not share a screen.
- **Thumb reach:** top-right Save is the worst zone on a phone for a frequently-tapped action.
- **Keyboard:** a sticky footer must stay above the on-screen keyboard or recede with the layout — never let the keyboard cover Save. Test this explicitly.
- **Sticky table headers:** fixed-height scroll wrapper, `sticky top-0` on `<thead>` with a background matching the page, pagination placed *outside* the scroll container.

## Forms

1. **Label above input**, never floating or placeholder-as-label.
2. **Single column on mobile.** Desktop two-column only for clearly paired fields (first/last name).
3. **Validate on blur, not every keystroke.**
4. **Error text immediately below the input**, `text-destructive`.
5. **Action placement per Global principles** — primary full-width on mobile / right-aligned on desktop, secondary `ghost`/`outline` to its left.
6. **Mark required, not optional.** One `*` or `(required)` suffix style; don't mark everything `(optional)`.
7. **Let users submit.** Don't disable submit on validity alone — accept it and surface failing fields. (Independent of the dirty-state gate on sticky Save buttons — see Sticky elements.)

Forms submit through a Server Action bound with `useActionState` — see `frontend-api-layer` for the action anatomy. Client-side Zod (directly or via react-hook-form as the client layer) gives instant on-blur feedback; the Server Action re-validates with `safeParse` regardless.

Field anatomy, in order: label (`text-sm font-medium`) → input (`h-9` desktop, `h-11` mobile for touch) → help text (optional, `text-xs text-muted-foreground`) → error text (conditional, `text-xs text-destructive`, replaces help text, tied via `aria-describedby`). Spacing: `space-y-4` between fields, `space-y-8` between groups, `space-y-1.5` inside a field.

Validation patterns: client-side Zod on blur (format checks) → client-side on submit (cross-field) → async on blur, debounced 300–500ms (uniqueness checks) → server-side Zod `safeParse` in the Server Action (always, and for anything the client can't know), mapped back to the same inline slot via the `useActionState` state.

Submit button states — never hide or replace the form body:

| State | Signal | Button | Form |
|---|---|---|---|
| Idle | `pending === false`, no errors in state | `Submit request` | Interactive |
| Submitting | `useActionState` `pending === true` | `+spinner`, `disabled` | Visible, readable |
| Success | Action returned success / redirected | Back to idle, success toast | Reset or keep per flow |
| Error | Action returned `errors` in state | Back to idle, inline errors | **Every entered value preserved** — echo submitted values back through the action state into `defaultValue` |

Show the spinner only if submission exceeds ~300ms (Global principle on debouncing indicators).

## Loading states

1. **Inline spinner = the user just acted and is waiting** (submit, save, retry). Disable the triggering control while it shows.
2. **Skeleton = first paint of a page/list.** Mirror the populated layout — never a spinner parked in an empty container.
3. **No indicator if the work completes under 300ms.** Debounce the indicator, not the request.
4. **One indicator per action** (Global principle on stacked signals) — never spinner + toast + banner for the same work.
5. **Background refresh keeps stale data on screen**, marked as refreshing, rather than replaced by a spinner/skeleton — whether the surface currently shows populated data or an empty state (see Empty states).
6. **Match spinner size to context** — `size-3` in badges/captions, `size-4` in buttons/inputs.
7. **`aria-label="Loading"` on every spinner.**

Use a present-tense verb + ellipsis on loading buttons (`Saving…`, not `Save`) — the disabled state + label change is the real feedback. Don't use spinners for terminal states (`Failed`, `Done`) — those are icons.

## Empty states

1. **Every list/table/data surface has a designed empty state.**
2. **Answer in order:** what is this screen → why is it empty → what to do next. Name the concept in the title ("No requests yet").
3. **Include a primary action only when the user can fix it.** Omit for permission-gated states. Never stack two primary actions.
4. **Icon, not a shadowed card** — single icon `h-10 w-10 text-muted-foreground`.
5. **Never sell a feature.** It's a functional screen, not marketing. Don't use `destructive` styling — empty isn't a failure.

Anatomy (centred, `gap-3`, `py-12`): icon → title (`text-base font-medium`) → description (`text-sm text-muted-foreground`, 1–2 sentences) → optional action.

Empty vs loading vs error — same surface, ask "does the data exist?":

| State | Data exists? | Show |
|---|---|---|
| Loading | Unknown (in flight) | Skeleton mirroring the populated layout — never a centered spinner |
| Empty | Yes, zero results | Empty state |
| Error | Unknown (request failed) | Error state with retry |

If refreshing an already-empty view, keep the empty state on screen rather than swapping in a skeleton (see Loading states, background refresh).

## Error handling

1. **Match surface to scope** — field → inline below input; section → replace section content; page → full-page state; global → toast/banner.
2. **Name what happened, why (if it helps), what to do next** — in that order.
3. **Preserve user input on error.** Never make someone re-type because of a failed submission.
4. **No modals for errors** unless the error blocks all further interaction.
5. **Error toasts persist until dismissed.** Only success toasts auto-dismiss (4–6s).
6. **Explicit retry affordance for transient failures** (network, timeout).
7. **One surface per failure** (Global principle on stacked signals) — never inline + toast + banner together.
8. **Log to observability; never leak stack traces into the UI.**

| Weak | Strong |
|---|---|
| "Something went wrong." | "We couldn't load your requests. Check your connection and retry." |
| "Invalid input." | "Enter a work email — personal domains aren't accepted." |
| "Permission denied." | "You don't have access to this workspace. Ask an admin to invite you." |

Voice for errors: say "we" or name the subject, never passive ("an error has occurred"). Never apologise or hedge. No exclamation marks. Don't blame the user for the system's own validation gaps.

## Confirmations

1. **Confirm only destructive, irreversible actions** — delete, reject, archive. Never confirm "Save" or any additive action.
2. **Mirror the consequence in the title and the confirm button**, not "Yes/OK" — title "Delete request REQ-2039?", button `Delete request`.
3. **Action placement per Global principles**, with the destructive button styled `destructive` instead of default primary; Cancel stays `ghost`/`outline` on its left.
4. **Name the entity and the consequence** — "Delete request REQ-2039? This can't be undone."
5. **Prefer undo over confirm** when the action is reversible: act immediately, surface an undo toast for 8–10s. Never offer confirm *and* undo together.
6. **Never stack confirms** (Global principle on stacked signals).

| Pattern | Use when |
|---|---|
| Inline confirm | Light action, worth a second look |
| Dialog confirm | Destructive, undo isn't feasible |
| Undo toast | Reversible (most soft-deletes) |
| No confirm | Safe, reversible, obvious |
