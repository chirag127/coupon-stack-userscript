// ==UserScript==
// @name         Coupon & Referral Stack
// @namespace    https://github.com/chirag127
// @version      1.0.0
// @description  Finds the promo / coupon / referral box on any retailer page, tries your code pool (gray "new-customer-only" codes and coloured retailer-margin promo codes), and stacks the best pair when the site allows two slots. Local only, no server.
// @author       chirag127
// @license      MIT
// @match        *://*/*
// @icon         data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ctext y='20' font-size='20'%3E%F0%9F%92%B0%3C/text%3E%3C/svg%3E
// @homepageURL  https://github.com/chirag127/coupon-stack-userscript
// @supportURL   https://github.com/chirag127/coupon-stack-userscript/issues
// @downloadURL  https://github.com/chirag127/coupon-stack-userscript/raw/main/coupon-stack-userscript.user.js
// @updateURL    https://github.com/chirag127/coupon-stack-userscript/raw/main/coupon-stack-userscript.user.js
// @grant        none
// @noframes
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   * A retailer page already exposes its promo/coupon/referral box(es) to
   * the DOM, and most codes are public strings. This tool finds the
   * field, runs a *capped, user-confirmed* sweep over a small code pool,
   * reads the visible "applied / invalid" feedback, and - when the site
   * has two slots - stacks the best pair. It never calls a discount API
   * and never posts your page anywhere.
   *
   * Code tiers:
   *   - "newcust"   (GRAY)   first-order / new-customer-only codes
   *   - "promo"     (AMBER)  retailer-margin codes: site-wide % off, free ship
   *   - "referral"  (BLUE)   referral / share codes
   * ------------------------------------------------------------------ */

  /* Per-origin starter pool. These are examples to structure the data -
   * real codes expire and are region-specific, so treat this as a seed
   * and maintain your own via the panel (stored under a namespaced key). */
  const BUILTIN_POOL = {
    // host -> [ { code, kind, note } ]
    "example.com": [
      { code: "WELCOME10",  kind: "newcust",  note: "new-customer 10%" },
      { code: "SHIPFREE",   kind: "promo",    note: "free shipping (retailer margin)" },
      { code: "SAVE15",      kind: "promo",    note: "site-wide 15% off" },
      { code: "REF-CHIRAG", kind: "referral", note: "referral code" },
    ],
  };

  const TIER = {
    newcust:  { color: "#9aa0a6", label: "new-customer only" },
    promo:    { color: "#f0b429", label: "promo (retailer margin)" },
    referral: { color: "#58a6ff", label: "referral" },
  };

  const STORE_KEY = "cps_user_pool_v1";   // namespaced: no site-data clobbering
  const MAX_SWEEP = 8;                    // hard cap on auto-attempts per run
  const SETTLE_MS = 900;                  // wait for server-side feedback

  const POS_RE = /applied|valid code|you.?re.?saving|you.?ve saved|\$?£?\u20b5?\s*\d+(?:\.\d+)?\s*(?:off|saved|discount)|\d+\s*% off|congrat|successfully|added/i;
  const NEG_RE = /invalid|expired|doesn'?t|does not|not valid|can'?t be|cannot be|error|minimum order|minimum spend|wrong code|use ?another|not applicable|already used/i;

  const state = { route: "", busy: false };

  /* ----------------------------- utils ----------------------------- */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const normHost = () => location.host.replace(/^www\./, "");

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === "class") n.className = v;
      else if (k === "style") Object.assign(n.style, v);
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return n;
  }

  const isTyping = () => {
    const a = document.activeElement;
    if (!a) return false;
    const t = (a.tagName || "").toUpperCase();
    return t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || a.isContentEditable;
  };

  /* ------------------------- code pool ---------------------------- */
  function userPool() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]") || []; } catch (_) { return []; }
  }
  function saveUserPool(list) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch (_) {}
  }
  function poolFor() {
    const host = normHost();
    // match on registrable-ish suffix so subdomain checkouts inherit the parent
    const owned = BUILTIN_POOL[host];
    const parent = Object.keys(BUILTIN_POOL).find((h) => host !== h && host.endsWith("." + h));
    const builtin = [...(owned || []), ...((parent && BUILTIN_POOL[parent]) || [])];
    // user codes win + can be scoped to a host ("host:CODE" or "CODE")
    const merged = userPool().map((e) => {
      if (typeof e !== "string") return e;
      const m = e.match(/^([\w.]+):(.+)$/);
      const scoped = m ? m[1].replace(/^www\./, "") : host;
      return { code: m ? m[2] : e, kind: /welcome|new|first|firstorder/i.test(m ? m[2] : e) ? "newcust" : "promo", note: m ? "user" : "user", _host: scoped };
    }).filter((e) => e._host === host || e._host === (parent || host));
    return [...merged, ...builtin];
  }

  /* --------------------- promo field discovery --------------------- */
  function promoInputs() {
    const out = [];
    const seen = new Set();
    document.querySelectorAll("input,textarea").forEach((inp) => {
      if (inp.type && !/text|search|email|password/.test(inp.type) && inp.type !== "") return;
      const name = (inp.name + " " + (inp.id || "") + " " + inp.placeholder + " " +
        (inp.getAttribute("aria-label") || "") + " " + (inp.closest("form,div,section") && (inp.closest("form,div,section").textContent || "").slice(0, 40))).toLowerCase();
      if (!/(promo|coupon|code|offer|discount|voucher|gift|referr|bonus|deal)/.test(name)) return;
      const slot = inp.closest("form") || inp.parentElement;
      const key = slot ? slot.id || slot.className || "s" + slot.tagName : inp;
      if (seen.has(String(key))) return;
      seen.add(String(key));
      out.push({
        input: inp,
        form: slot,
        label: name.trim().slice(0, 60),
        applyBtn: findApplyBtn(slot, inp),
      });
    });
    return out;
  }

  function findApplyBtn(scope, inp) {
    if (!scope) return null;
    let btn = scope.querySelector ? scope.querySelector('button[type="submit"],button,input[type="submit"],[role="button"]') : null;
    if (btn && /apply|redeem|use|add|submit|enter/i.test(btn.textContent || btn.value || "")) return btn;
    // nearest button sibling with the right verb
    const cand = [...(scope ? scope.querySelectorAll("button,input[type=submit],[role=button]") : document.querySelectorAll("button"))]
      .find((b) => /apply|redeem|use|add code/i.test((b.textContent || b.value || "").trim()));
    return cand || btn || null;
  }

  /* --------------------- type + feedback --------------------------- */
  function setNative(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function nearbyText(slot, inp) {
    const root = slot || inp.parentElement || document.body;
    const box = (root.textContent || "").slice(0, 400);
    return box;
  }

  async function tryCode(slot, code) {
    const before = nearbyText(slot.form, slot.input);
    setNative(slot.input, code);
    await sleep(80);
    if (slot.applyBtn) { slot.applyBtn.click(); await sleep(SETTLE_MS); }
    else slot.input.dispatchEvent(new Event("blur", { bubbles: true }));
    await sleep(200);
    const now = nearbyText(slot.form, slot.input);
    const changed = now !== before;
    const neg = NEG_RE.test(now) && !NEG_RE.test(before.replace(code, ""));
    const pos = POS_RE.test(now);
    let status = "silent";
    if (neg) status = "rejected";
    else if (pos) status = "applied";
    else if (changed) status = "changed";
    return { code, status, snippet: now.slice(now.length - 140) };
  }

  async function sweep(single) {
    if (state.busy) return;
    state.busy = true;
    const slots = promoInputs();
    if (!slots.length) { ui && ui.log("No promo/coupon field found on this page.", "warn"); state.busy = false; return; }
    const pool = poolFor().filter((c) => c.code);
    if (!pool.length) { ui && ui.log("No codes in the pool for " + normHost() + ". Add some in the panel.", "warn"); state.busy = false; return; }
    const plan = pool.slice(0, MAX_SWEEP);

    if (single === "dry") {
      ui && ui.log("Dry run · " + plan.length + " code(s) · " + slots.length + " slot(s). No page change.", "info");
      renderPlan(plan);
      state.busy = false;
      return;
    }

    // "apply" touches slot 1 only. "stack" also tries a second slot when the
    // page has one - the user opts into the riskier two-code action.
    const doStack = single === "stack";
    const winner = { code: null, status: "none", snippet: "" };
    for (const cand of plan) {
      const r = await tryCode(slots[0], cand.code);
      ui && ui.log("“" + cand.code + "” (" + cand.kind + ") → " + r.status + (r.snippet ? " · “" + r.snippet.trim().slice(0, 80) + "”" : ""), r.status === "applied" ? "good" : r.status === "rejected" ? "bad" : "warn");
      if (r.status === "applied") { winner.code = cand.code; winner.status = "applied"; winner.snippet = r.snippet; break; }
      if (winner.status === "none" && r.status === "changed") { winner.code = cand.code; winner.status = "changed"; winner.snippet = r.snippet; }
    }
    if (doStack && slots[1] && winner.status === "applied") {
      const sameTier = (pool.find((p) => p.code === winner.code) || {}).kind;
      const other = plan.find((c) => c.code !== winner.code && c.kind !== sameTier);
      if (other) {
        const r2 = await tryCode(slots[1], other.code);
        ui && ui.log("Stack “" + other.code + "” in slot 2 → " + r2.status, r2.status === "applied" ? "good" : "warn");
        if (r2.status === "applied") winner.stacked = other.code;
      } else ui && ui.log("No second-tier code to stack.", "warn");
    }
    ui && (winner.status === "applied"
      ? ui.log("Done. " + winner.code + " applied" + (winner.stacked ? " + stacked " + winner.stacked : "") + ". Verify the order total before paying.", "good")
      : winner.status === "changed"
        ? ui.log("Best “" + winner.code + "” changed the page but no visible confirmation. Verify the order total.", "warn")
        : ui.log("No code confirmed applied from visible feedback. Review the plan and try manually.", "warn"));
    state.busy = false;
  }

  function renderPlan(plan) {
    const box = document.getElementById("cps-plan");
    if (!box) return;
    box.textContent = "";
    for (const c of plan) {
      const t = TIER[c.kind] || TIER.promo;
      box.appendChild(el("div", { class: "cps-plan-row" },
        el("span", { class: "cps-code", style: { color: t.color } }, c.code),
        el("span", { class: "cps-plan-note" }, t.label + (c.note ? " · " + c.note : "")),
      ));
    }
  }

  /* ----------------------------- panel ---------------------------- */
  let ui = null;

  function log(msg, kind) {
    if (!ui) return;
    ui.logbox.prepend(el("div", { class: "cps-log-line" + (kind ? " cps-" + kind : "") },
      new Date().toLocaleTimeString() + "  " + msg));
    while (ui.logbox.childElementCount > 40) ui.logbox.lastChild.remove();
  }

  function hasField() { return promoInputs().length > 0; }

  function build() {
    if (document.getElementById("cps-panel")) return;
    const host = normHost();

    const panel = el("div", { id: "cps-panel", class: "cps-panel" },
      el("div", { class: "cps-hdr" },
        el("span", { class: "cps-dot" }),
        el("strong", null, "Coupon stack · " + host),
        el("span", { class: "cps-spacer" }),
        el("button", { class: "cps-x", title: "Hide", onclick: () => { panel.style.display = "none"; chip.style.display = "block"; } }, "×")
      ),
      el("div", { class: "cps-body" },
        el("div", { class: "cps-status", id: "cps-status" }, "—"),
        el("div", { class: "cps-row" },
          el("button", { class: "cps-btn", id: "cps-dry", onclick: () => sweep("dry") }, "1 · Dry run"),
          el("button", { class: "cps-btn cps-primary", id: "cps-run", onclick: () => sweep("run") }, "2 · Apply best")
        ),
        el("div", { class: "cps-row" },
          el("button", { class: "cps-btn cps-ghost", id: "cps-stack", onclick: () => sweep("stack") }, "3 · Stack pair"),
          el("button", { class: "cps-btn cps-ghost", id: "cps-copy", onclick: copyTop }, "Copy top")
        ),
        el("div", { class: "cps-plan", id: "cps-plan" }),
        el("div", { class: "cps-add" },
          el("input", { id: "cps-new", placeholder: "add code  ·  host:CODE to scope  ·  'new'/'first' marks gray" }),
          el("button", { class: "cps-btn cps-ghost", onclick: addCode }, "Save")
        ),
        el("div", { class: "cps-log", id: "cps-log" })
      )
    );

    const chip = el("button", { id: "cps-chip", class: "cps-chip", title: "Coupon & referral stack (Alt+H)" }, "🎯");

    document.body.append(panel, chip);
    chip.style.display = "block";
    ui = { panel, chip, logbox: panel.querySelector("#cps-log"), log };
    drag(panel.querySelector(".cps-hdr"), panel);
    refreshStatus();
    panel.style.display = "none";
  }

  function addCode() {
    const inp = document.getElementById("cps-new");
    const v = inp.value.trim();
    if (!v) return;
    const list = userPool();
    list.unshift(v);
    saveUserPool(list.slice(0, 60));
    inp.value = "";
    log("Saved “" + v + "” to this browser's pool.", "good");
    refreshStatus();
  }

  function copyTop() {
    const pool = poolFor();
    if (!pool.length) { log("No code to copy.", "warn"); return; }
    navigator.clipboard.writeText(pool[0].code).then(
      () => log("Copied " + pool[0].code + " to the clipboard.", "good"),
      () => log("Clipboard blocked by the browser.", "bad")
    );
  }

  function refreshStatus() {
    if (!ui) return;
    const slots = promoInputs();
    const pool = poolFor();
    const st = document.getElementById("cps-status");
    if (!st) return;
    if (!slots.length) st.textContent = "No promo field detected yet - open the cart / checkout / offer page.";
    else if (!pool.length) st.textContent = slots.length + " slot(s) found. No codes for " + normHost() + " - add some above.";
    else st.textContent = slots.length + " slot(s) · " + pool.length + " code(s) · " +
      pool.filter((c) => c.kind === "newcust").length + " gray, " +
      pool.filter((c) => c.kind === "promo" || c.kind === "referral").length + " coloured.";
  }

  function drag(handle, box) {
    let on = false, sx = 0, sy = 0, ox = 0, oy = 0;
    handle.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      on = true; sx = e.clientX; sy = e.clientY;
      const r = box.getBoundingClientRect(); ox = r.left; oy = r.top;
      box.style.right = "auto"; box.style.bottom = "auto";
      box.style.left = ox + "px"; box.style.top = oy + "px";
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!on) return;
      box.style.left = Math.max(0, ox + e.clientX - sx) + "px";
      box.style.top = Math.max(0, oy + e.clientY - sy) + "px";
    });
    handle.addEventListener("pointerup", () => (on = false));
  }

  function togglePanel() {
    if (!ui) return;
    const p = ui.panel;
    if (p.style.display === "none") { p.style.display = "flex"; ui.chip.style.display = "none"; refreshStatus(); }
    else { p.style.display = "none"; ui.chip.style.display = "block"; }
  }

  /* ----------------------------- boot ----------------------------- */
  function styleSheet() {
    return `
      #cps-panel,#cps-chip{font:12px/1.45 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#e8e8e8;background:#181818;border:1px solid #2c2c2c;border-radius:10px;box-shadow:0 12px 40px #000a;z-index:2147483000}
      #cps-panel{position:fixed;right:18px;bottom:18px;width:360px;display:flex;flex-direction:column;overflow:hidden;resize:both}
      .cps-hdr{display:flex;align-items:center;gap:8px;padding:9px 10px;background:#111;border-bottom:1px solid #2c2c2c;cursor:grab;user-select:none}
      .cps-dot{width:8px;height:8px;border-radius:50%;background:#f0b429;box-shadow:0 0 0 3px #f0b42933}
      .cps-spacer{flex:1}
      .cps-x{background:none;border:0;color:#aaa;font-size:15px;cursor:pointer}
      .cps-body{display:flex;flex-direction:column;gap:8px;padding:10px}
      .cps-row{display:flex;gap:6px}
      .cps-btn{flex:1;background:#222;border:1px solid #333;color:#ddd;border-radius:6px;padding:6px 8px;font-size:11px;cursor:pointer}
      .cps-primary{background:#065fd4;border-color:#065fd4;color:#fff}
      .cps-ghost{flex:0 0 auto}
      .cps-btn:hover{filter:brightness(1.14)}
      .cps-status{color:#9aa;font-size:11px;min-height:16px}
      .cps-plan{max-height:120px;overflow:auto;background:#101010;border:1px solid #262626;border-radius:6px;padding:5px}
      .cps-plan-row{display:flex;gap:8px;align-items:center;padding:2px 4px;border-bottom:1px solid #1f1f1f}
      .cps-code{font:600 12px ui-monospace,Consolas,monospace;letter-spacing:.5px}
      .cps-plan-note{color:#8a8a8a;font-size:11px}
      .cps-add{display:flex;gap:6px}
      .cps-add input{flex:1;background:#0d0d0d;border:1px solid #333;color:#e8e8e8;border-radius:6px;padding:5px 7px;font-size:11px}
      .cps-add .cps-btn{flex:0 0 auto}
      .cps-log{height:96px;overflow:auto;background:#101010;border:1px solid #262626;border-radius:6px;padding:5px;font:10px/1.5 ui-monospace,Consolas,monospace}
      .cps-log-line{white-space:pre-wrap}
      .cps-good{color:#5fd68a}.cps-bad{color:#ff7b72}.cps-warn{color:#f0b429}.cps-info{color:#58a6ff}
      #cps-chip{position:fixed;right:18px;bottom:18px;width:38px;height:38px;border-radius:999px;background:#181818;border:1px solid #f0b429;color:#fff;font-size:16px;cursor:pointer}
    `;
  }

  function boot() {
    if (document.documentElement.dataset.cpsBooted) return;
    document.documentElement.dataset.cpsBooted = "1";
    document.head.append(el("style", null, styleSheet()));
    // Only surface the chip where a promo field actually exists (or user forces it).
    build();
    routeTick();
    new MutationObserver(() => {
      if (ui && !document.body.contains(ui.panel) && document.body) document.body.append(ui.panel, ui.chip);
    }).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(routeTick, 1000);

    document.addEventListener("keydown", (e) => {
      if (isTyping()) return;
      if (e.altKey && (e.key === "h" || e.key === "H")) { e.preventDefault(); togglePanel(); }
    }, true);
  }

  function routeTick() {
    if (location.href === state.route) return;
    state.route = location.href;
    if (!ui) build();
    refreshStatus();
    if (ui) {
      const show = hasField() || userPool().some((c) => String(c).includes(normHost() + ":"));
      ui.panel.style.display = "none";
      ui.chip.style.display = show ? "block" : "none";
    }
  }

  boot();
})();
