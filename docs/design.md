# Design

How slides look and what they accept. When a design changes a token or a rule here, update this file in the same pull request.

## Links and images

A markdown link or image in a slide keeps its address unless it is one of these. sld drops them wherever it shows a slide: the editor's preview, the slide list's thumbnails and the presenter.

- `javascript:` and `vbscript:` addresses, in links and images.
- Every `data:` address in a link.
- Every `data:` address in an image except PNG, JPEG, GIF, WebP and AVIF pictures: `data:image/png`, `data:image/jpeg`, `data:image/gif`, `data:image/webp` and `data:image/avif`. A JPEG labeled `data:image/jpg` is dropped too, and so are BMP and ICO pictures. For an SVG picture, use its file's address, such as `https://example.com/logo.svg`, not `data:image/svg+xml`.

A link whose address is dropped shows as its text, and an image as its alt text. Every other address stays, such as `https://example.com`, `mailto:someone@example.com` or a relative path like `pictures/chart.png`. Raw HTML keeps its addresses as the person typed it, `javascript:` included. Only an imported deck's raw HTML is cleaned, when the deck is imported.
