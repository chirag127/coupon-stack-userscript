# 🎯 Coupon & Referral Stack

Finds the **promo / coupon / referral box** on any retailer page, tries a small,
**user-confirmed** code pool, reads the visible "applied / invalid" feedback, and - when the
site allows two slots - **stacks** the best pair. Gray codes are **new-customer-only**
promos; amber are **retailer-margin** codes (site-wide % off, free ship). No discount API,
no server, no build.

> A retailer page already exposes its coupon/referral fields to the DOM, and most codes are
> public strings. This tool types codes into the field the page already provides and reads
> the feedback the page already prints. It never calls a discount service and never posts
> your page anywhere.

## Install

First read the shared **[userscript install guide](https://github.com/chirag127/userscript-install-guide)**
(how to set up ScriptCat / Tampermonkey). Then click:

**[Install coupon-stack-userscript.user.js](https://github.com/chirag127/coupon-stack-userscript/raw/main/coupon-stack-userscript.user.js)**

## Use

Open a retailer's cart / checkout / offer page. A 🎯 chip appears bottom-right when a promo
field is present (or press **Alt+H**). Codes are kept **per origin** in `localStorage`
(`cps_user_pool_v1`), seeded by a small built-in pool, and can be added in the panel.

| Button | What it does |
|--------|--------------|
| **1 · Dry run** | Lists the planned codes (color-coded by tier) and the slot count. **No page change.** |
| **2 · Apply best** | Tries codes into slot 1 (capped at 8), stops at the first `applied`, using visible feedback to confirm. |
| **3 · Stack pair** | Same, but when the page has a **second** promo slot, also applies a different-tier code to it. |
| **Copy top** | Copies the top pool code to the clipboard for manual entry. |
| **Save** (input) | Adds a code to your pool. Prefix `host:` to scope it to one site; contain `new`/`first` to mark it gray (new-customer-only). |

Tier colors in the plan: **gray** = new-customer-only · **amber** = promo (retailer margin) · **blue** = referral.

## Method

| Step | Source |
|------|--------|
| Discover | `input`/`textarea` whose `name`/`id`/`placeholder`/`aria-label`/parent text matches `promo\|coupon\|code\|offer\|discount\|voucher\|gift\|referr\|bonus\|deal`; first apply-verb button in its `form` = the slot's submit |
| Pool | user `localStorage` codes + built-in per-host seed; matched on the registrable suffix so subdomain checkouts inherit the parent |
| Sweep | native `value` setter (so React/Vue register it) → click apply → read nearby text against `POS_RE` / `NEG_RE` → `applied` / `rejected` / `silent` |
| Stack | if two slots exist, apply the winner to slot 1 and a different-tier code to slot 2 |

`@grant none` - everything runs with the page's own origin.

## Limitations

- **Feedback is read from visible page text.** If a retailer applies a discount server-side with
  no DOM change (or hides it behind a reload), the tool reports `silent`/`changed` and tells you to
  verify the order total - it will **not** claim success.
- Built-in codes are **seeds**, not a live list: real codes expire and are region-specific.
  Maintain your own pool; the built-in table only structures the tiers.
- Stacking depends on the site actually having two distinct promo slots. Most don't.
- The broad `@match *://*/*` is intentional; the chip only appears where a promo field is
  detected or you've scoped a code to that host, and via the `Alt+H` hotkey.

## Risk

Gray: fills a field the page already exposes and reads the page's own feedback; the apply step
is user-triggered, capped, and confirmed. It does **not** call a discount API, bypass a server
check, or modify the order total directly. Verify the final total before paying.

Part of the [userscript collection](https://github.com/chirag127/userscript-install-guide).

## License

[MIT](LICENSE) © 2026 chirag127

<!-- docs-single-source -->
## 📚 Documentation

Documentation for this repository lives in the umbrella workspace, in exactly **one** place:

| What | Where |
|------|-------|
| This script's note | [`docs/okf/scripts/coupon-stack-userscript.md`](../../../../../docs/okf/scripts/coupon-stack-userscript.md) |
| All notes, catalogued | [`docs/okf/index.md`](../../../../../docs/okf/index.md) |
| Shared knowledge | [`docs/okf/concepts/`](../../../../../docs/okf/concepts/) |

It is **not** copied into this repository. Nothing in this workspace is duplicated: one
document, one file. Verify with `node c:\ws\scripts\check-okf.mjs`.
