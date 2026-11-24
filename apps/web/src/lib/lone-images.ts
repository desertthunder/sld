import { defineHastPlugin, type HastNode, type HastPluginDefinition } from 'satteri';

/**
 * The Sätteri plugin that marks a paragraph holding one image and nothing else with the class `lone-image`, so a slide
 * whose only content is that paragraph can fill its content area with the image.
 */
export function loneImages(): HastPluginDefinition {
	return defineHastPlugin({
		name: 'lone-images',
		element: {
			filter: ['p'],
			visit(paragraph, context) {
				const content = paragraph.children.filter(
					(child: HastNode) => child.type !== 'text' || child.value.trim() !== ''
				);
				const [only] = content;
				if (content.length !== 1 || only.type !== 'element' || only.tagName !== 'img') return;
				context.setProperty(paragraph, 'className', ['lone-image']);
			}
		}
	});
}
