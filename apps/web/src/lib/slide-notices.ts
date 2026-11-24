import { errorText } from '#lib/error-text.ts';
import type { SlideWarning } from '#lib/slide-meta.ts';
import { RendererLoadError } from '#lib/slide-render.ts';

/** A piece of a notice: plain text, or a value from the slide's markdown, which shows as code. */
export type NoticePart = string | { code: string };

/** One line the editor shows under the markdown, and the line of the slide it is about, counted from 1, if known. */
export type Notice = { parts: NoticePart[]; line?: number };

function shown(value: unknown): string {
	if (typeof value === 'string') return value;
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

/** What the editor says about a warning from reading a slide's frontmatter. */
export function warningNotice(warning: SlideWarning): Notice {
	const parts = warningParts(warning);
	return warning.line === undefined ? { parts } : { parts, line: warning.line };
}

function warningParts(warning: SlideWarning): NoticePart[] {
	switch (warning.kind) {
		case 'invalid-frontmatter': {
			return [`The frontmatter couldn't be read, so it's ignored: ${warning.message}`];
		}
		case 'unknown-layout': {
			return [{ code: shown(warning.value) }, " isn't a layout, so the slide uses the default."];
		}
		case 'invalid-notes': {
			return ["The notes aren't text, so the slide has none."];
		}
		case 'invalid-class': {
			return [{ code: shown(warning.value) }, " isn't a class name, so it's left out."];
		}
		case 'reserved-class': {
			return [{ code: warning.value }, " is a class sld uses itself, so it's left out."];
		}
		case 'invalid-scheme': {
			return ["The scheme isn't text, so the slide uses the deck's."];
		}
	}
}

/** What the editor says when a slide couldn't be rendered at all. */
export function failureNotice(error: unknown): Notice {
	return {
		parts: [
			error instanceof RendererLoadError
				? `Slides couldn't be loaded. Reload the page to try again: ${error.message}`
				: `This slide couldn't be shown: ${errorText(error)}`
		]
	};
}
