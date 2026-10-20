# Contributing

Thanks for considering joining the ring! &nbsp;&nbsp;🌐

## Add yourself

1. **Edit [`members.json`](./members.json).** Append a new object to the end of the array:

    ```json
    {
      "id": "your-handle",
      "name": "Your Display Name",
      "url": "https://yoursite.example/",
      "added": "YYYY-MM-DD",
      "icon": "/avatar.png",                  // optional
      "logo": "/webring-logo.svg"             // optional
    }
    ```

    - `id` &mdash; a short, unique handle (lowercase, no spaces). Used as a stable key.
    - `name` &mdash; the human-readable label that will appear on other sites' nav bars.
    - `url` &mdash; the homepage URL of your site. **Must match** the `site=""` attribute on your widget, exactly (the widget strips trailing slashes, but please be tidy).
    - `added` &mdash; the ISO date you joined. Anything `<= today` is fine.
    - `icon` &mdash; _optional_. URL of a tiny thumbnail shown next to your name on other sites’ nav bars.
    - `logo` &mdash; _optional_. Brand image shown in the widget's title bar on **your** page. A relative URL is recommended (same origin rule as for cross-origin requests — no `data:`, no other domain); cross-origin / inline-`data:` values are silently rejected and the widget falls back to a text label.

2. **Open a pull request.** Title it `Add <your-handle> to the ring`. In the body, drop a one-liner about your site so reviewers know what they're approving.

3. **Wait for a review.** Most PRs are merged same-week. If we ask for changes, they're usually cosmetic (typo in name, broken URL, etc.).

## Leave the ring

Simply remove your object from `members.json` in a PR titled `Remove <your-handle> from the ring`. Thanks for participating &mdash; the door is always open.

## Style guide for `members.json`

- Stable field order: `id`, `name`, `url`, `added`, then optional `icon` and `logo`. (Future fields may be added; old ones won't be removed without a major bump.)
- 2-space indent, LF line endings (the repo's `.gitattributes` enforces this).
- No trailing commas. Run `python -m json.tool members.json > /dev/null` to lint.
- One entry per site. If you maintain multiple sites, add multiple entries.

## Reviewer's checklist

- [ ] JSON still parses
- [ ] New URL returns 2xx
- [ ] The author's widget on that URL has `site="<exact url from entry>"`
- [ ] No duplicates (compare by normalised URL)

That's it. No CLA, no Code of Conduct beyond the obvious "be kind."
