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
## 📚 Documentation lives in ONE place (mandatory)

All documentation for every repository in this workspace is **single-sourced** in the
umbrella repository:

```
c:\ws\docs\okf├── bundle.md            collection overview
├── index.md             catalogue of every concept and script note
├── concepts/            shared knowledge (architecture, testing, metadata, …)
└── scripts/             one note per userscript repository
```

### Rules

1. **Never create an `okf/` folder in this repository.** It is not duplicated here, by
   design. There was once a copy in every repo: 278 files describing 42 unique documents,
   with `concepts/architecture.md` physically present 32 times. Every edit had to be
   propagated to 30 repositories and drift was unavoidable.
2. **Never hand-edit a copy.** There are no copies. Edit the canonical file under
   `c:\ws\docs\okf\`.
3. **This repository's note is** `c:\ws\docs\okf\scripts\<repo-name>.md`. If it does not
   exist, add it before adding the script.
4. **Link, do not paste.** In `README.md`, link to the canonical note with a relative path
   from the workspace, e.g. `[documentation](../../../../../docs/okf/scripts/<repo-name>.md)`.
5. **Verify** with `node c:\ws\scripts\check-okf.mjs` — it exits `0` only when nothing is
   duplicated and every repository is linked and documented.
6. When adding a new script: create the repo, add `docs/okf/scripts/<repo-name>.md`, add it
   to the tables in `docs/okf/bundle.md` and `docs/okf/index.md`, then run the checker.

Full detail: `c:\ws\docs\okf\concepts\okf-requirement.md`.
