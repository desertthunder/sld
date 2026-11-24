import createDOMPurify, { type Config, type DOMPurify } from 'dompurify';
import { markdownToMdast } from 'satteri';
import { cleanRawHtml, type FoundHtml, type HtmlVerdict, type RawHtml } from '#lib/raw-html.ts';
import { markdownFeatures } from '#lib/slide-render.ts';

// Iframes stay, as slides embed pages with them, but only from an https address, sandboxed in an origin of their own,
// and with only the features an embedded video or slide deck uses. `srcdoc` never stays.
const config: Config = {
	FORCE_BODY: true,
	ADD_TAGS: ['iframe', '#comment'],
	ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'loading', 'referrerpolicy', 'target'],
	FORBID_ATTR: ['srcdoc'],
	// `isEqualNode` doesn't compare a template's content, so the check couldn't see what DOMPurify took out of it.
	FORBID_TAGS: ['template']
};

/** The sandbox every imported iframe gets. Without `allow-same-origin`, its page can't reach sld's storage. */
const frameSandbox = 'allow-scripts allow-presentation allow-popups';

const frameFeatures = new Set([
	'accelerometer',
	'autoplay',
	'clipboard-write',
	'encrypted-media',
	'fullscreen',
	'gyroscope',
	'picture-in-picture',
	'web-share'
]);

/** An iframe's `allow` list with only the features in `frameFeatures`, or undefined when none is left. */
function frameAllow(allow: string): string | undefined {
	const kept = allow
		.split(';')
		.map((directive) => directive.trim())
		.filter((directive) => frameFeatures.has(directive.split(/\s/, 1)[0]!.toLowerCase()));
	return kept.length > 0 ? kept.join('; ') : undefined;
}

function guardFrame(node: Element): void {
	if (node.localName !== 'iframe') return;
	if (!/^https:\/\//i.test(node.getAttribute('src') ?? '')) {
		node.remove();
		return;
	}
	node.setAttribute('sandbox', frameSandbox);
	const allow = node.getAttribute('allow');
	if (allow === null) return;
	const kept = frameAllow(allow);
	if (kept === undefined) node.removeAttribute('allow');
	else if (kept !== allow) node.setAttribute('allow', kept);
}

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
	if (!purifier.instance) {
		purifier.instance = createDOMPurify();
		purifier.instance.addHook('afterSanitizeAttributes', guardFrame);
	}
	return purifier.instance;
}

// The nodes whose children are a line of text, where raw HTML nodes next to each other show as one piece of HTML.
const phrasing = new Set([
	'paragraph',
	'heading',
	'tableCell',
	'emphasis',
	'strong',
	'delete',
	'link',
	'linkReference'
]);

const escapeText = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/**
 * The raw HTML nodes in a slide's markdown, as Sätteri parses it when it shows the slide, in order. Inline nodes with
 * only text between them come as one run, with the HTML Sätteri writes for the run.
 */
export function findRawHtml(markdown: string): FoundHtml[] {
	type Node = {
		type: string;
		value?: string;
		position?: { start: { offset: number }; end: { offset: number } };
		children?: Node[];
	};
	const found: FoundHtml[] = [];
	const raw = (node: Node): RawHtml | undefined =>
		node.type === 'html' && node.position && typeof node.value === 'string'
			? { start: node.position.start.offset, end: node.position.end.offset, value: node.value }
			: undefined;
	const addRun = (run: Node[]) => {
		const first = run.findIndex((node) => raw(node));
		const last = run.findLastIndex((node) => raw(node));
		const inRun = run.slice(first, last + 1);
		const parts = inRun.map((node) => raw(node)).filter((part) => part !== undefined);
		if (parts.length < 2) {
			found.push(...parts);
			return;
		}
		const value = inRun.map((node) => raw(node)?.value ?? escapeText(node.value ?? '')).join('');
		found.push({ start: parts[0]!.start, end: parts.at(-1)!.end, value, parts });
	};
	const visit = (node: Node) => {
		const isPhrasing = phrasing.has(node.type);
		const children = node.children ?? [];
		let run: Node[] = [];
		for (const child of children) {
			if (child.type === 'html' || (isPhrasing && child.type === 'text')) {
				run.push(child);
				if (!isPhrasing) {
					addRun(run);
					run = [];
				}
			} else {
				addRun(run);
				run = [];
				visit(child);
			}
		}
		addRun(run);
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
