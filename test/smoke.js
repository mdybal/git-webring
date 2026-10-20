/* Tiny smoke test for webring.js. Runs under Node 20+ with a minimal DOM stub. */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const SRC = fs.readFileSync(path.join(__dirname, "..", "webring.js"), "utf8");

const registry = new Map();
class FakeHTMLElement {
  constructor() {
    this.attrs = {};
    this.shadowRoot = null;
    this.isConnected = true;
  }
  static get observedAttributes() { return []; }
  attachShadow(_init) {
    this.shadowRoot = { innerHTML: "" };
    return this.shadowRoot;
  }
  getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  attributeChangedCallback() {}
  connectedCallback() {}
}

// Fixture note: document.location is set so the new same-origin enforcement
// on the `logo` attribute has a deterministic answer in the smoke tests.
const document = {
  _elements: new Map(),
  getElementById(id) { return this._elements.get(id) || null; },
  getElementsByTagName() { return []; },
  createElement(tag) { return tag === "script" ? { src: "", textContent: "", type: "" } : null; },
  location: { href: "https://test.example/index.html", origin: "https://test.example" }
};

const customElements = {
  define(name, ctor) { registry.set(name, ctor); },
  get(name) { return registry.get(name); }
};

const sandbox = {
  document: document,
  customElements: customElements,
  HTMLElement: FakeHTMLElement,
  Reflect: Reflect,
  URL: URL,
  fetch: async () => { throw new Error("fetch disabled in test"); },
  localStorage: {
    _store: new Map(),
    getItem(k) { return this._store.has(k) ? this._store.get(k) : null; },
    setItem(k, v) { this._store.set(k, v); }
  },
  console: console
};
sandbox.window = sandbox;

vm.runInNewContext(SRC, sandbox, { filename: "webring.js" });

const WbrCtor = registry.get("git-webring");
if (!WbrCtor) { console.error("FAIL: <git-webring> not registered"); process.exit(1); }

async function withMembers(members, site) {
  document._elements.set("webring-members", { textContent: JSON.stringify(members) });
  const e = new WbrCtor();
  e.shadowRoot = { innerHTML: "" };
  if (site) e.setAttribute("site", site);
  await e._load();
  return e;
}

(async () => {
  var pass = 0, fail = 0;
  function assert(name, cond, info) {
    if (cond) { pass++; console.log("  PASS " + name); }
    else { fail++; console.error("  FAIL " + name + (info ? "" : ""), info || ""); }
  }

  // 1) single member
  var e1 = await withMembers([{ id: "a", name: "Alice", url: "https://example.com/" }], "https://example.com/");
  var h1 = e1.shadowRoot.innerHTML;
  assert("single member shows the 'first member' message", /pierwszym członkiem/.test(h1), h1);
  assert("single member omits prev/next/random", !/rel="prev[" ]/.test(h1) && !/rel="next[" ]/.test(h1) && !/rel="random[" ]/.test(h1), h1);

  // 2) ring of 3, current = middle (bob)
  var ring = [
    { id: "a", name: "Alice", url: "https://alice.example/" },
    { id: "b", name: "Bob",   url: "https://bob.example/"   },
    { id: "c", name: "Carol", url: "https://carol.example/" }
  ];
  var e2 = await withMembers(ring, "https://bob.example/");
  var h2 = e2.shadowRoot.innerHTML;
  assert("bob appears among the list items", (h2.match(/<li>[^<]*<a [^>]*>Bob[^<]*<\/a>/g)||[]).length === 1, h2);
  assert("bob prev is Alice",   /rel="prev[" ][^>]*>[^<]*Alice/.test(h2), h2);
  assert("bob next is Carol",   /rel="next[" ][^>]*>Carol/.test(h2), h2);
  assert("bob has 3 list items", (h2.match(/<li>/g) || []).length === 3, h2);

  // 3a) unknown site, empty registry -> fetch path
  var e3 = await withMembers([], "https://nobody.example/");
  var h3 = e3.shadowRoot.innerHTML;
  assert("empty registry shows the checking-membership message", /Sprawdzanie członkostwa/.test(h3), h3);

  // 3b) unknown site, non-empty registry -> Join CTA
  var e4 = await withMembers([{ id: "a", name: "Alice", url: "https://alice.example/" }], "https://nobody.example/");
  var h4 = e4.shadowRoot.innerHTML;
  assert("unknown site gets Join CTA", /Dołącz do kręgu/.test(h4), h4);

  // 4) trailing slash normalization
  var e5 = await withMembers([
    { id: "a", name: "Alice", url: "https://alice.example/" },
    { id: "b", name: "Bob",   url: "https://bob.example/" }
  ], "https://alice.example");
  var h5 = e5.shadowRoot.innerHTML;
  assert("missing trailing slash still matches", /rel="prev[" ][^>]*>[^<]*Bob/.test(h5), h5);

  // 5) wrap: first member's prev wraps to last
  var ring6 = [
    { id: "a", name: "Alice", url: "https://alice.example/" },
    { id: "b", name: "Bob",   url: "https://bob.example/"   },
    { id: "c", name: "Carol", url: "https://carol.example/" }
  ];
  var e6 = await withMembers(ring6, "https://alice.example/");
  var h6 = e6.shadowRoot.innerHTML;
  assert("first member prev wraps to Carol", /rel="prev[" ][^>]*>[^<]*Carol/.test(h6), h6);
  assert("first member next is Bob",         /rel="next[" ][^>]*>Bob/.test(h6), h6);
  // last member's next wraps to first
  var e6b = await withMembers(ring6, "https://carol.example/");
  var h6b = e6b.shadowRoot.innerHTML;
  assert("last member next wraps to Alice",   /rel="next[" ][^>]*>Alice/.test(h6b), h6b);

  // 6) bad inline JSON
  document._elements.set("webring-members", { textContent: "{not-json" });
  var e7 = new WbrCtor();
  e7.shadowRoot = { innerHTML: "" };
  e7.setAttribute("site", "https://x.example/");
  await e7._load();
  assert("bad inline JSON surfaces error styling", /wbr-err/.test(e7.shadowRoot.innerHTML), e7.shadowRoot.innerHTML);
// 7) logo slot: a relative "logo" on the CURRENT member (matched by site)
  //     renders an <img>; same-origin enforcement is preserved.
  var ringWithLogo = [
    { id: "a", name: "Alice", url: "https://alice.example/" },
    { id: "b", name: "Bob",   url: "https://bob.example/",   logo: "/webring-logo.svg" },
    { id: "c", name: "Carol", url: "https://carol.example/" }
  ];
  var e8 = await withMembers(ringWithLogo, "https://bob.example/");
  e8.shadowRoot = { innerHTML: "" };
  e8._render();
  var h8 = e8.shadowRoot.innerHTML;
  assert("member logo renders <img class=\"wbr-logo\">",
    /<img class=\"wbr-logo\"[^>]*src=\"[^\"]*webring-logo\.svg\"/.test(h8), h8);
  assert("member logo <img> carries part=\"logo\"",
    /class=\"wbr-logo\"[^>]*part=\"logo\"/.test(h8), h8);
  assert("member logo <img> is decorative (alt empty) next to the visible title",
    /<img class=\"wbr-logo\"[^>]*alt=\"\"/.test(h8) && /RPG Web Ring/.test(h8), h8);
  assert("non-current member's logo is NOT used",
    !/src=\"[^\"]*alice/.test(h8), h8);

  // 7b) Obsolete widget-level `logo` attribute is silently ignored:
  // only the JSON entry's "logo" is read.
  var e8b = await withMembers(ringWithLogo, "https://bob.example/");
  e8b.shadowRoot = { innerHTML: "" };
  e8b.setAttribute("logo", "/some-other.svg");
  e8b._render();
  var h8b = e8b.shadowRoot.innerHTML;
  assert("logo attribute on the element is ignored when JSON entry has logo",
    /<img class=\"wbr-logo\"[^>]*src=\"[^\"]*webring-logo\.svg\"/.test(h8b) &&
    !/some-other\.svg/.test(h8b), h8b);

  // 7c) A member WITHOUT "logo" falls back to the text label, even when a
  // sibling member has one.
  var e8c = await withMembers(ringWithLogo, "https://alice.example/");
  e8c.shadowRoot = { innerHTML: "" };
  e8c._render();
  var h8c = e8c.shadowRoot.innerHTML;
  assert("member WITHOUT \"logo\" renders text label (no <img class=\"wbr-logo\">)",
    !/<img class=\"wbr-logo\"/.test(h8c) &&
    /<span class=\"wbr-label\" part=\"logo\">RPG Web Ring<\/span>/.test(h8c), h8c);

  // 8) logo: cross-origin absolute URL is rejected.
  var ringCrossOrigin = [
    { id: "a", name: "Alice", url: "https://alice.example/" },
    { id: "b", name: "Bob",   url: "https://bob.example/",   logo: "https://other.example/x.svg" },
    { id: "c", name: "Carol", url: "https://carol.example/" }
  ];
  var e9 = await withMembers(ringCrossOrigin, "https://bob.example/");
  e9.shadowRoot = { innerHTML: "" };
  e9._render();
  var h9 = e9.shadowRoot.innerHTML;
  assert("cross-origin member logo is rejected", !/<img class=\"wbr-logo\"/.test(h9), h9);
  assert("logo-fallback renders text label inside <span part=\"logo\">",
    /<span class=\"wbr-label\" part=\"logo\">RPG Web Ring<\/span>/.test(h9), h9);

  // 9) logo: data: URI is rejected (must be hosted on the page).
  var ringDataUri = [
    { id: "a", name: "Alice", url: "https://alice.example/" },
    { id: "b", name: "Bob",   url: "https://bob.example/",   logo: "data:image/svg+xml;base64,AAAA" },
    { id: "c", name: "Carol", url: "https://carol.example/" }
  ];
  var e10 = await withMembers(ringDataUri, "https://bob.example/");
  e10.shadowRoot = { innerHTML: "" };
  e10._render();
  var h10 = e10.shadowRoot.innerHTML;
  assert("data: URI logo is rejected", !/<img class=\"wbr-logo\"/.test(h10), h10);

  // 10) Obsolete logo-width / logo-height attributes are ignored.
  var e11 = await withMembers(ringWithLogo, "https://bob.example/");
  e11.shadowRoot = { innerHTML: "" };
  e11.setAttribute("logo",        "/should-be-ignored.svg");
  e11.setAttribute("logo-width",  "32px");
  e11.setAttribute("logo-height", "32px");
  e11._render();
  var h11 = e11.shadowRoot.innerHTML;
  assert("obsolete logo/logo-width/logo-height attrs do not affect the <img>",
    /<img class=\"wbr-logo\"[^>]*src=\"[^\"]*webring-logo\.svg\"/.test(h11) &&
    !/<img class=\"wbr-logo\"[^>]*style=/.test(h11) &&
    !/should-be-ignored\.svg/.test(h11), h11);


  // 11) Default theme = auto; stylesheet exposes auto/media-query rules.
  var e12 = await withMembers([{ id:"a", name:"Alice", url:"https://alice.example/" }], "https://alice.example/");
  e12.shadowRoot = { innerHTML: "" };
  e12._render();
  var h12 = e12.shadowRoot.innerHTML;
  assert("stylesheet contains prefers-color-scheme media query + :host(:not([theme=light]))",
    /@media \(prefers-color-scheme: dark\)/.test(h12) && /:host\(:not\(\[theme=light\]\)\)/.test(h12), h12);
  assert("stylesheet exposes --wbr-color token", /--wbr-color:/.test(h12), h12);
  assert("stylesheet defines :host([theme=dark])", /:host\(\[theme=dark\]\)/.test(h12), h12);

  // 12) CSS shadow parts are exposed on key elements.
  var e13 = await withMembers(ring, "https://bob.example/");
  e13.shadowRoot = { innerHTML: "" };
  e13._render();
  var h13 = e13.shadowRoot.innerHTML;
  assert("part=\"box\" on the framed container", /class=\"wbr-box\" part=\"box\"/.test(h13), h13);
  assert("part=\"row\" on the inner row",        /class=\"wbr-row\" part=\"row\"/.test(h13), h13);
  assert("error message rendered with part=\"status\"", h13.includes('part="status"') || /wbr-status/.test(h13), h13);
  assert("part=\"sep\" on at least one separator", /<span class=\"wbr-sep\" part=\"sep\"/.test(h13), h13);
  assert("part=\"link\" on at least the 4 nav <a>s (prev/random/next/list) + list items", (h13.match(/<a [^>]*part=\"link\"/g) || []).length >= 4, h13);
  assert("part=\"list\" + part=\"summary\" on the member details",
    /<details [^>]*part=\"list\"/.test(h13) && /<summary part=\"summary\"/.test(h13), h13);

// 12b) All widget-generated <a> links open in a new tab (target="_blank")
  //      and use rel="noopener" so the new page can't tabnab back.
  assert("nav links (prev/next/random) have target=\"_blank\"",
    /href="https:\/\/alice\.example\/"[^>]*target="_blank"/.test(h13) &&
    /href="https:\/\/carol\.example\/"[^>]*target="_blank"/.test(h13), h13);
  assert("nav links combine rel=\"<dir>\" + rel=\"noopener\"",
    /rel="prev noopener"/.test(h13) &&
    /rel="next noopener"/.test(h13) &&
    /rel="random noopener"/.test(h13), h13);
  assert("list-item <a>s have target=\"_blank\" rel=\"noopener\"",
    (h13.match(/<li><a [^>]*target="_blank"[^>]*rel="noopener"/g) || []).length === 3, h13);
  assert("help \"?\" link has target=\"_blank\" rel=\"noopener\"",
    /class="wbr-help"[^>]*target="_blank"[^>]*rel="noopener"/.test(h13), h13);

  // 13) Per-member icon: when an entry has \"icon\", prev/next/random links render a thumbnail.
  var ringWithIcons = [
    { id: "a", name: "Alice", url: "https://alice.example/", icon: "/avatars/alice.png" },
    { id: "b", name: "Bob",   url: "https://bob.example/",   icon: "/avatars/bob.png"   },
    { id: "c", name: "Carol", url: "https://carol.example/", icon: "/avatars/carol.png" }
  ];
  var e14 = await withMembers(ringWithIcons, "https://bob.example/");
  e14.shadowRoot = { innerHTML: "" };
  e14._render();
  var h14 = e14.shadowRoot.innerHTML;
  assert("member icon renders <img class=\"wbr-jump-img\"> in nav links",
    (h14.match(/<img class=\"wbr-jump-img\"/g) || []).length >= 3, h14);
  assert("member icon appears in the list <li>",
    /<li><img class=\"wbr-jump-img\"[^>]*src=\"[^"]*alice\.png\"[^>]*>[^<]*<a [^>]*>Alice<\/a><\/li>/.test(h14), h14);

    console.log("\nSMOKE TEST: " + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (err) { console.error("FATAL", err); process.exit(2); });
