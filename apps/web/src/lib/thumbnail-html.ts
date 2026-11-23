const defaultFrameSize = { width: '300px', height: '150px' };

/** An iframe's `width` or `height` attribute as a CSS length, or `fallback` for a missing or malformed one. */
function frameLength(value: string | null, fallback: string): string {
	if (value && /^\d+(?:\.\d+)?$/.test(value)) return `${value}px`;
	if (value && /^\d+(?:\.\d+)?%$/.test(value)) return value;
	return fallback;
}

/**
 * A slide's HTML for its thumbnail, with each iframe swapped for an empty box of the same size, so a thumbnail loads
 * no page. The HTML is parsed in a template, whose content loads nothing.
 */
export function thumbnailHtml(html: string): string {
	if (!/<iframe/i.test(html)) return html;
	const template = document.createElement('template');
	template.innerHTML = html;
	for (const frame of template.content.querySelectorAll('iframe')) {
		const box = document.createElement('span');
		box.dataset.frame = '';
		const classes = frame.getAttribute('class');
		if (classes) box.setAttribute('class', classes);
		const width = frameLength(frame.getAttribute('width'), defaultFrameSize.width);
		const height = frameLength(frame.getAttribute('height'), defaultFrameSize.height);
		box.setAttribute('style', `width: ${width}; height: ${height}; ${frame.getAttribute('style') ?? ''}`);
		frame.replaceWith(box);
	}
	return template.getHTML();
}
