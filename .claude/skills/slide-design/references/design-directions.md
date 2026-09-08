# Visual directions and the theme file

## What a theme decides

A theme owns appearance only: colour, typeface, weight, letter spacing, borders, backgrounds, opacity. Position, size, font size, line height and alignment belong to the layout; a theme that sets them is stopped by `pnpm theme:lint`.

## Hover states during playback

Elements respond to the mouse during playback, and that is the theme's job too:

- Every hover rule is written as `[data-interactive] [data-role="card"]:hover { ... }`: it starts with `[data-interactive]` and picks the element by data-role (a data-tone or a descendant may follow, e.g. `[data-interactive] [data-role="table"] tbody tr:hover td`). The player removes `html[data-interactive]` in static mode (`?static=1`, QA) and in edit mode, so measurement and dragging never meet a hover.
- A hover rule may use `transform` (a lift, a slight scale); nowhere else may. The player supplies the transition itself (0.18 s); a theme writes no `transition`.
- Whichever of card, pill, cta, photo and table the theme styles must also get a hover state, or `pnpm theme:lint` fails. Convention: a card lifts and deepens its shadow, a pill or cta highlights or scales slightly, a table row changes its background, a photo scales slightly.
- The value tooltip on chart hover (`.chart-tip`) and click-to-enlarge on images are the player's; the tooltip uses `--color-ink` as its ground and `--color-paper` for text, and a theme that wants otherwise writes `[data-role="chart"] .chart-tip rect`.
- Interactive components take their look the same way: an expanded card (`.deck-details`) keeps the data-role of its source element, so a card's glass ground and shadow apply automatically; a tab set's frame is `[data-role="tabs"]`, the tab strip and the active tab's underline come from the base CSS and the theme changes only colour and typeface (`[data-role="tabs"] .tab`, `.tab.is-active`, hover again under `[data-interactive]`); the legend swatches `.chart-swatch` share the chart's fill colours and the player dims a switched-off item; a hotspot's dashed frame and label use `--color-accent` and `--color-ink` / `--color-paper`.

`themes/<id>/theme.json`:

```json
{
  "schemaVersion": 1,
  "id": "<kebab-case>",
  "name": "<display name>",
  "description": "<the visual language in one sentence>",
  "colors": {
    "paper":   { "value": "#rrggbb", "use": "page background" },
    "ink":     { "value": "#rrggbb", "use": "primary text; background of inverted pages" },
    "muted":   { "value": "#rrggbb", "use": "subtitles, captions" },
    "accent":  { "value": "#rrggbb", "use": "the only accent colour" },
    "surface": { "value": "#rrggbb", "use": "card and panel background" },
    "line":    { "value": "#rrggbb", "use": "thin rules, borders" }
  },
  "typography": {
    "display": { "family": "<font stack>", "weight": 700 },
    "body":    { "family": "<font stack>", "weight": 400 }
  },
  "spacing": { "radius": 4 },
  "decoration": { "vocabulary": ["..."], "avoid": ["..."] }
}
```

`schemaVersion` is required (this engine understands 1; `pnpm theme:check` verifies it); `engine` (a semver range checked against package.json), `source` (where a ported pack came from) and `motion` (the pack's default page transition) are optional. All six colour roles are required; custom colours may be added (e.g. `accent2`) and the renderer turns every one into a `--color-<name>` variable.

`themes/<id>/theme.css` takes its values only through variables: `var(--color-paper)`, `var(--color-ink)`, `var(--color-muted)`, `var(--color-accent)`, `var(--color-surface)`, `var(--color-line)`, `var(--font-display)`, `var(--font-display-weight)`, `var(--font-body)`, `var(--font-body-weight)`, `var(--radius)`.

## Roles a theme colours

Layouts mark the meaning of a component with `data-role`; a theme knows only roles, never layout or element ids:

| role | Appears in | Usually drawn as |
|---|---|---|
| `title` | every layout | display typeface, ink colour |
| `kicker` | cover | accent colour, extra letter spacing |
| `subtitle`, `caption` | cover, comparison column names, photo | muted colour |
| `body` | statement, closing | ink colour |
| `list` | statement, comparison | the marker of `.list li` drawn with `border-left`, not with `content` |
| `card` | cards | surface ground, line border, radius |
| `backdrop` | the colour bar of cover and closing | an accent block |
| `divider` | comparison | line colour |
| `cta` | closing | accent or bold |
| `photo` | photo | surface ground, line border |

`data-tone="inverse"` marks a whole page (closing): the theme has to define the ground and text colours of inverted pages.

The inside of a metric card is `.metric-value`, `.metric-label`, `.metric-delta`; a theme may colour those classes.

## How the three directions pull apart

| Direction | Means |
|---|---|
| Safe | an existing theme, or a variant that changes only the accent and the typeface |
| Bold | inverted (ink as ground, paper as text), large areas of accent, an extra-heavy display weight, two colours |
| Free | a metaphor grown from the subject: "laboratory" with cool greys and a monospace face, "handmade" with warm paper and a serif, "city at night" with deep blue and a single neon colour |

A direction stands only if one sentence describes it: "mood + colour + typeface + one decorative vocabulary".

## Layering that is allowed and encouraged

A good-looking deck is not a flat colour with text on it. A theme may stack these (all appearance properties, the lint allows them):

- **Glow**: `[data-role="glow"]` with a `radial-gradient` and `filter: blur()`, one or two, low opacity, at the position the layout gives.
- **Texture**: the `background-image` of `.slide` overlaid with an 80px grid, a dot pattern or paper noise (an SVG data URI, 2% to 6% opacity).
- **Inner frame and corner marks**: `[data-role="frame"]` as a 1px inner rule; `[data-role="corner"]` drawn as an L with `border-top` plus `border-left`.
- **Keyword in a second face**: `em` swapped for an italic serif in the accent colour (text slots mark it as `*keyword*`).
- **Small furniture text**: `[data-role="meta"]` in capitals with 0.18em to 0.3em letter spacing, monospace or sans-serif, muted colour.
- **Tight display tracking**: `letter-spacing: -0.02em` to `-0.045em` at display sizes >= 96px; small text goes the other way and opens up.

## The default look to avoid

- Inter, Roboto or Arial as the display face
- white-with-purple-blue gradients, whole-page rainbow gradients
- decoration for its own sake: if removing it loses no information, remove it; shadows only on glows and glowing lines, never a wall of drop-shadowed cards
- the stock illustration on the right, meaningless geometric colour blocks
- three directions that differ only in colour: the difference comes first from the layouts' composition, then from the theme

## Font stacks for Chinese text

- Serif: `'Noto Serif TC', 'Songti TC', 'PMingLiU', 'Source Han Serif TC', Georgia, serif`
- Sans-serif: `'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', 'Source Han Sans TC', 'Segoe UI', sans-serif`
- Monospace: `'JetBrains Mono', 'Cascadia Code', 'Consolas', 'Noto Sans Mono CJK TC', monospace`

Chinese always falls to a system face, and the stack has to land on a usable system face on Windows and on macOS. Latin faces may be loaded: a theme pack's theme.css carries Google Fonts `@font-face` rules directly (only the `/* latin */` subset, src pointing at the gstatic woff2; the lint lets a theme's font-face through). Do not use `@import`; the renderer concatenates the CSS and it would not take effect.

## Porting a theme pack (from beautiful-html-templates)

One template becomes one theme pack, and layouts are never mixed across templates (the source project's rule: every set is a closed visual system):

1. Read the `:root` of `templates/<slug>/template.html` and the YAML tokens at the top of `design.md`; the palette / typography in `template.json` is a summary. Every colour becomes `#rrggbb` (a translucent rgba tint is first blended with the paper colour into a solid), the six required roles are mapped by meaning, and the remaining custom colours keep their original names (`green`, `pink2`, `tint`, ...).
2. Fill `source` in `theme.json` (name, url, author, license, template); list the set in the root `THIRD_PARTY_NOTICES.md`; note the origin on the first line of theme.css and of each layout.css.
3. Fonts: fetch the Google Fonts CSS (a Chrome user agent is needed to get woff2), paste only the latin subset into theme.css; for single-weight faces (such as Archivo Black) change `font-weight` to `100 900` so the Chinese fallback can really be bold. CJK stacks as above. The "CJK & International Content" section of `design.md` suggests a Chinese pairing for each set.
4. Layouts: every page of the template = one layout `themes/<slug>/layouts/<id>/` in the pack. Templates fixed at 1920x1080 (deck-stage) keep their numbers; templates in vw / vh / clamp are converted at 1920x1080 (1vw = 19.2px, 1vh = 10.8px, 1rem = 16px), a clamp taking the clamped middle value. The original font sizes on a 1920 canvas are often only 13-20px and have to grow for projection: scale headings and body proportionally to >= 32px and furniture (`data-role="meta"`) to >= 20px, keeping the original hierarchy ratios.
5. Decoration is always a shape element: bevels with `clip-path` (geometry, the layout writes it), offset shadows with `box-shadow` (appearance, the theme writes it), patterns with `background-image`, scanlines with an inline `<svg>` plus a pattern, coloured by the theme through `[data-role="<role>"] line { stroke }`. A pack may use roles of its own (`tint`, `dots`, `pixel`, `poster`, ...) as long as layout and theme agree.
6. The template's furniture maps to our slots: page number -> `page`, deck or series name -> `brand`, occasion or date -> `meta` or `kicker`, source line -> `cta` (the scaffold fills the first evidence item).
7. `pnpm theme:check --theme <slug>` at zero errors (it runs theme:lint, checks schemaVersion and the complete set of core layouts; a role without a rule is only a warning, but read it), `pnpm design:preview <story> --theme <slug> --layout cover` to see real content, compared side by side with the original template screenshot; `pnpm layouts --theme <slug>` lists the pack's layouts.

Themes are looked up in three places, first hit wins: the deck's own folder (`<deck>/themes/<id>`), the user directory (`$SLIDE_NEXTUP_HOME/themes`, else `~/.slide-nextup/themes`), then the repo's `themes/`. `pnpm theme:export` and `pnpm theme:import` move a pack between them as a folder or a zip.

### The shared layout vocabulary (so a deck can change theme pack)

Every theme pack provides this set of core layout ids, with the same slot names and types as the generic layouts (more is fine, fewer or renamed is not), so that `pnpm deck:retheme <deck.json> --theme <slug>` can move a finished deck across:

| id | Core slots |
|---|---|
| cover | title, subtitle |
| section | number, title, body |
| statement | title, body, evidence (list) |
| cards | title, card-1, card-2, card-3 (text or metric) |
| comparison | title, left-title, left-items, right-title, right-items |
| process | title, step-1 to step-4 |
| photo | title, photo, caption |
| data-table | title, table, caption |
| quote | title, caption |
| closing | title, body, cta |

The furniture slots `brand`, `meta`, `kicker`, `page` are optional. A pack may add layouts of its own (for example warm-keynote's `cards-2`, `cards-4`, `fact`, `before-after`, `chart-aside`; blue-professional's `agenda`, `dashboard`, `detail`, `tabs`; technical-brief's `cards-list`, `chips-2`, `flow-3`, `diagram-notes`). Three packs are complete at the moment, warm-keynote, blue-professional and technical-brief (`ls themes/<id>/layouts` for the current set). All three are generated from a compact spec by their own `themes/<id>/generate-layouts.cjs` (warm-keynote's `cover` is the one hand-kept file): to change a layout, change the spec and run the generator again, because a hand edit to a generated layout.json is overwritten on the next run. A missing core layout falls back to the generic one, still styled by the theme, but it looks a notch weaker, so fill the set. Font-size floors are graded by role: ordinary content 32px; `chapter` / `pill` / `caption` / `cta` / `kicker` / `flow` 24px; `meta` / `chip` / `eyebrow` 20px; `table` 22px.
