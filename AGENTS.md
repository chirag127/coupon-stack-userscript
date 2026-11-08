# AGENTS.md - coupon-stack-userscript

Single-file userscript. `coupon-stack-userscript.user.js` at repo root IS the
product. No build, no deps, `@grant none`.

## Method

| Step | Source |
|------|--------|
| Discover | `input/textarea` whose name/id/placeholder/aria-label/parent text matches `promo|coupon|code|offer|discount|voucher|gift|referr|bonus|deal`; keep the first `apply`-verb button in its `form`/parent as the slot's submit |
| Pool | user `localStorage` codes (`cps_user_pool_v1`, `host:CODE` scoping, "new"/"first" → gray) + built-in per-host seed (`BUILTIN_POOL`). Capped at **8** attempts per run |
| Sweep | type the code (native `value` setter so React/Vue see it), click the slot's apply button, read nearby text against `POS_RE`/`NEG_RE` → `applied` / `rejected` / `silent` |
| Stack | when a site exposes **two** promo slots, apply the best code to slot 1, then a *different-tier* code to slot 2 |

The sweep is **dry-run → user confirms → apply**. Nothing auto-runs; the user
presses **1 · Dry run** (lists the plan, no page change) or **2 · Apply best**.
The panel is a **local overlay** and never rewrites the checkout.

## Rules

- One file, zero deps, `@grant none`. Bump `@version`; keep `@updateURL`/`@downloadURL` on raw `main`.
- Broad `@match *://*/*` is intentional (this is a cross-retailer tool). Gate the chip behind a
  "promo field exists" check + the `Alt+H` hotkey; do not show a panel on pages with no coupon box.
- **Always dry-run before applying.** The apply path is user-triggered, capped, and reads
  visible feedback before declaring success - never claim a discount from a code that wasn't
  confirmed by the page.
- **Guard every global hotkey with `isTyping()`** - this script types into inputs, so a stray
  hotkey while typing would collide with user entry.
- No discount API, no server, no posting the page anywhere. It only fills fields the page
  already exposes.
- Code tiers: `newcust` = **gray** (first-order only), `promo` = amber (retailer margin),
  `referral` = blue. Don't add more tiers without a README note.

## Install docs

Shared guide: https://github.com/chirag127/userscript-install-guide - link it, never duplicate install steps.

## Test

`sctl install ./coupon-stack-userscript.user.js`, open a retailer cart/checkout with a promo
box (the seed `example.com` codes demo the tiers on `example.com`), press `Alt+H`, run
**1 · Dry run** then **2 · Apply best**, and check `sctl debug console --level error`.

<!-- okf-requirement -->
## OKF documentation requirement (mandatory)

Every repository in this collection MUST ship an Open Knowledge Format bundle in `okf/`.

- Canonical bundle: `repos/own/public/userscripts/okf/` in the `c:\ws` monorepo. Never hand-edit a repo's `okf/` copy.
- After changing the canonical bundle run `node okf/sync-okf.mjs`; verify with `node okf/sync-okf.mjs --check` (must exit 0).
- `README.md` must link to `okf/`.
