export const slots = [
	'00',
	'01',
	'02',
	'03',
	'04',
	'05',
	'06',
	'07',
	'08',
	'09',
	'0A',
	'0B',
	'0C',
	'0D',
	'0E',
	'0F'
] as const;

export type Slot = (typeof slots)[number];

/** A Base16 scheme's 16 colors as `#rrggbb`, keyed `base00` to `base0F`. */
export type Palette = Record<`base${Slot}`, string>;

/**
 * A role's color: a plain slot, or `slot` mixed in OKLab with `toward` at `percent`% of `slot`. `short` marks a role
 * that reached no floor and fell back to `toward`'s color.
 */
export type Role = { slot: Slot; hex: string; toward?: Slot; percent?: number; short?: true };

export type SlideRoles = Record<
	'bg' | 'surface' | 'border' | 'selection' | 'body' | 'heading' | 'muted' | 'link' | 'accent',
	Role
>;

export type AppRoles = Record<
	| 'canvas'
	| 'panel'
	| 'selected'
	| 'border'
	| 'text'
	| 'secondary'
	| 'disabled'
	| 'focus'
	| 'primary'
	| 'onPrimary'
	| 'danger',
	Role
>;

/** WCAG contrast for body text. */
export const textFloor = 4.5;
/** WCAG contrast for large text and interface parts, which the accent is held to. */
export const accentFloor = 3;

function channels(hex: string): number[] {
	return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
}

function linear(channel: number): number {
	return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function gamma(channel: number): number {
	return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function toByte(linearChannel: number): number {
	const channel = gamma(linearChannel);
	return Math.round(Math.min(1, Math.max(0, channel)) * 255);
}

function luminance(hex: string): number {
	const [r, g, b] = channels(hex).map((channel) => linear(channel));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG 2 contrast ratio between two `#rrggbb` colors. */
export function contrast(a: string, b: string): number {
	const x = luminance(a);
	const y = luminance(b);
	return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function toOklab(hex: string): number[] {
	const [r, g, b] = channels(hex).map((channel) => linear(channel));
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	];
}

function fromOklab([lightness, a, b]: number[]): string {
	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const rgb = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
	];
	return `#${rgb.map((channel) => toByte(channel).toString(16).padStart(2, '0')).join('')}`;
}

/** What `color-mix(in oklab, a percent%, b)` gives, rounded to `#rrggbb`. */
export function mix(a: string, b: string, percent: number): string {
	const x = toOklab(a);
	const y = toOklab(b);
	const t = percent / 100;
	return fromOklab(x.map((value, index) => value * t + y[index] * (1 - t)));
}

// Text sits on base00 and on base01 (callouts, app panels), so a floor holds against the weaker of the two.
function worstContrast(hex: string, palette: Palette): number {
	return Math.min(contrast(hex, palette.base00), contrast(hex, palette.base01));
}

/** The foreground slot with the best worst-case contrast, preferring base05, then base06, base07 and base04. */
export function strongestForeground(palette: Palette): Slot {
	let best: { slot: Slot; ratio: number } | undefined;
	for (const slot of ['05', '06', '07', '04'] as const) {
		const ratio = worstContrast(palette[`base${slot}`], palette);
		if (!best || ratio > best.ratio) best = { slot, ratio };
	}
	return best!.slot;
}

/**
 * The first candidate that reaches `floor`; failing that, the first candidate mixed toward `toward` in 5% steps from 95%
 * until it does; failing that, `toward` itself, marked short.
 */
export function guard(palette: Palette, candidates: readonly Slot[], floor: number, toward: Slot): Role {
	for (const slot of candidates) {
		const hex = palette[`base${slot}`];
		if (worstContrast(hex, palette) >= floor) return { slot, hex };
	}
	const [slot] = candidates;
	const target = palette[`base${toward}`];
	for (let percent = 95; percent >= 0; percent -= 5) {
		const hex = mix(palette[`base${slot}`], target, percent);
		if (worstContrast(hex, palette) >= floor) return { slot, hex, toward, percent };
	}
	return { slot: toward, hex: target, short: true };
}

function plain(palette: Palette, slot: Slot): Role {
	return { slot, hex: palette[`base${slot}`] };
}

/** The roles slides read, each text role mixed toward the strongest foreground until it reaches its floor. */
export function slideRoles(palette: Palette): SlideRoles {
	const top = strongestForeground(palette);
	const body = guard(palette, ['05', '06', '07'], textFloor, top);
	const heading = plain(palette, top);
	return {
		bg: plain(palette, '00'),
		surface: plain(palette, '01'),
		border: plain(palette, '02'),
		selection: plain(palette, '02'),
		body,
		heading: worstContrast(heading.hex, palette) < worstContrast(body.hex, palette) ? body : heading,
		muted: guard(palette, ['04'], textFloor, body.toward ? top : body.slot),
		link: guard(palette, ['0D'], textFloor, top),
		accent: guard(palette, ['0E'], accentFloor, top)
	};
}

/** The roles the app's interface reads, derived from the slide roles. */
export function appRoles(palette: Palette, slide: SlideRoles = slideRoles(palette)): AppRoles {
	const onPrimary =
		contrast(palette.base00, slide.link.hex) >= contrast(palette.base07, slide.link.hex) ? '00' : '07';
	return {
		canvas: slide.bg,
		panel: slide.surface,
		selected: slide.selection,
		border: slide.border,
		text: slide.body,
		secondary: slide.muted,
		disabled: plain(palette, '03'),
		focus: slide.link,
		primary: slide.link,
		onPrimary: plain(palette, onPrimary),
		danger: guard(palette, ['08'], textFloor, strongestForeground(palette))
	};
}

/** A role as CSS: `var(--baseNN)`, or `color-mix(in oklab, ...)` of two of them. */
export function roleCss(role: Role): string {
	return role.percent === undefined || role.toward === undefined
		? `var(--base${role.slot})`
		: `color-mix(in oklab, var(--base${role.slot}) ${role.percent}%, var(--base${role.toward}))`;
}
