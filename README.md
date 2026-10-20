# git-webring

A tiny, dependency-free [**webring**](https://en.wikipedia.org/wiki/Webring) for personal sites &mdash; run from a git repo, embedded with one `<script>` and one custom element.

> Like the original webrings of the 90s, but for 2026: independent sites linking to each other in a ring, with a single shared registry on GitHub.

## What's in the box

| File | What it does |
|------|--------------|
| `index.html` | The project's homepage. Shows the widget working live. |
| `webring.js` | Defines the `<git-webring>` [custom element](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements). ~10&nbsp;KB, no dependencies. |
| `members.json` | The shared registry of ring members. JSON, line-by-line, easy to PR. |
| `style.css` | Styling for the project homepage only. The widget is self-styled. |
| `CONTRIBUTING.md` | How to add (or remove) yourself from the ring. |
| `LICENSE` | MIT. |

## Embed it on your site

Two lines of HTML:

```html
<script src="https://mdybal.github.io/git-webring/webring.js" defer></script>
<git-webring site="https://yoursite.example/" logo="/webring-logo.svg"></git-webring>
```

The widget renders prev / random / next / list links to the other ring members, plus your position in the ring ("Member 3 of 17"). It works offline via a 5-minute `localStorage` cache.

The `logo` attribute is optional. If present, **the logo must be hosted on the same page as the widget itself** &mdash; a relative URL like `/webring-logo.svg`, resolved against your site. Cross-origin URLs and inline `data:` URIs are silently rejected; the gadget falls back to a text label.

### Why `<git-webring>` and not just `<webring>`?

Custom element names are required to contain a hyphen (per the [custom elements spec](https://html.spec.whatwg.org/multipage/custom-elements.html#valid-custom-element-name)). The script file stays short (`webring.js`); only the tag has the dash.

### Attributes

| Attribute | Required | Default | Purpose |
|-----------|----------|---------|---------|
| `site`      | yes   | &mdash;        | Your site's homepage URL. Drives ring order lookup. |
| `data-src`  | no    | `./members.json` next to `webring.js` | URL of the registry JSON. |
| `theme`     | no    | `auto`         | `light` / `dark` / `auto`. `auto` inherits the visitor's OS color scheme. |
| `logo`      | no    | _text label_   | Relative URL to a brand image, **same origin** as the page. |
| `logo-width`  | no | `auto`       | Inline width on the `<img>` tag (`"32px"`). |
| `logo-height` | no | `18px`       | Inline height on the `<img>` tag (`"32px"`). |

### Customizing the look

The widget is intentionally shaped to **blend in with the host page** (text color, font, and panel border all inherit from `currentColor` by default) while keeping its own identity (a single brand accent for the links, and a brand-mark slot for a logo).

You can tune it from your stylesheet two ways.

**CSS custom properties** &mdash; set any of these on `:root`, on the host page, or directly on `<git-webring>`:

| Token | Default | What it controls |
|-------|---------|------------------|
| `--wbr-color`     | `currentColor`     | Text color. |
| `--wbr-bg`        | `transparent`      | Panel background. |
| `--wbr-border`    | `currentColor`     | Border color (rendered via `border: 1px solid &hellip;`). |
| `--wbr-accent`    | `#0366d6` / `#58a6ff` (dark) | Only brand-specific color: link color. |
| `--wbr-radius`    | `6px`              | Corner radius. |
| `--wbr-pad-y` / `--wbr-pad-x` | `10px` / `14px` | Inner padding. |
| `--wbr-gap`       | `8px`              | Spacing between nav links. |
| `--wbr-font`      | `inherit`          | Font family (match the page). |
| `--wbr-font-size` | `14px`             | Text size. |
| `--wbr-logo-size` | `18px`             | Brand-mark height. |

**CSS Shadow Parts** &mdash; for surgical edits:

```css
git-webring::part(box)    { border-style: dashed; border-radius: 0; }
git-webring::part(logo)   { font-family: "EB Garamond", serif; }
git-webring::part(link)   { font-weight: 600; }
git-webring::part(status) { text-transform: uppercase; letter-spacing: .04em; font-size: 11px; }
git-webring::part(list)   { display: none; }   /* hide the member list entirely */
```

Available parts: `box`, `logo`, `row`, `link`, `sep`, `status`, `list`, `summary`.

### Self-hosting

If you'd rather skip the network fetch on every page view, drop the registry inline:

```html
<script type="application/json" id="webring-members">[ ... ]</script>
<script src="/git-webring/webring.js" defer></script>
<git-webring site="https://yoursite.example/"></git-webring>
```

Inline wins over the network, so your readers make zero cross-origin requests for the ring.

## Join the ring

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Short version: open a PR that adds your entry to the **end** of `members.json`:

```json
{
  "id": "your-handle",
  "name": "Your Display Name",
  "url": "https://yoursite.example/",
  "added": "YYYY-MM-DD"
}
```

Your URL becomes the canonical "you" in the registry. Make sure it matches the `site=""` value on your widget *exactly* (trailing slash matters &mdash; the widget strips it for comparison, but be tidy).

## Why the order in `members.json` matters

The ring is ordered: prev wraps to the last entry, next wraps to the first. New entries are appended at the bottom, so you start adjacent to whoever joined before you. There is no automated re-shuffling: the order in the file **is** the ring.

If you'd rather pick your spot, propose it in the PR description.

## Local dev

The project is a static site &mdash; no build step. To preview:

```bash
# Any one of these works:
python -m http.server 8000        # then visit http://localhost:8000
npx serve .                       # or
php -S localhost:8000
```

Open the page, edit `members.json`, refresh. Hard-refresh (Cmd-Shift-R) to clear the in-browser cache if you don't want to wait five minutes.

## License

MIT. See [`LICENSE`](./LICENSE).
