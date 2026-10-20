/*!
 * <webring> — a tiny, dependency-free Web Component for joining a webring.
 *
 * Usage on your site:
 *   <script src="https://YOUR-HOST/git-webring/webring.js" defer></script>
 *   <webring site="https://yoursite.example/"></webring>
 *
 * Attributes:
 *   - site      (required) URL of the current site's homepage. Used to look up
 *               the member in the registry and become the "current" node.
 *   - data-src  (optional) URL of members.json. Defaults to ./members.json
 *               relative to where webring.js was loaded from.
 *   - theme     (optional) "light" | "dark". Defaults to "light".
 *
 * In-page override (self-hosting):
 *   Place <script type="application/json" id="webring-members">[ ... ]</script>
 *   anywhere in the document. When present, this JSON is used instead of the
 *   network fetch. Useful when you want zero CORS surface for your readers.
 *
 * Navigation ordering:
 *   Members form a ring in the order they appear in `members.json`. "Previous"
 *   wraps to the last, "next" wraps to the first. "Random" picks any other
 *   member in the ring.
 *
 * Caching:
 *   Fetched registry is cached in localStorage for 5 minutes. Bump the version
 *   in CACHE_KEY if you change the schema in a breaking way.
 */
(function () {
  "use strict";

  var CACHE_KEY = "webring:members:v1";
  var CACHE_TTL_MS = 5 * 60 * 1000;

  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); };

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
    get: function () { return this.getAttribute("theme") || "light"; }
  });

  WebringElement.prototype.dataSrc = function () {
    var explicit = this.getAttribute("data-src");
    if (explicit) return explicit;
    try {
      var scripts = document.getElementsByTagName("script");
      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].src || "";
        if (src && /webring(?:\.min)?\.js(?:$|\?)/.test(src)) {
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
    var dark = this.theme === "dark";
    return [
      ":host{display:block;",
      "font:14px/1.45 system-ui,-apple-system,\"Segoe UI\",Roboto,Helvetica,Arial,sans-serif;",
      "--wbr-fg:" + (dark ? "#eee" : "#111") + ";",
      "--wbr-bg:" + (dark ? "#111" : "#fff") + ";",
      "--wbr-muted:" + (dark ? "#888" : "#666") + ";",
      "--wbr-border:" + (dark ? "#333" : "#ddd") + ";",
      "--wbr-accent:#0366d6;",
      "color:var(--wbr-fg);",
      "background:var(--wbr-bg);}",
      ":host([hidden]){display:none;}",
      ".wbr-box{border:1px solid var(--wbr-border);border-radius:6px;padding:10px 14px;background:var(--wbr-bg);}",
      ".wbr-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}",
      ".wbr-row a{color:var(--wbr-accent);text-decoration:none;}",
      ".wbr-row a:hover,.wbr-row a:focus{text-decoration:underline;}",
      ".wbr-label{font-weight:600;margin-right:2px;}",
      ".wbr-sep{opacity:.5;}",
      ".wbr-status{font-size:12px;color:var(--wbr-muted);margin-top:6px;}",
      ".wbr-err{color:#b00;}",
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

    var body;
    if (showingRing && total > 1) {
      var prev = members[(idx - 1 + total) % total];
      var next = members[(idx + 1) % total];
      var randomIdx = Math.floor(Math.random() * total);
      if (members[randomIdx].url === this.site) randomIdx = (randomIdx + 1) % total;
      var random = members[randomIdx];

      body =
        "<div class=\"wbr-box\">" +
          "<div class=\"wbr-row\">" +
            "<span class=\"wbr-label\">git-webring</span>" +
            "<a href=\"" + esc(prev.url) + "\" rel=\"prev\">\u2190 " + esc(prev.name) + "</a>" +
            "<span class=\"wbr-sep\" aria-hidden=\"true\">\u00b7</span>" +
            "<a href=\"" + esc(random.url) + "\" rel=\"random\">random</a>" +
            "<span class=\"wbr-sep\" aria-hidden=\"true\">\u00b7</span>" +
            "<a href=\"" + esc(next.url) + "\" rel=\"next\">" + esc(next.name) + " \u2192</a>" +
            "<span class=\"wbr-sep\" aria-hidden=\"true\">\u00b7</span>" +
            "<a href=\"#wbr-members\">list</a>" +
          "</div>" +
          "<div class=\"wbr-status\">Member " + (idx + 1) + " of " + total + ".</div>" +
        "</div>";
    } else if (showingRing) {
      // Sole member: don't render meaningless prev/next/random.
      body =
        "<div class=\"wbr-box\">" +
          "<div class=\"wbr-row\">" +
            "<span class=\"wbr-label\">git-webring</span>" +
            "<span>You're the first member! Invite others via PR.</span>" +
          "</div>" +
          "<div class=\"wbr-status\">Member 1 of 1.</div>" +
        "</div>";
    } else if (members.length > 0 || this._error) {
      // We have data (or tried-and-failed) but this site is not a member.
      var errLine = this._error
        ? "<div class=\"wbr-status wbr-err\">" + esc(this._error) + "</div>"
        : "";
      body =
        "<div class=\"wbr-box\">" +
          "<span class=\"wbr-label\">git-webring</span>" +
          "<span>This site isn\u2019t a member yet. <a href=\"" + esc(fallbackAnchor) + "\">Join the ring \u2192</a></span>" +
          errLine +
        "</div>";
    } else {
      body =
        "<div class=\"wbr-box\">" +
          "<span class=\"wbr-label\">git-webring</span>" +
          "<span>Checking membership\u2026</span>" +
        "</div>";
    }

    var listHtml = "";
    if (members.length) {
      var items = members.map(function (m) {
        return "<li><a href=\"" + esc(m.url) + "\">" + esc(m.name) + "</a></li>";
      }).join("");
      listHtml =
        "<details id=\"wbr-members\" class=\"wbr-box wbr-list\">" +
          "<summary>Members (" + members.length + ")</summary>" +
          "<ul>" + items + "</ul>" +
        "</details>";
    }

    this._root().innerHTML =
      "<style>" + this._styles() + "</style>" + body + listHtml;
  };

  if (!customElements.get("webring")) {
    customElements.define("webring", WebringElement);
  }
})();
