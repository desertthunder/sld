# Changelog

## [0.1.1](https://github.com/desertthunder/sld/compare/v0.1.0...v0.1.1) (2026-11-25)


### Features

* **web:** add the sld favicon and app icons (SLD-96) ([#37](https://github.com/desertthunder/sld/issues/37)) ([172bc4d](https://github.com/desertthunder/sld/commit/172bc4d6680eefa17e35d9c78e88cd215860ff41))
* **web:** show a 404 page for unknown paths (SLD-101) ([#46](https://github.com/desertthunder/sld/issues/46)) ([51508d7](https://github.com/desertthunder/sld/commit/51508d75c8ef0350468bbdc8ceaf28f63694b479))
* **web:** show the sld mark in the landing page and app headers (SLD-106) ([#44](https://github.com/desertthunder/sld/issues/44)) ([4f5227b](https://github.com/desertthunder/sld/commit/4f5227b7ec4f2f58cb84c9a434f08e13b912da2c))
* **web:** show the version and commit in the footer (SLD-100) ([#40](https://github.com/desertthunder/sld/issues/40)) ([8b11a5e](https://github.com/desertthunder/sld/commit/8b11a5ed19c5b5369d7cf6f7a59e35c47f93ae45))


### Bug Fixes

* **web:** quiet the editor focus ring and keep the active line under it (SLD-102) ([#45](https://github.com/desertthunder/sld/issues/45)) ([213b98e](https://github.com/desertthunder/sld/commit/213b98e9356961e2e9f2d0c890460229ab9b68e8))
* **web:** set the landing headline on one line at desktop widths (SLD-104) ([#43](https://github.com/desertthunder/sld/issues/43)) ([9571608](https://github.com/desertthunder/sld/commit/957160839280b4da15997bff83154d502a519d09))
* **web:** set the landing page's index cards on their ruled lines (SLD-78) ([#38](https://github.com/desertthunder/sld/issues/38)) ([d98ec9d](https://github.com/desertthunder/sld/commit/d98ec9d66d2c3bcd674326b9c88c5a2d9ac23fbc))
* **web:** stop the save status from writing state during a flush (SLD-95) ([#41](https://github.com/desertthunder/sld/issues/41)) ([1666632](https://github.com/desertthunder/sld/commit/166663279a42e32109c1ffe582c42283b6c7a936))

## 0.1.0 (2026-11-25)


### Features

* **web:** add the decks and slides schema and its queries (SLD-8) ([#17](https://github.com/desertthunder/sld/issues/17)) ([3a39f78](https://github.com/desertthunder/sld/commit/3a39f78c8796aa7e58fb49a39040812055a7006a))
* **web:** apply a scheme to a deck and add the scheme picker (SLD-28) ([#27](https://github.com/desertthunder/sld/issues/27)) ([59a8630](https://github.com/desertthunder/sld/commit/59a86301e3ae906c81eea4925a3d7079a51ae4f7))
* **web:** apply Drizzle migrations in the browser at startup (SLD-6) ([#8](https://github.com/desertthunder/sld/issues/8)) ([a06b407](https://github.com/desertthunder/sld/commit/a06b40742915c98ceaee3551b8b6d1edb058ef84))
* **web:** build the deck editor layout and slide list (SLD-15) ([#20](https://github.com/desertthunder/sld/issues/20)) ([c8733af](https://github.com/desertthunder/sld/commit/c8733af03ae1df4712b1769916423e0e0ceb49fd))
* **web:** build the deck library and create a deck from pasted markdown (SLD-14) ([#25](https://github.com/desertthunder/sld/issues/25)) ([57d18c5](https://github.com/desertthunder/sld/commit/57d18c53ecdb57f3463377440561089220b14e8f))
* **web:** build the landing page and warm the database from it (SLD-69) ([#19](https://github.com/desertthunder/sld/issues/19)) ([af0ea29](https://github.com/desertthunder/sld/commit/af0ea29e8f88955561cda7ecd738672a6cc93d95))
* **web:** compile the tinted-theming Base16 schemes to JSON (SLD-26) ([#13](https://github.com/desertthunder/sld/issues/13)) ([43257fa](https://github.com/desertthunder/sld/commit/43257fadf70c905d67f208c32086f888f698ac54))
* **web:** draw slides on a fixed-size stage that scales to fit (SLD-19) ([#16](https://github.com/desertthunder/sld/issues/16)) ([76da8ca](https://github.com/desertthunder/sld/commit/76da8cac7b59b00ca7229ba61f1d02c92b5d96bd))
* **web:** edit slide markdown in CodeMirror 6 with autosave (SLD-16) ([#28](https://github.com/desertthunder/sld/issues/28)) ([ea882b4](https://github.com/desertthunder/sld/commit/ea882b46b16412181725c0f0b2cc50bd9ffa8a12))
* **web:** export a deck as a markdown file and import one (SLD-12) ([#30](https://github.com/desertthunder/sld/issues/30)) ([ac7daed](https://github.com/desertthunder/sld/commit/ac7daedb47713a30aa1b87a524abe6ed965e5796))
* **web:** highlight code blocks with the deck's scheme (SLD-30) ([#15](https://github.com/desertthunder/sld/issues/15)) ([ef6b902](https://github.com/desertthunder/sld/commit/ef6b902918f1328f99c795e9a212147ffefc43b2))
* **web:** keep an open editor in step with other tabs (SLD-82) ([#33](https://github.com/desertthunder/sld/issues/33)) ([9e56834](https://github.com/desertthunder/sld/commit/9e5683474593738eeb73ea883cece713f08a1b66))
* **web:** move the app to /app and prerender / (SLD-68) ([#7](https://github.com/desertthunder/sld/issues/7)) ([5825d83](https://github.com/desertthunder/sld/commit/5825d8338929ec8e5b088e4789c1c5b4f939f88a))
* **web:** present a deck full screen with keyboard navigation (SLD-20) ([#21](https://github.com/desertthunder/sld/issues/21)) ([0009d98](https://github.com/desertthunder/sld/commit/0009d98da277d709f8c889c92ecb241df88fbd29))
* **web:** read layout, notes and class from slide frontmatter (SLD-11) ([#22](https://github.com/desertthunder/sld/issues/22)) ([2da0efc](https://github.com/desertthunder/sld/commit/2da0efcbc4e69863f2bc123bd0ec85bc3ba18061))
* **web:** render slide markdown with Sätteri in the browser (SLD-10) ([#12](https://github.com/desertthunder/sld/issues/12)) ([96498c3](https://github.com/desertthunder/sld/commit/96498c3394d4ca8d89ca19f69f361a88a73c8a88))
* **web:** run PGlite in a worker with IndexedDB storage (SLD-5) ([#3](https://github.com/desertthunder/sld/issues/3)) ([4b75879](https://github.com/desertthunder/sld/commit/4b758792ca53fa40c1a21c84544a49562de714ed))
* **web:** scaffold the static SvelteKit app (SLD-3) ([#1](https://github.com/desertthunder/sld/issues/1)) ([487edbe](https://github.com/desertthunder/sld/commit/487edbe0a6263d48164a93e05736256f7f41fa7b))
* **web:** serve the app cross-origin isolated (SLD-4) ([#9](https://github.com/desertthunder/sld/issues/9)) ([b255b1a](https://github.com/desertthunder/sld/commit/b255b1a974faa819ad8c2847372b73a0bb927495))
* **web:** show a live preview of the selected slide (SLD-17) ([#26](https://github.com/desertthunder/sld/issues/26)) ([60ea67c](https://github.com/desertthunder/sld/commit/60ea67c9cac30e0299a523fb736e358da4235084))
* **web:** show a splash screen at /app until the database is ready (SLD-70) ([#11](https://github.com/desertthunder/sld/issues/11)) ([2de7f10](https://github.com/desertthunder/sld/commit/2de7f102e932b29ec7895e2061f67cbac2a1eb2d))
* **web:** split pasted markdown into slides on --- (SLD-9) ([#6](https://github.com/desertthunder/sld/issues/6)) ([f1b0109](https://github.com/desertthunder/sld/commit/f1b0109154b6320715b6110b1105cc4533906965))
* **web:** stop a tab from using a database older than its code (SLD-73) ([#10](https://github.com/desertthunder/sld/issues/10)) ([ebf391f](https://github.com/desertthunder/sld/commit/ebf391f24aa6715e38ea2b08ad40b22f1b904b1d))
* **web:** style slide content and layouts (SLD-29) ([#31](https://github.com/desertthunder/sld/issues/31)) ([6d62aa1](https://github.com/desertthunder/sld/commit/6d62aa12c26d216997967f98d75d316f962c4098))


### Bug Fixes

* **web:** make a write reach IndexedDB before the tab can reload (SLD-76) ([#14](https://github.com/desertthunder/sld/issues/14)) ([a69a8f5](https://github.com/desertthunder/sld/commit/a69a8f5046fa4d1a9c055cb82ad79aa13df27e69))
* **web:** make adding, duplicating and deleting a slide respond at once (SLD-79) ([#23](https://github.com/desertthunder/sld/issues/23)) ([43d6d58](https://github.com/desertthunder/sld/commit/43d6d58b040905c6e9432a2d759e67d03d86809f))
* **web:** match five slide details to the artboards (SLD-91) ([#35](https://github.com/desertthunder/sld/issues/35)) ([21327a9](https://github.com/desertthunder/sld/commit/21327a96b5e3df08c0674b98c95b5fae4e6b618e))
* **web:** neutralize script URLs in markdown links and images (SLD-85) ([#34](https://github.com/desertthunder/sld/issues/34)) ([ce04e0d](https://github.com/desertthunder/sld/commit/ce04e0d14b6e8b19750f7f5d21a552376d06a509))
* **web:** scope a slide's styles to the slide (SLD-87) ([#36](https://github.com/desertthunder/sld/issues/36)) ([0ec2e83](https://github.com/desertthunder/sld/commit/0ec2e836a2b84d31828bf650c8442d519374b4ee))
