import createDOMPurify, { type Config, type DOMPurify } from 'dompurify';
import { markdownToMdast } from 'satteri';
import { cleanRawHtml, type HtmlVerdict, type RawHtml } from '#lib/raw-html.ts';
import { markdownFeatures } from '#lib/slide-render.ts';

// Iframes stay, as slides embed pages with them; DOMPurify drops `srcdoc` and checks `src` like any URL. A page in
// another origin can't reach this one's storage.
const config: Config = {
	FORCE_BODY: true,
	ADD_TAGS: ['iframe'],
	ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'loading', 'referrerpolicy']
};

// The elements a raw HTML node may leave open for the markdown after it, as `<div class="columns">` on a line of its
// own does. Each parses what follows it as ordinary HTML, unlike foreign content such as SVG or raw text such as
// `<textarea>`, which would read what follows in a way the check never saw.
const openable = new Set(
	'a abbr article aside b blockquote center cite code dd del details div dl dt em figcaption figure footer header i ins kbd li main mark nav ol p pre q s section small span strong sub summary sup table tbody td tfoot th thead tr u ul'.split(
		' '
	)
);

const purifier: { instance?: DOMPurify } = {};

function purify(): DOMPurify {
	purifier.instance ??= createDOMPurify();
	return purifier.instance;
}

/** The raw HTML nodes in a slide's markdown, as Sätteri parses it when it shows the slide, in order. */
export function findRawHtml(markdown: string): RawHtml[] {
	type Node = {
		type: string;
		value?: string;
		position?: { start: { offset: number }; end: { offset: number } };
		children?: Node[];
	};
	const found: RawHtml[] = [];
	const visit = (node: Node) => {
		if (node.type === 'html' && node.position && typeof node.value === 'string') {
			found.push({ start: node.position.start.offset, end: node.position.end.offset, value: node.value });
		}
		const children = node.children ?? [];
		for (const child of children) visit(child);
	};
	visit(markdownToMdast(markdown, { features: markdownFeatures }) as Node);
	return found;
}

/** `html` parsed as DOMPurify parses it, in an inert document that runs and loads nothing. */
function parse(html: string): HTMLElement {
	const { body } = new DOMParser().parseFromString(`<remove></remove>${html}`, 'text/html');
	body.firstChild?.remove();
	return body;
}

/**
 * The elements `html` leaves open, innermost first, found by parsing a marker after it, or undefined when the marker
 * doesn't parse as an element: `html` ends inside a tag, a comment or raw text.
 */
function openElements(html: string): Element[] | undefined {
	const marker = `sld-end-${crypto.randomUUID()}`;
	const body = parse(`${html}<${marker}></${marker}>`);
	const end = body.querySelector(marker);
	if (!end) return undefined;
	const open: Element[] = [];
	for (let element = end.parentElement; element && element !== body; element = element.parentElement) {
		open.push(element);
	}
	return open;
}

function isSafelyOpen(open: Element[] | undefined): open is Element[] {
	return (
		open !== undefined &&
		open.every(
			({ namespaceURI, localName }) => namespaceURI === 'http://www.w3.org/1999/xhtml' && openable.has(localName)
		)
	);
}

/**
 * Whether `html` is safe as it is: DOMPurify takes nothing out of it, and it leaves open only elements that parse
 * what follows as ordinary HTML.
 */
function isSafe(html: string): boolean {
	const purified = purify().sanitize(html, { ...config, RETURN_DOM: true });
	return parse(html).isEqualNode(purified) && isSafelyOpen(openElements(html));
}

/**
 * What DOMPurify leaves of a raw HTML node. A node that left elements open, such as `<div onclick="…">` on a line of
 * its own, leaves the same elements open, so the markdown after it stays inside them.
 */
function safeForm(html: string): string {
	const purified = purify().sanitize(html, config);
	const open = openElements(html);
	if (isSafelyOpen(open) && open.length > 0) {
		const closing = open.map(({ localName }) => `</${localName}>`).join('');
		const opened = purified.endsWith(closing) ? purified.slice(0, -closing.length) : undefined;
		if (opened !== undefined && isSafe(opened)) return opened;
	}
	return purified;
}

/** Checks one raw HTML node of an imported slide with DOMPurify. Needs a DOM. */
export function checkHtml(html: string): HtmlVerdict {
	return isSafe(html) ? { isSafe: true } : { isSafe: false, replacement: safeForm(html) };
}

/**
 * An imported slide's markdown with its raw HTML made safe by DOMPurify, so no script or event handler in it runs once
 * it is stored. Markdown text, code and the slide's frontmatter stay as they are. Needs a DOM.
 */
export function cleanImportedSlide(slide: string): string {
	return cleanRawHtml(slide, { find: findRawHtml, check: checkHtml });
}
