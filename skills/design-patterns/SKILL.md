---
name: design-patterns
description: Use when building or reviewing confirmations/destructive actions, empty states, error states, forms, loading/spinner states, mobile layouts, modals/overlays, or sticky/pinned UI (headers, action bars, table headers).
---

## Confirmations

1. **Confirm only destructive, irreversible actions** — delete, reject, archive. Never confirm "Save" or any additive action.
2. **Mirror the consequence in the title and the confirm button**, not "Yes/OK" — title "Delete request REQ-2039?", button `Delete request`.
3. **Destructive button on the right**, styled `destructive`. Cancel on the left, `ghost`/`outline`.
4. **Name the entity and the consequence** — "Delete request REQ-2039? This can't be undone."
5. **Prefer undo over confirm** when the action is reversible: act immediately, surface an undo toast for 8–10s. Never offer confirm *and* undo together.
6. **Never stack confirms.**

| Pattern | Use when |
|---|---|
| Inline confirm | Light action, worth a second look |
| Dialog confirm | Destructive, undo isn't feasible |
| Undo toast | Reversible (most soft-deletes) |
| No confirm | Safe, reversible, obvious |

```tsx
function archiveRequest(id: string) {
  optimisticallyArchive(id)
  toast('Request archived', { action: { label: 'Undo', onClick: () => restore(id) }, duration: 8000 })
}
```

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

Don't show a loading skeleton over an empty state while refreshing — keep the empty state, add a subtle inline indicator instead.

## Error handling

1. **Match surface to scope** — field → inline below input; section → replace section content; page → full-page state; global → toast/banner.
2. **Name what happened, why (if it helps), what to do next** — in that order.
3. **Preserve user input on error.** Never make someone re-type because of a failed submission.
4. **No modals for errors** unless the error blocks all further interaction.
5. **Error toasts persist until dismissed.** Only success toasts auto-dismiss (4–6s).
6. **Explicit retry affordance for transient failures** (network, timeout).
7. **One surface per failure** — never stack inline + toast + banner for the same error.
8. **Log to observability; never leak stack traces into the UI.**

| Weak | Strong |
|---|---|
| "Something went wrong." | "We couldn't load your requests. Check your connection and retry." |
| "Invalid input." | "Enter a work email — personal domains aren't accepted." |
| "Permission denied." | "You don't have access to this workspace. Ask an admin to invite you." |

Voice for errors: say "we" or name the subject, never passive ("an error has occurred"). Never apologise or hedge. No exclamation marks. Don't blame the user for the system's own validation gaps.

## Forms

1. **Label above input**, never floating or placeholder-as-label.
2. **Single column on mobile.** Desktop two-column only for clearly paired fields (first/last name).
3. **Validate on blur, not every keystroke.**
4. **Error text immediately below the input**, `text-destructive`.
5. **Primary action full-width on mobile, right-aligned on desktop.** Secondary actions `ghost`/`outline`, to its left.
6. **Mark required, not optional.** One `*` or `(required)` suffix style; don't mark everything `(optional)`.
7. **Let users submit.** Don't disable submit on validity alone — accept it and surface failing fields.

Field anatomy, in order: label (`text-sm font-medium`) → input (`h-9` desktop, `h-11` mobile for touch) → help text (optional, `text-xs text-muted-foreground`) → error text (conditional, `text-xs text-destructive`, replaces help text, tied via `aria-describedby`). Spacing: `space-y-4` between fields, `space-y-8` between groups, `space-y-1.5` inside a field.

Validation patterns: client-side on blur (format checks) → client-side on submit (cross-field) → async on blur, debounced 300–500ms (uniqueness checks) → server-side on submit (anything the client can't know, mapped to the same inline slot).

Submit button states — never hide or replace the form body:

| State | Button | Form |
|---|---|---|
| Idle | `Submit request` | Interactive |
| Submitting | `+spinner`, `disabled` | Visible, readable |
| Success | Back to idle, success toast | Reset or keep per flow |
| Error | Back to idle, inline errors | **Every entered value preserved** |

Show the spinner only if submission exceeds ~400ms.

## Loading states

1. **Inline spinner = the user just acted and is waiting** (submit, save, retry). Disable the triggering control while it shows.
2. **Skeleton = first paint of a page/list.** Mirror the populated layout — never a spinner parked in an empty container.
3. **No indicator if the work completes under 300ms.** Debounce the indicator, not the request.
4. **One indicator per action.** Never stack spinner + toast + banner.
5. **Background refresh keeps stale data on screen**, marked as refreshing — never replaced by a spinner/skeleton.
6. **Match spinner size to context** — `size-3` in badges/captions, `size-4` in buttons/inputs.
7. **`aria-label="Loading"` on every spinner.**

Use a present-tense verb + ellipsis on loading buttons (`Saving…`, not `Save`) — the disabled state + label change is the real feedback. Don't use spinners for terminal states (`Failed`, `Done`) — those are icons.

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
| Centered modal | Full-screen `Sheet` |

Ship one component per role (`<CreateRequestDialog>` desktop, `<CreateRequestSheet>` mobile) sharing the same inner form body — content single-sourced, container swapped. Don't rely on `overflow-x: auto` to fit a desktop table on mobile. Don't hide meaningful content at mobile sizes — move it to a different surface instead.

## Overlays

1. **Use an overlay when the task is secondary to what's behind it.** Navigate to a page when the content is a destination in its own right.
2. **Standard modal** for confirmations, short forms, single focused actions.
3. **Large modal (80% viewport)** for complex/long-scrolling content — multi-step forms, detail views.
4. **Never nest a modal inside another modal.**
5. **Close via dismiss action or backdrop click.**

A confirmation dialog is a modal — see the Confirmations rules above for its content and button order.

## Sticky elements

Pin only when losing the element forces the user to scroll back for **reachability** (e.g. Save/Cancel on a long form) or **context** (e.g. table column headers). Length alone never justifies stickiness.

- `position: sticky` fails silently inside a parent with `overflow: hidden` and no defined height — give the scroll container an explicit height.
- **Desktop:** title left in a sticky top bar; commit actions in a sticky footer, right-aligned, primary action last; disable Save until the form is modified.
- **Mobile, short forms:** top-bar Save (Back/title/Cancel/Save together) — iOS Mail/Settings convention.
- **Mobile, weighty actions** (checkout, payment, publish): full-width sticky footer CTA, padded clear of the home indicator.
- When a screen enters edit mode, hide tab bars and FABs — a Create FAB and a Cancel/Save pair are different mental models and must not share a screen.
- **Thumb reach:** top-right Save is the worst zone on a phone for a frequently-tapped action.
- **Keyboard:** a sticky footer must stay above the on-screen keyboard or recede with the layout — never let the keyboard cover Save. Test this explicitly.
- **Sticky table headers:** fixed-height scroll wrapper, `sticky top-0` on `<thead>` with a background matching the page, pagination placed *outside* the scroll container.
