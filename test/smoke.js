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

const document = {
  _elements: new Map(),
  getElementById(id) { return this._elements.get(id) || null; },
  getElementsByTagName() { return []; },
  createElement(tag) { return tag === "script" ? { src: "", textContent: "", type: "" } : null; }
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
  assert("single member shows 'Member 1 of 1'", /Member 1 of 1/.test(h1), h1);
  assert("single member omits prev/next/random", !/rel="prev"/.test(h1) && !/rel="next"/.test(h1) && !/rel="random"/.test(h1), h1);

  // 2) ring of 3, current = middle (bob)
  var ring = [
    { id: "a", name: "Alice", url: "https://alice.example/" },
    { id: "b", name: "Bob",   url: "https://bob.example/"   },
    { id: "c", name: "Carol", url: "https://carol.example/" }
  ];
  var e2 = await withMembers(ring, "https://bob.example/");
  var h2 = e2.shadowRoot.innerHTML;
  assert("bob is Member 2 of 3", /Member 2 of 3/.test(h2), h2);
  assert("bob prev is Alice",   /rel="prev"[^>]*>[^<]*Alice/.test(h2), h2);
  assert("bob next is Carol",   /rel="next"[^>]*>Carol/.test(h2), h2);
  assert("bob has 3 list items", (h2.match(/<li>/g) || []).length === 3, h2);

  // 3a) unknown site, empty registry -> fetch path
  var e3 = await withMembers([], "https://nobody.example/");
  var h3 = e3.shadowRoot.innerHTML;
  assert("empty registry: no 'Member X of Y' shown", !/Member \d+ of/.test(h3), h3);

  // 3b) unknown site, non-empty registry -> Join CTA
  var e4 = await withMembers([{ id: "a", name: "Alice", url: "https://alice.example/" }], "https://nobody.example/");
  var h4 = e4.shadowRoot.innerHTML;
  assert("unknown site gets Join CTA", /Join the ring/.test(h4), h4);

  // 4) trailing slash normalization
  var e5 = await withMembers([
    { id: "a", name: "Alice", url: "https://alice.example/" },
    { id: "b", name: "Bob",   url: "https://bob.example/" }
  ], "https://alice.example");
  var h5 = e5.shadowRoot.innerHTML;
  assert("missing trailing slash still matches", /Member 1 of 2/.test(h5), h5);

  // 5) wrap: first member's prev wraps to last
  var ring6 = [
    { id: "a", name: "Alice", url: "https://alice.example/" },
    { id: "b", name: "Bob",   url: "https://bob.example/"   },
    { id: "c", name: "Carol", url: "https://carol.example/" }
  ];
  var e6 = await withMembers(ring6, "https://alice.example/");
  var h6 = e6.shadowRoot.innerHTML;
  assert("first member prev wraps to Carol", /rel="prev"[^>]*>[^<]*Carol/.test(h6), h6);
  assert("first member next is Bob",         /rel="next"[^>]*>Bob/.test(h6), h6);
  // last member's next wraps to first
  var e6b = await withMembers(ring6, "https://carol.example/");
  var h6b = e6b.shadowRoot.innerHTML;
  assert("last member next wraps to Alice",   /rel="next"[^>]*>Alice/.test(h6b), h6b);

  // 6) bad inline JSON
  document._elements.set("webring-members", { textContent: "{not-json" });
  var e7 = new WbrCtor();
  e7.shadowRoot = { innerHTML: "" };
  e7.setAttribute("site", "https://x.example/");
  await e7._load();
  assert("bad inline JSON surfaces error styling", /wbr-err/.test(e7.shadowRoot.innerHTML), e7.shadowRoot.innerHTML);

  console.log("\nSMOKE TEST: " + pass + " passed, " + fail + " failed");
  process.exit(fail === 0 ? 0 : 1);
})().catch(function (err) { console.error("FATAL", err); process.exit(2); });
