const frame =
	'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" rx="8" fill-opacity=".25"/></svg>';

/** A slide with each kind of content a slide shows: headings, lists, task lists, a table, code, an image, links and HTML. */
export const sampleSlide = `+++
title = "Welcome"
+++

# Welcome to sld

Each slide is **markdown**, with [links](https://commonmark.org), \`code\` and ~~mistakes~~.

## Lists

- Paste a deck
- Edit a slide
  1. Change its markdown
  2. See it change

* [x] Split on \`---\`
* [ ] Present

| Key               |     Action |
| :---------------- | ---------: |
| <kbd>Right</kbd>  | Next slide |
| <kbd>Left</kbd>   |    Go back |

\`\`\`ts
const deck = splitDeck(markdown);
\`\`\`

![A 16:9 frame](data:image/svg+xml,${encodeURIComponent(frame)})
`;
