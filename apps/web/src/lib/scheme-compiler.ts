import { parse } from 'yaml';
import {
	appRoles,
	roleCss,
	slideRoles,
	slots,
	type AppRoles,
	type Palette,
	type SlideRoles
} from '#lib/color-roles.ts';

export type Variant = 'dark' | 'light';

/** One Base16 scheme as the app stores it, with each color role written as CSS over `--base00` to `--base0F`. */
export type Scheme = {
	slug: string;
	name: string;
	/** Empty when upstream credits no one. */
	author: string;
	variant: Variant;
	colors: Palette;
	/** No foreground reaches 4.5:1 against both base00 and base01, so body text falls short of WCAG AA. */
	lowContrast: boolean;
	roles: Record<keyof SlideRoles, string>;
	appRoles: Record<keyof AppRoles, string>;
};

export type SchemeFile = { source: string; commit: string; schemes: Scheme[] };

const hexColor = /^#[\da-f]{6}$/i;
const slugPattern = /^[\da-z-]+$/;

function text(value: unknown, field: string, slug: string, { optional = false } = {}): string {
	if (optional && (value === undefined || value === null)) return '';
	if (typeof value !== 'string') throw new TypeError(`${slug}: \`${field}\` is not a string.`);
	if (!optional && value.trim() === '') throw new Error(`${slug}: \`${field}\` is missing.`);
	return value.trim();
}

function parseYaml(slug: string, yamlText: string): unknown {
	try {
		return parse(yamlText);
	} catch (error) {
		throw new Error(`${slug}: ${(error as Error).message}`, { cause: error });
	}
}

function cssRoles<T extends Record<string, Parameters<typeof roleCss>[0]>>(roles: T): Record<keyof T, string> {
	return Object.fromEntries(Object.entries(roles).map(([name, role]) => [name, roleCss(role)])) as Record<
		keyof T,
		string
	>;
}

/** Reads one scheme file from tinted-theming's `base16/` folder. */
export function compileScheme(slug: string, yamlText: string): Scheme {
	const data = parseYaml(slug, yamlText) as Record<string, unknown> | null;
	if (!data || typeof data !== 'object') throw new Error(`${slug}: not a YAML mapping.`);
	if (data.system !== 'base16') throw new Error(`${slug}: \`system\` is not base16.`);
	const variant = data.variant;
	if (variant !== 'dark' && variant !== 'light') throw new Error(`${slug}: \`variant\` is not dark or light.`);
	const palette = (data.palette ?? {}) as Record<string, unknown>;
	const colors = Object.fromEntries(
		slots.map((slot) => {
			const color = palette[`base${slot}`];
			if (typeof color !== 'string' || !hexColor.test(color)) {
				throw new Error(`${slug}: \`base${slot}\` is not a #rrggbb color.`);
			}
			return [`base${slot}`, color.toLowerCase()];
		})
	) as Palette;
	const slide = slideRoles(colors);
	return {
		slug,
		name: text(data.name, 'name', slug),
		author: text(data.author, 'author', slug, { optional: true }),
		variant,
		colors,
		lowContrast: slide.body.short === true,
		roles: cssRoles(slide),
		appRoles: cssRoles(appRoles(colors, slide))
	};
}

/** Compiles every `.yaml` and `.yml` file in tinted-theming's `base16/` folder, sorted by slug. */
export function compileSchemes(files: { name: string; text: string }[], source: string, commit: string): SchemeFile {
	const schemes = files
		.map(({ name, text }) => ({ slug: name.replace(/\.ya?ml$/i, ''), name, text }))
		.filter(({ slug, name }) => slug !== name)
		.map((file) => {
			if (!slugPattern.test(file.slug)) throw new Error(`${file.name}: a slug takes only a-z, 0-9 and -.`);
			return file;
		})
		.toSorted((a, b) => a.slug.localeCompare(b.slug, 'en'))
		.map(({ slug, text }) => compileScheme(slug, text));
	const seen = new Set<string>();
	for (const { slug } of schemes) {
		if (seen.has(slug)) throw new Error(`${slug}: two files share this slug.`);
		seen.add(slug);
	}
	return { source, commit, schemes };
}

/** The outputs whose committed text, as `read` returns it, differs from what the compiler wrote. */
export function staleOutputs<T extends { file: string; text: string }>(
	outputs: T[],
	read: (file: string) => string | undefined
): T[] {
	return outputs.filter(({ file, text }) => read(file) !== text);
}

export function serializeSchemes(file: SchemeFile): string {
	return `${JSON.stringify(file, undefined, '\t')}\n`;
}
