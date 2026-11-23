import type { Scheme } from '#lib/scheme-compiler.ts';

function kebab(name: string): string {
	return name.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * A scheme as the CSS custom properties `scheme.css` defines: `--base00` to `--base0F`, the slide roles, the app roles
 * in kebab case and the `--code-*` token colors. A role takes its color where it is defined, so an element that sets
 * new `--base*` colors must set the roles again too.
 */
export function schemeProperties({ colors, roles, appRoles, tokens }: Scheme): Record<string, string> {
	return {
		...Object.fromEntries(Object.entries(colors).map(([slot, hex]) => [`--${slot}`, hex])),
		...Object.fromEntries(Object.entries(roles).map(([role, css]) => [`--${role}`, css])),
		...Object.fromEntries(Object.entries(appRoles).map(([role, css]) => [`--${kebab(role)}`, css])),
		...Object.fromEntries(Object.entries(tokens).map(([kind, css]) => [`--code-${kind}`, css]))
	};
}

/** A scheme as an inline `style`: its custom properties, and the `color-scheme` that matches its variant. */
export function schemeStyle(scheme: Scheme): string {
	return [
		...Object.entries(schemeProperties(scheme)).map(([name, value]) => `${name}: ${value}`),
		`color-scheme: ${scheme.variant}`
	].join('; ');
}
