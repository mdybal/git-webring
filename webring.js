/*!
 * <git-webring> — a tiny, dependency-free Web Component for a personal-site webring.
 *
 * Embed on your member page (two lines):
 *   <script src="https://mdybal.github.io/git-webring/webring.js" defer></script>
 *   <git-webring site="https://yoursite.example/" logo="/webring-logo.svg"></git-webring>
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
 *   logo          (optional) Relative URL to a brand image. Must resolve to
 *                 the SAME origin as the page hosting the widget (no
 *                 cross-origin, no data: URIs, no blob:). Falls back to a
 *                 text label "git-webring" when missing or rejected.
 *   logo-width    (optional) Inline width on the brand <img>, e.g. "32px".
 *                 Default "auto" (height follows --wbr-logo-size, set on :host).
 *   logo-height   (optional) Inline height on the brand <img>, e.g. "32px".
 *                 Default "18px" via --wbr-logo-size if logo-width not set.
 *
 * ── Theming (CSS custom properties) ───────────────────────────────────────
 * The widget exposes a small set of tokens on :host. They CASCADE IN from
 * the host page: set them on :root, html, body, or directly on the
 * <git-webring> element. Anything you don't set falls back to a value that
 * tracks currentColor / inherits from the page, so by default the gadget
 * visually belongs to the page.
 *
 *   --wbr-color       text color         (default: currentColor)
 *   --wbr-bg          panel background   (default: transparent)
 *   --wbr-border      border color       (default: currentColor)
 *   --wbr-accent      link color / only  (default: #0366d6 light, #58a6ff dark)
 *                     brand-specific color
 *   --wbr-radius      corner radius      (default: 6px)
 *   --wbr-pad-y       vertical padding   (default: 10px)
 *   --wbr-pad-x       horizontal padding (default: 14px)
 *   --wbr-gap         spacing between    (default: 8px)
 *                     nav links
 *   --wbr-font        font family        (default: inherit — match page)
 *   --wbr-font-size   text size          (default: 14px)
 *   --wbr-logo-size   brand-mark height  (default: 18px)
 *
 * ── Sub-elements (CSS Shadow Parts) ───────────────────────────────────────
 * For surgical edits, the widget exposes parts on key nodes:
 *
 *   git-webring::part(box)       the framed container
 *   git-webring::part(logo)      the brand mark (image or text label)
 *   git-webring::part(row)       the prev/random/next/list row
 *   git-webring::part(link)      every nav <a> (incl. list items)
 *   git-webring::part(sep)       the · separator between nav links
 *   git-webring::part(status)    the "Member X of N" caption
 *   git-webring::part(list)      the <details> listing all members
 *   git-webring::part(summary)   the <summary> of the member list
 *
 * ── Members ───────────────────────────────────────────────────────────────
 * Each entry in members.json may optionally include "icon" (string URL).
 * When present, the prev/next/random links render a tiny thumbnail; the
 * member list also shows the icon next to each name. SCHEMA IS ADDITIVE —
 * older entries without "icon" continue to render as before.
 *
 *   { "id": "...", "name": "...", "url": "...", "added": "YYYY-MM-DD",
 *     "icon": "/avatar.png" }   ← optional
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

  // Resolve the `logo` attribute to a usable URL.
  // Policy: only relative URLs hosted on the SAME origin as the page that
  // contains the widget are accepted. data: / blob: are rejected because
  // they're not "hosted on the member page". Cross-origin (https://other…)
  // is rejected to keep zero third-party requests for branding.
  // Returns the resolved URL string or null when rejected (caller falls
  // back to a text label).
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
    get: function () { return ["site", "data-src", "theme", "logo", "logo-width", "logo-height"]; }
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
  Object.defineProperty(WebringElement.prototype, "logoAttr", {
    get: function () { return this.getAttribute("logo"); }
  });
  Object.defineProperty(WebringElement.prototype, "logoWidthAttr", {
    get: function () { return this.getAttribute("logo-width"); }
  });
  Object.defineProperty(WebringElement.prototype, "logoHeightAttr", {
    get: function () { return this.getAttribute("logo-height"); }
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
    return [
      ":host{display:block;",
      "font:var(--wbr-font-size,14px)/1.45 var(--wbr-font,inherit);",
      "--wbr-color:currentColor;",
      "--wbr-bg:transparent;",
      "--wbr-border:currentColor;",
      "--wbr-accent:#0366d6;",
      "--wbr-radius:6px;",
      "--wbr-pad-y:10px;",
      "--wbr-pad-x:14px;",
      "--wbr-gap:8px;",
      "--wbr-font-size:14px;",
      "--wbr-logo-size:18px;",
      "color:var(--wbr-color);",
      "background:var(--wbr-bg);}",
      ":host([hidden]){display:none;}",
      // Auto / explicit theme: only the brand-specific accent color shifts.
      // "auto" = "follow system when no explicit theme is set".
      "@media (prefers-color-scheme: dark){",
      ":host(:not([theme=light])){--wbr-accent:#58a6ff;}}",
      ":host([theme=dark]){--wbr-accent:#58a6ff;}",
      ":host([theme=light]){--wbr-accent:#0366d6;}",
      // Layout.
      ".wbr-box{border:1px solid var(--wbr-border);border-radius:var(--wbr-radius);padding:var(--wbr-pad-y) var(--wbr-pad-x);background:var(--wbr-bg);}",
      ".wbr-row{display:flex;flex-wrap:wrap;gap:var(--wbr-gap);align-items:center;}",
      ".wbr-row a,.wbr-row a:visited{color:var(--wbr-accent);text-decoration:none;}",
      ".wbr-row a:hover,.wbr-row a:focus,.wbr-row a:active{text-decoration:underline;}",
      ".wbr-label{font-weight:600;display:inline-flex;align-items:center;gap:6px;}",
      ".wbr-logo{height:var(--wbr-logo-size);width:auto;vertical-align:middle;display:inline-block;}",
      ".wbr-sep{color:var(--wbr-color);opacity:.4;}",
      ".wbr-status{font-size:12px;color:var(--wbr-color);opacity:.7;margin-top:6px;}",
      ".wbr-status.wbr-err{color:#b00;opacity:1;}",
      ".wbr-jump-img{height:calc(var(--wbr-logo-size) - 4px);width:auto;vertical-align:middle;}",
      ".wbr-list{margin-top:8px;}",
      ".wbr-list ul{margin:8px 0 0;padding-left:18px;}",
      ".wbr-list summary{cursor:pointer;}"
    ].join("");
  };

  WebringElement.prototype._render = function () {
    var idx = this._findIndex();
    var members = Array.isArray(this._members) ? this._members : [];
    var total = members.length;
    var fallbackAnchor = members[0] ? members[0].url : "#";
    var showingRing = idx >= 0 && total > 0;

    // Brand mark: <img> if a same-origin logo resolves, otherwise text.
    var logoSrc = resolveLogo(this.logoAttr);
    var labelHtml;
    if (logoSrc) {
      var styleBits = "";
      if (this.logoHeightAttr) styleBits += "height:" + esc(this.logoHeightAttr) + ";";
      if (this.logoWidthAttr)  styleBits += "width:"  + esc(this.logoWidthAttr)  + ";";
      var styleAttr = styleBits ? ' style="' + styleBits + '"' : "";
      labelHtml = '<img class="wbr-logo" src="' + esc(logoSrc) + '" alt="git-webring" loading="lazy" decoding="async" part="logo"' + styleAttr + '>';
    } else {
      labelHtml = '<span class="wbr-label" part="logo">git-webring</span>';
    }

    // Per-member icon (optional): small thumbnail inside the prev/next
    // nav links AND inside the member list. Lazily loaded.
    var memberIcon = function (m) {
      return m && typeof m.icon === "string" && m.icon
        ? '<img class="wbr-jump-img" src="' + esc(m.icon) + '" alt="" loading="lazy" decoding="async">'
        : "";
    };
    var linkHtml = function (m, dir, label) {
      var arrowBefore = (dir === "prev" || dir === "random") ? "\u2190 " : "";
      var arrowAfter  = (dir === "next") ? " \u2192" : "";
      var inner = arrowBefore + memberIcon(m) + label + arrowAfter;
      return '<a href="' + esc(m.url) + '" rel="' + esc(dir) + '" part="link">' + inner + '</a>';
    };

    var body;
    if (showingRing && total > 1) {
      var prev = members[(idx - 1 + total) % total];
      var next = members[(idx + 1) % total];
      var randomIdx = Math.floor(Math.random() * total);
      if (members[randomIdx].url === this.site) randomIdx = (randomIdx + 1) % total;
      var random = members[randomIdx];

      body =
        '<div class="wbr-box" part="box">' +
          '<div class="wbr-row" part="row">' +
            labelHtml +
            linkHtml(prev, "prev", esc(prev.name)) +
            '<span class="wbr-sep" part="sep" aria-hidden="true">\u00b7</span>' +
            linkHtml(random, "random", "random") +
            '<span class="wbr-sep" part="sep" aria-hidden="true">\u00b7</span>' +
            linkHtml(next, "next", esc(next.name)) +
            '<span class="wbr-sep" part="sep" aria-hidden="true">\u00b7</span>' +
            '<a href="#wbr-members" part="link">list</a>' +
          '</div>' +
          '<div class="wbr-status" part="status">Member ' + (idx + 1) + ' of ' + total + '.</div>' +
        '</div>';
    } else if (showingRing) {
      // Sole member: don't render meaningless prev/next/random.
      body =
        '<div class="wbr-box" part="box">' +
          '<div class="wbr-row" part="row">' +
            labelHtml +
            '<span>You\u2019re the first member! Invite others via PR.</span>' +
          '</div>' +
          '<div class="wbr-status" part="status">Member 1 of 1.</div>' +
        '</div>';
    } else if (members.length > 0 || this._error) {
      // We have data (or tried-and-failed) but this site is not a member.
      var errLine = this._error
        ? '<div class="wbr-status wbr-err" part="status">' + esc(this._error) + '</div>'
        : "";
      body =
        '<div class="wbr-box" part="box">' +
          '<div class="wbr-row" part="row">' +
            labelHtml +
            '<span>This site isn\u2019t a member yet. <a href="' + esc(fallbackAnchor) + '" part="link">Join the ring \u2192</a></span>' +
          '</div>' +
          errLine +
        '</div>';
    } else {
      body =
        '<div class="wbr-box" part="box">' +
          '<div class="wbr-row" part="row">' +
            labelHtml +
            '<span>Checking membership\u2026</span>' +
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
        '<details id="wbr-members" class="wbr-box wbr-list" part="list">' +
          '<summary part="summary">Members (' + members.length + ')</summary>' +
          '<ul>' + items + '</ul>' +
        '</details>';
    }

    this._root().innerHTML =
      "<style>" + this._styles() + "</style>" + body + listHtml;
  };

  if (!customElements.get("git-webring")) {
    customElements.define("git-webring", WebringElement);
  }
})();
