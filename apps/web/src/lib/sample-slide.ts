// A 160 by 90 PNG of a rounded rectangle in 25% black. A slide keeps a data image only as PNG, JPEG, GIF, WebP or AVIF.
const frame =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAABaCAYAAAA/xl1SAAABJUlEQVR42u3XsQnDMABE0StcegwVGsCFy+w/VVBQgrEhlS01T/AWOD5CSq5nTVKT7ElecIO9N7Xmz1mSFGPxsNJbu8S3GYdBtnOEbj5m3IS/N59BmOHzJqyGYJLWnt8uU3/HhmAqIyBABAgCRIAgQAQIAkSAIEAECAJEgCBABAgCRIAgQAQIAkSAIEAECAJEgCBABAgCRIAgQAQIAkSACBAEiABBgAgQBIgAQYAIEASIAEGACBAEiABBgAgQBIgAQYAIEASIAEGACBAEiABBgAgQBIgAwQAIEAGCABEgCBABggARIAgQAcJTAe5GYJLWXqohmKS1l9UQTNLa+5xiDAYrOZwlyWYUBtl6czlH6CZkxM13ie941v449Dvmzt9uPb75vucNBaEDQx6UFokAAAAASUVORK5CYII=';

/** A slide with each kind of content a slide shows: a heading, lists, task lists, a table, code, an image, links and HTML. */
export const sampleSlide = `+++
title = "Welcome"
+++

# Welcome to sld

Each slide is **markdown**, with [links](https://commonmark.org), \`code\` and ~~mistakes~~.

- Edit a slide
  1. Change its markdown

* [x] Split on \`---\`
* [ ] Present

| Key               |     Action |
| :---------------- | ---------: |
| <kbd>Right</kbd>  | Next slide |
| <kbd>Left</kbd>   |    Go back |

\`\`\`ts
const deck = splitDeck(markdown);
\`\`\`

![A 16:9 frame](${frame})
`;
