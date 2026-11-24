/** A slide's HTML with its style sheets scoped to it, and the `data-slide-scope` its element needs, if it has any. */
export type ScopedSlide = { html: string; scope: string | undefined };

/** The font families the app draws its own text in, which a slide's `@font-face` may not redefine. */
export const appFontFamilies: ReadonlySet<string> = new Set([
	'mona sans variable',
	'hubot sans variable',
	'monaspace neon'
]);

/** Whether the app's own keyframes may be named `name`: Svelte's start with `svelte-`, and CodeMirror's with `cm-`. */
export function isAppAnimation(name: string): boolean {
	return /^(?:svelte|cm)-/i.test(name);
}

/**
 * A hash of the slide's HTML, so the same slide gets the same scope wherever it draws, and the presenter, the preview
 * and a thumbnail match, while two different slides on one page are all but certain to get different ones.
 */
function scopeName(html: string): string {
	let first = 0xde_ad_be_ef;
	let second = 0x41_c6_ce_57;
	for (let at = 0; at < html.length; at++) {
		const code = html.codePointAt(at)!;
		first = Math.imul(first ^ code, 2_654_435_761);
		second = Math.imul(second ^ code, 1_597_334_677);
	}
	first = Math.imul(first ^ (first >>> 16), 2_246_822_507) ^ Math.imul(second ^ (second >>> 13), 3_266_489_909);
	second = Math.imul(second ^ (second >>> 16), 2_246_822_507) ^ Math.imul(first ^ (first >>> 13), 3_266_489_909);
	return (4_294_967_296 * (2_097_151 & second) + (first >>> 0)).toString(36);
}

function familyName(rule: CSSFontFaceRule): string {
	return rule.style
		.getPropertyValue('font-family')
		.replaceAll(/["']/g, '')
		.replaceAll(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

// Inside `@scope`, a selector with no `:scope` in it only matches below the slide's element, as if it began with
// `:scope `, so `.slide` or `article p` would stop matching. With this on its subject, a selector matches as it did,
// with no more specificity, and `@scope` still keeps it to the slide's element and what is in it.
const inScope = ':where(:scope, :scope *)';

const depthChange: Partial<Record<string, number>> = { '(': 1, '[': 1, ')': -1, ']': -1 };

/** Each selector in a list the browser wrote, with `inScope` added to its last compound, before any pseudo-element. */
function scopeSelectors(list: string): string {
	const selectors: string[] = [];
	let depth = 0;
	let quote: string | undefined;
	let start = 0;
	let pseudo: number | undefined;
	const add = (end: number) => {
		const cut = pseudo ?? end;
		selectors.push(`${list.slice(start, cut).trimStart()}${inScope}${list.slice(cut, end)}`);
	};
	for (let at = 0; at < list.length; at++) {
		const char = list[at]!;
		if (char === '\\') {
			at++;
			continue;
		}
		if (quote) {
			if (char === quote) quote = undefined;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		depth += depthChange[char] ?? 0;
		if (depth > 0) continue;
		if (char === ',') {
			add(at);
			start = at + 1;
			pseudo = undefined;
		} else if (char === ':' && list[at + 1] === ':') {
			pseudo ??= at;
			at++;
		}
	}
	add(list.length);
	return selectors.join(', ');
}

/** Adds `inScope` to each style rule in `rules` that isn't nested in another, leaving a slide's own `@scope` alone. */
function scopeRules(rules: CSSRuleList): void {
	for (const rule of rules) {
		if (rule instanceof CSSStyleRule) rule.selectorText = scopeSelectors(rule.selectorText);
		else if (rule instanceof CSSGroupingRule && !(rule instanceof CSSScopeRule)) scopeRules(rule.cssRules);
	}
}

/**
 * `css` as the browser reads it, with every rule that selects elements, and every at-rule that holds rules, such as
 * `@media`, inside an `@scope` rooted at the slide, so a rule only matches the slide and what is in it. Fonts,
 * keyframes and counter styles are defined by name for the whole page, so they stay outside it, except fonts and
 * keyframes that would replace the app's own. Every other rule, such as `@import` or `@property`, would reach past the
 * slide and is dropped.
 */
function scopedSheet(css: string, scope: string): string {
	const sheet = new CSSStyleSheet();
	sheet.replaceSync(css);
	scopeRules(sheet.cssRules);
	const named: string[] = [];
	const scoped: string[] = [];
	for (const rule of sheet.cssRules) {
		if (rule instanceof CSSFontFaceRule) {
			if (!appFontFamilies.has(familyName(rule))) named.push(rule.cssText);
		} else if (rule instanceof CSSKeyframesRule) {
			if (!isAppAnimation(rule.name)) named.push(rule.cssText);
		} else if (rule instanceof CSSCounterStyleRule) {
			named.push(rule.cssText);
		} else if (
			rule instanceof CSSStyleRule ||
			rule instanceof CSSGroupingRule ||
			rule instanceof CSSLayerStatementRule
		) {
			scoped.push(rule.cssText);
		}
	}
	if (scoped.length > 0) named.push(`@scope ([data-slide-scope="${scope}"]) {\n${scoped.join('\n')}\n}`);
	// The browser writes a CSS escape such as `\3c` as the character, and `</style` in a string would end the element.
	return named.join('\n').replaceAll(/<\/(?=style)/gi, String.raw`<\/`);
}

/**
 * A slide's HTML with the rules of each `<style>` in it, SVG's included, scoped to the slide's element, so a slide's
 * styles can't restyle the page around it. HTML with no `<style>` comes back as it is. Needs a DOM.
 */
export function scopeSlideStyles(html: string): ScopedSlide {
	if (!/<style/i.test(html)) return { html, scope: undefined };
	const template = document.createElement('template');
	template.innerHTML = html;
	const styles = template.content.querySelectorAll('style');
	if (styles.length === 0) return { html, scope: undefined };
	const scope = scopeName(html);
	for (const style of styles) style.textContent = scopedSheet(style.textContent, scope);
	return { html: template.getHTML(), scope };
}
