---
type: Script
title: Coupon & Referral Stack
description: Finds a retailer's promo/coupon/referral field, runs a capped user-confirmed sweep over a per-origin code pool (gray new-customer-only + coloured retailer-margin + referral tiers), and stacks the best pair when the site has two slots.
repo: https://github.com/chirag127/coupon-stack-userscript
install: https://github.com/chirag127/coupon-stack-userscript/raw/main/coupon-stack-userscript.user.js
version: "1.0.0"
tags: [userscript, coupon, promo, referral, stacking, shopping, checkout]
timestamp: 2026-11-09T00:00:00Z
---

# Coupon & Referral Stack

A cross-retailer convenience script. It types codes into the promo field the page already
exposes, reads the visible "applied / invalid" text, and - when a site has two slots -
stacks a second code. It never calls a discount API and never posts the page anywhere.
`@grant none`.

## Method

| Step | Source |
|------|--------|
| Discover | `input`/`textarea` whose name/id/placeholder/aria-label/parent text matches `promo\|coupon\|code\|offer\|discount\|voucher\|gift\|referr\|bonus\|deal`; first apply-verb button in its `form`/parent = the slot's submit |
| Pool | user `localStorage` codes (`cps_user_pool_v1`; `host:CODE` scoping; "new"/"first" → gray) + a built-in per-host seed. Capped at **8** attempts per run |
| Sweep | native `value` setter (so React/Vue register the input) → click apply → read nearby text against `POS_RE`/`NEG_RE` → `applied`/`rejected`/`silent` |
| Stack | when a page exposes **two** promo slots, apply the winner to slot 1 and a different-tier code to slot 2 |

The sweep is **dry-run → user confirms → apply**. The panel is a local overlay; it does not
rewrite the checkout. The chip only appears where a promo field is detected or the user has
scoped a code to that host, plus the `Alt+H` hotkey.

## Code tiers

| Tier | Color | Meaning |
|------|-------|---------|
| `newcust` | gray | first-order / new-customer-only codes |
| `promo` | amber | retailer-margin codes: site-wide % off, free shipping |
| `referral` | blue | referral / share codes |

## Limitations

- **Success is read from visible page text.** A server-side-only discount (no DOM change, or
  hidden behind a reload) reports `silent`/`changed` and the tool tells the user to verify the
  order total - it never claims a discount it did not see.
- Built-in codes are **seeds**, not a live list: real codes expire and are region-specific.
- Stacking only helps when the site actually has two distinct promo slots.
- Broad `@match *://*/*` is intentional; UI is gated on field detection + the hotkey.

## Risk

Gray: fills a field the page already exposes and reads the page's own feedback; the apply step
is user-triggered, capped, and confirmed. No discount API, no server check bypass, no direct
order-total manipulation. Verify the final total before paying.
