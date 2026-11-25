# Design

How slides look and what they accept. Each section records a decision made in Linear: SLD-44 for the color roles, SLD-45 for the type scale, layouts, fonts and overflow, and SLD-46 for code blocks. When a design changes a token or a rule here, update this file in the same pull request.

The slide styles live in `apps/web/src/lib/slide.css` and `apps/web/src/lib/code-block.css`. Every size below is in stage pixels on the 1920 by 1080 stage. A 4:3 stage is 1440 by 1080 and keeps the same sizes.

## Colors

Slides read only the slide roles, which the scheme compiler derives from a Base16 scheme's `--base00` to `--base0F`:

| Role          | Slot                                             | Used for                                                           |
| ------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| `--bg`        | base00                                           | The stage                                                          |
| `--surface`   | base01                                           | Inline code and code blocks                                        |
| `--border`    | base02                                           | Rules, table lines, the inline code border, the footnote line      |
| `--selection` | base02                                           | Selected text                                                      |
| `--body`      | base05, or a mix toward the strongest foreground | Body text                                                          |
| `--muted`     | base04                                           | List numbers, unchecked task boxes, citations, footnotes, captions |
| `--heading`   | the strongest foreground                         | Headings, table headers, quotes                                    |
| `--link`      | base0D                                           | Links and footnote references                                      |
| `--accent`    | base0E                                           | List squares, checked boxes, the quote mark, section labels        |

Body, muted and link text aim for 4.5:1 on base00 and base01, and the accent for 3:1. A role that misses its floor mixes toward the strongest foreground in 5% steps, except muted, which mixes toward the body color unless body text was mixed too. When no mix reaches the floor, the role takes the color it mixes toward, so a few schemes keep text under 4.5:1; `schemes.test.ts` lists them. Code tokens take the slots in the Base16 styling guide, held to 4.5:1 the same way. The app's own interface marks warnings with `--rule`, such as the editor's note on a slide too long to fit.

## Type

| Text                 | Size | Line height | Face         |
| -------------------- | ---- | ----------- | ------------ |
| Title layout heading | 136  | 1.0         | Heading, 500 |
| Heading 1            | 96   | 1.05        | Heading, 500 |
| Heading 2            | 72   | 1.1         | Heading, 500 |
| Heading 3            | 56   | 1.15        | Heading, 600 |
| Body                 | 44   | 1.4         | Body, 400    |
| Inline code          | 38   |             | Code         |
| Code block           | 30   | 1.5         | Code         |
| Captions, footnotes  | 30   | 1.4         | Body         |
| Slide number         | 26   |             | Code, muted  |

The default pairing is Hubot Sans for headings, Mona Sans for body text and Monaspace Neon for code, bundled with the app through `@fontsource`. The CSS reads them through `--font-heading`, `--font-body`, `--font-code` and `--heading-weight`, so a later pairing sets those four variables. Five other pairings exist on the SLD-45 artboards: Serif, Legible, Grotesk, Editorial and Plain.

## Margins

A slide keeps 120 px at each side, 104 at the top and 96 at the bottom, which leaves a content area of 1680 by 880. Paragraphs, lists and quotes stop at 1400 px. Tables, code blocks, rules and images may use the full width. Blocks sit 40 px apart, and 56 px after a heading, except on a `center` slide. An open disclosure leaves 40 px under its summary.

## Layouts

- `default`: the heading at the top left and content below it.
- `title`: the heading at 136, centered vertically. A paragraph right after it is the subtitle, at 48. A last paragraph after that, such as a date and venue, is pinned to the bottom margin in muted 30 px text.
- `center`: one statement centered both ways, its heading at 96 and 40 px above the line under it. Paragraphs after the heading are muted.
- `section`: the title at 120, sitting on the bottom margin with an accent bar under it. A paragraph right before the title is the part label, in accent code type at 34.

## Elements

- Lists mark items with accent squares, nested items with hollow squares, and numbers in muted code type.
- Task lists draw their own boxes: muted outlines, filled with the accent and checked when done.
- Tables have heading-face headers over a 3 px border-color rule, 2 px rules between rows, and tabular figures.
- A quote shows a large accent quote mark and no side bar, its text in the heading face at 72. A `<cite>` in it is muted body text at 34.
- Inline code sits on the surface color with a 2 px border.
- A code block is a base01 panel with a 16 px radius and 36 by 44 px padding.
- A rule is a full-width, 3 px border-color line.
- Images keep their aspect inside the content area. An image alone in its paragraph, with nothing else on the slide, fills the content area.
- Footnotes sit above the bottom margin, under a border-color line. Each opens with its number drawn like its marker in the text: link-colored code type, raised.

## Overflow

A slide that runs past the bottom margin shrinks its text and spacing until it fits. Each size stops at a floor: 32 for body text, quotes and tables, and 72 for headings. Text already smaller than its floor, such as heading 3 or footnotes, keeps its size. Code blocks shrink down to 20 px, and a code block with a line too long for it shrinks its own code first, down to the same 20 px.

Past the floors, the slide clips at the bottom margin. The editor's preview shows "Shrunk to 82%" while a slide is shrunk, and "Too long to fit, split or trim" with the `--rule` color once it clips. Either note sits on the stage's top right corner. Presenting never shows either note.

## Links and images

A markdown link or image in a slide keeps its address unless it is one of these. sld drops them wherever it shows a slide: the editor's preview, the slide list's thumbnails and the presenter.

- `javascript:` and `vbscript:` addresses, in links and images.
- Every `data:` address in a link.
- Every `data:` address in an image except PNG, JPEG, GIF, WebP and AVIF pictures: `data:image/png`, `data:image/jpeg`, `data:image/gif`, `data:image/webp` and `data:image/avif`. A JPEG labeled `data:image/jpg` is dropped too, and so are BMP and ICO pictures. For an SVG picture, use its file's address, such as `https://example.com/logo.svg`, not `data:image/svg+xml`.

A link whose address is dropped shows as its text, and an image as its alt text. Every other address stays, such as `https://example.com`, `mailto:someone@example.com` or a relative path like `pictures/chart.png`. Raw HTML keeps its addresses as the person typed it, `javascript:` included. Only an imported deck's raw HTML is cleaned, when the deck is imported.

## Landing page headline

The landing page's headline, "Easy slides from markdown", sits on one line at 1280 px and wider, in the heading face at weight 650, 72 px, with `letter-spacing: -0.035em` and `line-height: 1`, and the subtitle under it. Below 1280 px it shrinks with the window, to 40 px at most phone widths, where it wraps onto two lines. Sizes here are CSS pixels.

## Landing page cards

The landing page's index cards don't draw a scaled-down slide. Each card sets the slide's first heading in the band above its pink `--rule` line, in the heading face at 600, and writes the slide's other blocks on the ruled lines below, one line of text to each rule and its baseline just above it. List items keep an accent marker, a code block shows its first line in the code face, and images, tables and rules drop out. A heading too long for the band, or text past the last line, ends in an ellipsis. The slide number sits at the top right in muted Monaspace Neon at 12.5 px.

Sizes in this section are CSS pixels, not stage pixels. The grid scales with the card's width: the band is 11% of it and each rule 7%, with floors of 30 and 20 px. Titles stay at 20 px or more and body text at 14 px or more. A card writes six lines, five on a card under 300 px wide and four under 240 px, as on a phone or beside the note on a tablet.

## Icons

The app icon is the brand mark in `apps/web/icons/icon.svg`: three stacked slides and a progress bar on a `#1b1e2b` tile, with the front slide and the bar's progress in `#37f499`. Icons are drawn outside the page, so they keep these fixed colors instead of reading a scheme.

- The 16 px favicon shows only the front slide and its three dashes, drawn on whole pixels so they stay sharp. `favicon.ico` holds it and the brand's 32 px icon, and the page links only that file, because a browser offered an SVG icon draws it at every size.
- The 192 and 512 px icons are offered as they are and as maskable icons for Android. A maskable icon fills its square with the tile color and keeps the mark inside the inner 80% circle, at 85% of its size on the tile.
- The maskable icons and the 16 px favicon are drawn from the SVG files in `apps/web/icons` by `pnpm --filter @sld/web icons`. The script packs the 16 px favicon into `favicon.ico` with the brand's `favicon-32.png` from the same folder.

## Header mark

The landing page and `/app` headers show the brand mark alone, with no wordmark. `Mark.svelte` draws it as inline SVG from the geometry of `icon.svg`, and its accessible name is "sld". In `/app` the mark starts the library header and the editor and settings toolbars, and links to the landing page as "sld home". The library header's heading still reads "sld", in text only screen readers get, and the library footer links to the landing page as "Home page". At phone width the toolbars' Decks link shows only its arrow, so the deck title keeps room beside the mark; "Decks" stays its accessible name.

- The landing page shows it at 36 px on its tile in the brand's colors: a `#1b1e2b` tile, `#3a3f58` back slide and progress track, `#5b6078` middle slide, and `#37f499` front slide and progress. It is the one thing on a page that keeps fixed colors instead of reading a scheme.
- `/app` shows it at 32 px with no tile, cropped to `80 80 352 352` of the icon's 512 grid, in scheme colors: base02 for the back slide and the track, base03 for the middle slide, and base0B for the front slide and the progress.
- The gaps between slides and the front slide's dashes are cut out with SVG masks, so they show the header's background in any scheme. Each mark takes its own mask ids, so several marks can share a page.
