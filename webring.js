/*!
 * <git-webring> — a tiny, dependency-free Web Component for a personal-site webring.
 *
 * Embed on your member page (two lines):
 *   <script src="https://mdybal.github.io/git-webring/webring.js" defer></script>
 *   <git-webring site="https://yoursite.example/"></git-webring>
 *
 * The widget renders prev / random / next / list links to the other ring members,
 * plus your position ("Member 3 of 17"). It works offline via a 5-minute
 * localStorage cache.
 *
 * Why "git-webring" and not just "webring"? Custom element names must contain
 * a hyphen per spec; we keep the script file short ("webring.js").
 *
 * ── Attributes ────────────────────────────────────────────────────────────
 *   site          (required) URL of the member page; this is the entry used
 *                 to locate "you" in the registry and become the current node.
 *   data-src      (optional) URL of members.json. Defaults to ./members.json
 *                 relative to where webring.js was loaded.
 *   theme         (optional) "light" | "dark" | "auto". Default "auto":
 *                 "auto" respects the visitor's prefers-color-scheme so the
 *                 widget blends with the host page's OS theme.
 *
 * ── Theming (CSS custom properties) ───────────────────────────────────────
 * The widget exposes a small set of tokens on :host. They CASCADE IN from
 * the host page: set them on :root, html, body, or directly on the
 * <git-webring> element. Anything you don't set falls back to a value that
 * tracks currentColor / inherits from the page, so by default the gadget
 * visually belongs to the page.
 *
 *   --wbr-color       text color         (default: #3a2412 parchment / #f1dfb8 night)
 *   --wbr-bg          panel background   (default: #ecdcb8 / #2b1b10)
 *   --wbr-accent-2    secondary accent   (default: #1d6fd1; glow + visited links)
 *   --wbr-strip       title-strip gradient (default: copper→ember→brass)
 *   --wbr-shadow      hard offset shadow color (default: #5b3a14)
 *   --wbr-border      border color       (default: #b07a1f brass)
 *   --wbr-accent      link color         (default: #a8420f light, #ffc857 dark)
 *                     brand-specific color
 *   --wbr-radius      corner radius      (default: 3px)
 *   --wbr-pad-y       vertical padding   (default: 8px)
 *   --wbr-pad-x       horizontal padding (default: 12px)
 *   --wbr-gap         spacing between    (default: 6px)
 *                     nav links
 *   --wbr-font        font family        (default: Georgia, serif)
 *   --wbr-font-size   text size          (default: 14px)
 *   --wbr-logo-size   brand-mark height  (default: 18px)
 *
 * ── Sub-elements (CSS Shadow Parts) ───────────────────────────────────────
 * For surgical edits, the widget exposes parts on key nodes:
 *
 *   git-webring::part(box)       the framed container
 *   git-webring::part(logo)      the brand mark (image or text label)
 *   git-webring::part(bar)       the full-width title bar (logo, title, "?" help link)
 *   git-webring::part(title)     the "RPG Web Ring" title next to an image logo
 *   git-webring::part(help)      the "?" link to the GitHub page
 *   git-webring::part(row)       the prev/random/next/list row
 *   git-webring::part(link)      every nav <a> (incl. list items)
 *   git-webring::part(sep)       the · separator between nav links
 *   git-webring::part(status)    the "Member X of N" caption
 *   git-webring::part(list)      the <details> listing all members
 *   git-webring::part(summary)   the <summary> of the member list
 *
 * ── Members ───────────────────────────────────────────────────────────────
 * Each entry in members.json may optionally include:
 *
 *   "icon"  (string URL) — tiny thumbnail next to the member's name on
 *                          the OTHER sites' nav bars AND inside the
 *                          member list. Used verbatim as an <img src>;
 *                          no same-origin restriction (cross-origin OK
 *                          for an external avatar CDN).
 *   "logo"  (string URL) — brand image that owns the widget on THIS
 *                          member's page (the page that hosts the
 *                          widget). Must resolve to the host page's
 *                          origin: a relative URL is recommended, no
 *                          cross-origin, no data:, no blob:. Falls back
 *                          to a text label when missing or rejected.
 *
 * SCHEMA IS ADDITIVE — older entries without "icon"/"logo" render as
 * before (no thumbnail / text label).
 *
 *   { "id": "...", "name": "...", "url": "...", "added": "YYYY-MM-DD",
 *     "icon": "/avatar.png",            ← optional
 *     "logo": "/webring-logo.svg" }     ← optional
 *
 * ── In-page override (self-hosting) ──────────────────────────────────────
 * Place <script type="application/json" id="webring-members">[ ... ]</script>
 * anywhere in the document. When present, this JSON is used instead of the
 * network fetch. Useful when you want zero CORS surface for your readers.
 *
 * ── Navigation ordering ───────────────────────────────────────────────────
 * Members form a ring in the order they appear in members.json. "Prev"
 * wraps to the last, "next" wraps to the first. "Random" picks any other
 * member in the ring.
 *
 * ── Caching ───────────────────────────────────────────────────────────────
 * Fetched registry is cached in localStorage for 5 minutes. Bump the
 * version in CACHE_KEY only on a breaking schema change.
 */
(function () {
  "use strict";

  var CACHE_KEY = "webring:members:v1";
  var CACHE_TTL_MS = 5 * 60 * 1000;

  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); };

  // Resolve a member-supplied "logo" URL to a usable href.
  // Inputs come from a JSON registry entry whose owner is the page hosting
  // the widget (the entry's URL matched `this.site`). We still resolve
  // against the *host page's* location to ensure the logo is hosted on
  // the SAME origin as the page — no cross-origin requests, no data:/
  // blob: URIs. Returns the resolved absolute URL or null when rejected
  // (caller falls back to a text label).
  function resolveLogo(value) {
    if (!value) return null;
    if (/^\s*(data|blob):/i.test(value)) {
      try { console.warn("git-webring: logo must be a relative URL on the member page; inline data: URIs are not allowed."); } catch (_) {}
      return null;
    }
    var docLoc = null, docOrigin = null;
    try {
      if (typeof document !== "undefined") {
        if (document.location && document.location.href) {
          docLoc = document.location.href;
          docOrigin = document.location.origin;
        } else if (document.baseURI) {
          docLoc = document.baseURI;
        }
      }
    } catch (_) {}
    var href;
    try {
      if (docLoc) {
        var u = new URL(value, docLoc);
        // about:blank base has origin "null" (literal). If we know the page's
        // origin, enforce same-origin. Otherwise (test sandbox etc.) trust
        // the embedder's relative path.
        if (docOrigin && u.origin && u.origin !== "null" && u.origin !== docOrigin) {
          try { console.warn("git-webring: logo must be hosted on the member page (same origin); got", u.href); } catch (_) {}
          return null;
        }
        return u.href;
      }
      return value;
    } catch (_) {
      return null;
    }
  }

  function WebringElement() {
    var self = Reflect.construct(HTMLElement, [], new.target || function () {});
    self._members = null;
    self._error = null;
    self._useShadow = false;
    try {
      self.attachShadow({ mode: "open" });
      self._useShadow = true;
    } catch (_) { /* very old browser: fall back to light DOM */ }
    return self;
  }
  WebringElement.prototype = Object.create(HTMLElement.prototype);
  WebringElement.prototype.constructor = WebringElement;

  Object.defineProperty(WebringElement, "observedAttributes", {
    get: function () { return ["site", "data-src", "theme"]; }
  });

  WebringElement.prototype._root = function () {
    return this._useShadow ? this.shadowRoot : this;
  };

  WebringElement.prototype.connectedCallback = function () {
    this._render();
    this._load();
  };

  WebringElement.prototype.attributeChangedCallback = function () {
    if (this.isConnected) this._render();
  };

  Object.defineProperty(WebringElement.prototype, "site", {
    get: function () { return this.getAttribute("site"); }
  });
  Object.defineProperty(WebringElement.prototype, "theme", {
    get: function () { return this.getAttribute("theme") || "auto"; }
  });

  WebringElement.prototype.dataSrc = function () {
    var explicit = this.getAttribute("data-src");
    if (explicit) return explicit;
    try {
      var scripts = document.getElementsByTagName("script");
      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].src || "";
        if (src && /(?:git-)?webring(?:\.min)?\.js(?:$|\?)/.test(src)) {
          return new URL("members.json", src).href;
        }
      }
    } catch (_) { /* ignore */ }
    return "members.json";
  };

  WebringElement.prototype._load = async function () {
    // 1) Inline override wins.
    var inline = document.getElementById("webring-members");
    if (inline && inline.textContent.trim()) {
      try {
        var data = JSON.parse(inline.textContent);
        if (!Array.isArray(data)) throw new Error("Inline JSON must be an array of members.");
        this._members = data;
        this._error = null;
      } catch (e) {
        this._error = "Inline #webring-members is not valid JSON (" + e.message + ").";
      }
      this._render();
      return;
    }

    // 2) Cached copy (<5 min old)?
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Date.now() - parsed.at < CACHE_TTL_MS && parsed.src === this.dataSrc() && Array.isArray(parsed.data)) {
          this._members = parsed.data;
          this._render();
          return;
        }
      }
    } catch (_) { /* bad cache, ignore */ }

    // 3) Fetch.
    try {
      var res = await fetch(this.dataSrc(), { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data2 = await res.json();
      if (!Array.isArray(data2)) throw new Error("members.json must be an array");
      for (var j = 0; j < data2.length; j++) {
        var m = data2[j];
        if (!m || typeof m.url !== "string" || typeof m.name !== "string") {
          throw new Error('Each member needs at least a "name" and "url" string.');
        }
      }
      this._members = data2;
      this._error = null;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: data2, src: this.dataSrc() }));
      } catch (_) { /* storage may be disabled */ }
    } catch (e) {
      this._error = "Could not load members (" + e.message + ").";
    } finally {
      this._render();
    }
  };

  WebringElement.prototype._findIndex = function () {
    if (!Array.isArray(this._members) || !this.site) return -1;
    var norm = function (u) { return (u || "").replace(/\/+$/, "").toLowerCase(); };
    return this._members.findIndex(function (m) { return norm(m.url) === norm(this.site); }, this);
  };

  WebringElement.prototype._styles = function () {
    // All properties listed below are FALLBACKS — a host page can override
    // any of them by setting the same custom property on :root, html, body,
    // or directly on the <git-webring> element. Defaults intentionally
    // inherit from currentColor so the widget visually belongs to the page.
    // Default look: "guild banner" - a parchment plaque with a brass bevel
    // (88x31-badge style), palette borrowed from twojestarerpg.pl.
    var night = "--wbr-color:#f1dfb8;--wbr-bg:#2b1b10;--wbr-border:#c9922e;" +
      "--wbr-accent:#ffc857;--wbr-accent-2:#4aa3ff;--wbr-strip:linear-gradient(90deg,#5a2a12,#b4501f,#7a5410);" +
      "--wbr-shadow:#0e0803;";
    return [
      ":host{display:block;",
      "font:var(--wbr-font-size,14px)/1.45 var(--wbr-font,Georgia,'Times New Roman',serif);",
      "--wbr-color:#3a2412;",
      "--wbr-bg:#ecdcb8;",
      "--wbr-border:#b07a1f;",
      "--wbr-accent:#a8420f;",
      "--wbr-accent-2:#1d6fd1;",
      "--wbr-strip:linear-gradient(90deg,#b4501f,#f08a24,#e3b341,#f08a24,#b4501f);",
      "--wbr-shadow:#5b3a14;",
      "--wbr-radius:3px;",
      "--wbr-pad-y:8px;",
      "--wbr-pad-x:12px;",
      "--wbr-gap:6px;",
      "--wbr-font-size:14px;",
      "--wbr-logo-size:18px;",
      "color:var(--wbr-color);}",
      ":host([hidden]){display:none;}",
      // "auto" follows the visitor's OS scheme; light/dark force a variant.
      "@media (prefers-color-scheme: dark){",
      ":host(:not([theme=light])){" + night + "}}",
      ":host([theme=dark]){" + night + "}",
      // Beveled plaque + hard offset shadow, 90s badge style.
      ".wbr-box{border:3px double var(--wbr-border);border-radius:var(--wbr-radius);",
      "padding:0 0 var(--wbr-pad-y);background:var(--wbr-bg);color:var(--wbr-color);",
      "box-shadow:2px 2px 0 var(--wbr-shadow),inset 0 0 0 1px rgba(255,255,255,.35);overflow:hidden;}",
      ".wbr-row{display:flex;flex-wrap:nowrap;gap:var(--wbr-gap);align-items:stretch;padding:var(--wbr-pad-y) var(--wbr-pad-x) 0;}",
      ".wbr-row>:not(.wbr-sep){flex:1 1 0;min-width:0;text-align:center;justify-content:center;}",
      ".wbr-row a,.wbr-row a:visited{display:inline-flex;align-items:center;justify-content:center;gap:4px;color:var(--wbr-accent);",
      "font-weight:700;text-decoration:none;padding:3px 8px;border:2px outset var(--wbr-border);",
      "border-radius:2px;background:rgba(255,255,255,.35);min-height:1.8em;}",
      // Title bar: full-width gradient header (brand/title left, "?" right).
      ".wbr-bar{display:flex;align-items:center;gap:8px;padding:3px 8px 3px var(--wbr-pad-x);background:var(--wbr-strip);",
      "background-size:200% 100%;animation:wbr-shine 6s linear infinite;border-bottom:2px solid var(--wbr-border);}",
      ".wbr-label{display:inline-block;font-family:Cinzel,'Trajan Pro',Georgia,serif;font-weight:700;font-size:12px;",
      "letter-spacing:.12em;text-transform:uppercase;color:#fff4d6;text-shadow:1px 1px 0 rgba(0,0,0,.45);}",
      ".wbr-label:before{content:'\\2726 ';}.wbr-label:after{content:' \\2726';}",
      ".wbr-logo{height:var(--wbr-logo-size);width:auto;object-fit:contain;display:block;}",
      ".wbr-help,.wbr-help:visited{margin-left:auto;display:inline-flex;align-items:center;justify-content:center;",
      "width:16px;height:16px;border-radius:50%;font:700 11px/1 Georgia,serif;color:#fff4d6;background:rgba(0,0,0,.3);",
      "border:1px solid #fff4d6;text-decoration:none;}",
      ".wbr-help:hover,.wbr-help:focus{background:var(--wbr-accent-2);outline:none;box-shadow:0 0 6px var(--wbr-accent-2);}",
      ".wbr-row a:hover,.wbr-row a:focus{background:var(--wbr-strip);color:#fff4d6;text-decoration:none;outline:none;box-shadow:0 0 6px var(--wbr-accent-2);}",
      ".wbr-row a:active{border-style:inset;transform:translate(1px,1px);}",
      ".wbr-row a:focus-visible{outline:2px dotted var(--wbr-accent-2);outline-offset:2px;}",
      ".wbr-sep{color:var(--wbr-accent);opacity:.6;font-size:10px;align-self:center;}",
      // Status line (errors only — no "Member X of N" caption).
      ".wbr-status{display:block;margin:4px var(--wbr-pad-x) 0;font:11px/1.5 ui-monospace,Consolas,monospace;color:var(--wbr-accent-2);opacity:.9;}",
      ".wbr-status.wbr-err{color:#b74b3a;opacity:1;}",
      ".wbr-jump-img{height:calc(var(--wbr-logo-size) - 4px);width:auto;vertical-align:middle;}",
      ".wbr-list{margin:8px var(--wbr-pad-x) 0;padding:6px 0 0;border-top:2px dotted var(--wbr-border);}",
      ".wbr-list summary{cursor:pointer;padding:2px 0;font-weight:700;color:var(--wbr-accent);}",
      ".wbr-list ul{margin:0;padding:0;list-style:none;}",
      ".wbr-list li{padding:3px 0;border-top:1px dotted var(--wbr-border);}",
      ".wbr-list li a{color:var(--wbr-accent);}",
      ".wbr-list li a:visited{color:var(--wbr-accent-2);}",
      "@keyframes wbr-shine{to{background-position:-200% 0;}}",
      "@media (prefers-reduced-motion: reduce){.wbr-bar{animation:none;}}"
    ].join("");
  };

  WebringElement.prototype._render = function () {
    var idx = this._findIndex();
    var members = Array.isArray(this._members) ? this._members : [];
    var total = members.length;
    var fallbackAnchor = members[0] ? members[0].url : "#";
    var showingRing = idx >= 0 && total > 0;

    // Brand mark: this is the host member's own logo (read from the
    // "logo" field of their entry in members.json). <img> when a
    // same-origin URL resolves, otherwise a text label.
    var me = (idx >= 0 && idx < total) ? members[idx] : null;
    var rawLogo = me && typeof me.logo === "string" ? me.logo : "";
    var logoSrc = resolveLogo(rawLogo);
    var labelHtml;
    if (logoSrc) {
      labelHtml = '<img class="wbr-logo" src="' + esc(logoSrc) + '" alt="" loading="lazy" decoding="async" part="logo">' +
        '<span class="wbr-label" part="title">RPG Web Ring</span>';
    } else {
      labelHtml = '<span class="wbr-label" part="logo">RPG Web Ring</span>';
    }

    // Per-member icon (optional): small thumbnail inside the prev/next
    // nav links AND inside the member list. Lazily loaded.
    var memberIcon = function (m) {
      return m && typeof m.icon === "string" && m.icon
        ? '<img class="wbr-jump-img" src="' + esc(m.icon) + '" alt="" loading="lazy" decoding="async">'
        : "";
    };
    var linkHtml = function (m, dir, label) {
      var arrowBefore = (dir === "prev" ) ? "\u2190 " : "";
      var arrowAfter  = (dir === "next") ? " \u2192" : "";
      var inner = arrowBefore + memberIcon(m) + label + arrowAfter;
      return '<a href="' + esc(m.url) + '" rel="' + esc(dir) + '" part="link">' + inner + '</a>';
    };

    var barHtml =
      '<div class="wbr-bar" part="bar">' + labelHtml +
        '<a class="wbr-help" part="help" href="https://mdybal.github.io/git-webring/" target="_blank" rel="noopener" title="What is this? (git-webring on GitHub)" aria-label="About this webring">?</a>' +
      '</div>';
    var body;
    if (showingRing && total > 1) {
      var prev = members[(idx - 1 + total) % total];
      var next = members[(idx + 1) % total];
      var randomIdx = Math.floor(Math.random() * total);
      if (members[randomIdx].url === this.site) randomIdx = (randomIdx + 1) % total;
      var random = members[randomIdx];

      body =
        '<div class="wbr-box" part="box">' + barHtml +
          '<div class="wbr-row" part="row">' +
            linkHtml(prev, "prev", esc(prev.name)) +
            '<span class="wbr-sep" part="sep" aria-hidden="true">\u2726</span>' +
            linkHtml(random, "random", "Losowa") +
            '<span class="wbr-sep" part="sep" aria-hidden="true">\u2726</span>' +
            linkHtml(next, "next", esc(next.name)) +
          '</div>' +
        '</div>';
    } else if (showingRing) {
      // Sole member: don't render meaningless prev/next/random.
      body =
        '<div class="wbr-box" part="box">' + barHtml +
          '<div class="wbr-row" part="row">' +
            '<span>Jesteś pierwszym członkiem! Zaproś innych przez PR.</span>' +
          '</div>' +
        '</div>';
    } else if (members.length > 0 || this._error) {
      // We have data (or tried-and-failed) but this site is not a member.
      var errLine = this._error
        ? '<div class="wbr-status wbr-err" part="status">' + esc(this._error) + '</div>'
        : "";
      body =
        '<div class="wbr-box" part="box">' + barHtml +
          '<div class="wbr-row" part="row">' +
            '<span>Ta strona nie jest jeszcze członkiem. <a href="' + esc(fallbackAnchor) + '" part="link">Dołącz do kręgu \u2192</a></span>' +
          '</div>' +
          errLine +
        '</div>';
    } else {
      body =
        '<div class="wbr-box" part="box">' + barHtml +
          '<div class="wbr-row" part="row">' +
            '<span>Sprawdzanie członkostwa\u2026</span>' +
          '</div>' +
        '</div>';
    }

    var listHtml = "";
    if (members.length) {
      var items = members.map(function (m) {
        var icon = m && typeof m.icon === "string" && m.icon
          ? '<img class="wbr-jump-img" src="' + esc(m.icon) + '" alt="" loading="lazy" decoding="async"> '
          : "";
        return '<li>' + icon + '<a href="' + esc(m.url) + '" part="link">' + esc(m.name) + '</a></li>';
      }).join("");
      listHtml =
        '<details id="wbr-members" class="wbr-list" part="list">' +
          '<summary part="summary">Członkowie (' + members.length + ')</summary>' +
          '<ul>' + items + '</ul>' +
        '</details>';
    }

    this._root().innerHTML =
      "<style>" + this._styles() + "</style>" + body.replace(/<\/div>$/, listHtml + "</div>");
  };

  if (!customElements.get("git-webring")) {
    customElements.define("git-webring", WebringElement);
  }
})();
