import { describe, expect, it } from 'vitest';
import {
	appRoles,
	contrast,
	guard,
	mix,
	roleCss,
	slideRoles,
	slots,
	strongestForeground,
	tokenRoles,
	tokenSlots,
	type Palette
} from '#lib/color-roles.ts';

const palette = (...colors: string[]) =>
	Object.fromEntries(slots.map((slot, index) => [`base${slot}`, colors[index]])) as Palette;

const defaultDark = palette(
	'#181818',
	'#282828',
	'#383838',
	'#585858',
	'#b8b8b8',
	'#d8d8d8',
	'#e8e8e8',
	'#f8f8f8',
	'#ab4642',
	'#dc9656',
	'#f7ca88',
	'#a1b56c',
	'#86c1b9',
	'#7cafc2',
	'#ba8baf',
	'#a16946'
);

const defaultLight = palette(
	'#f8f8f8',
	'#e8e8e8',
	'#d8d8d8',
	'#b8b8b8',
	'#585858',
	'#383838',
	'#282828',
	'#181818',
	'#ab4642',
	'#dc9656',
	'#f7ca88',
	'#a1b56c',
	'#86c1b9',
	'#7cafc2',
	'#ba8baf',
	'#a16946'
);

const tango = palette(
	'#2e3436',
	'#8ae234',
	'#fce94f',
	'#555753',
	'#729fcf',
	'#d3d7cf',
	'#ad7fa8',
	'#eeeeec',
	'#cc0000',
	'#ef2929',
	'#c4a000',
	'#4e9a06',
	'#06989a',
	'#3465a4',
	'#75507b',
	'#34e2e2'
);

const css = <T extends Record<string, Parameters<typeof roleCss>[0]>>(roles: T) =>
	Object.fromEntries(Object.entries(roles).map(([name, role]) => [name, roleCss(role)]));

describe('contrast', () => {
	it('gives the WCAG ratios for black, white and equal colors', () => {
		expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
		expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
		expect(contrast('#777777', '#777777')).toBe(1);
		expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
	});
});

describe('mix', () => {
	it('gives the first color at 100%, the second at 0%, and gray between black and white', () => {
		expect(mix('#ab4642', '#7cafc2', 100)).toBe('#ab4642');
		expect(mix('#ab4642', '#7cafc2', 0)).toBe('#7cafc2');
		expect(mix('#000000', '#ffffff', 50)).toBe('#636363');
	});
});

describe('guard', () => {
	it('takes the first candidate that reaches the floor', () => {
		expect(guard(defaultDark, ['05', '06'], 4.5, '07')).toEqual({ slot: '05', hex: '#d8d8d8' });
		expect(guard(defaultDark, ['03', '04'], 4.5, '07')).toEqual({ slot: '04', hex: '#b8b8b8' });
	});

	it('mixes the first candidate toward the target in 5% steps until it reaches the floor', () => {
		const role = guard(defaultDark, ['08'], 4.5, '07');
		expect(role).toMatchObject({ slot: '08', toward: '07', percent: 70 });
		expect(
			Math.min(contrast(role.hex, defaultDark.base00), contrast(role.hex, defaultDark.base01))
		).toBeGreaterThan(4.5);
		expect(roleCss(role)).toBe('color-mix(in oklab, var(--base08) 70%, var(--base07))');
	});

	it('falls back to the target, marked short, when even the target misses the floor', () => {
		expect(guard(defaultDark, ['02'], 21, '07')).toEqual({ slot: '07', hex: '#f8f8f8', short: true });
	});
});

describe('strongestForeground', () => {
	it('picks the foreground with the best contrast against both base00 and base01', () => {
		expect(strongestForeground(defaultDark)).toBe('07');
		expect(strongestForeground(defaultLight)).toBe('07');
		expect(strongestForeground(tango)).toBe('06');
	});
});

describe('roles', () => {
	it('keeps Default Dark on plain slots except danger, which mixes toward base07', () => {
		expect(css(slideRoles(defaultDark))).toEqual({
			bg: 'var(--base00)',
			surface: 'var(--base01)',
			border: 'var(--base02)',
			selection: 'var(--base02)',
			body: 'var(--base05)',
			heading: 'var(--base07)',
			muted: 'var(--base04)',
			link: 'var(--base0D)',
			accent: 'var(--base0E)'
		});
		expect(css(appRoles(defaultDark))).toEqual({
			canvas: 'var(--base00)',
			panel: 'var(--base01)',
			selected: 'var(--base02)',
			border: 'var(--base02)',
			text: 'var(--base05)',
			secondary: 'var(--base04)',
			disabled: 'var(--base03)',
			focus: 'var(--base0D)',
			primary: 'var(--base0D)',
			onPrimary: 'var(--base00)',
			danger: 'color-mix(in oklab, var(--base08) 70%, var(--base07))'
		});
	});

	it('darkens the link and accent of Default Light toward base07 until they reach their floors', () => {
		const link = 'color-mix(in oklab, var(--base0D) 55%, var(--base07))';
		expect(css(slideRoles(defaultLight))).toEqual({
			bg: 'var(--base00)',
			surface: 'var(--base01)',
			border: 'var(--base02)',
			selection: 'var(--base02)',
			body: 'var(--base05)',
			heading: 'var(--base07)',
			muted: 'var(--base04)',
			link,
			accent: 'color-mix(in oklab, var(--base0E) 85%, var(--base07))'
		});
		expect(css(appRoles(defaultLight))).toMatchObject({ focus: link, primary: link, danger: 'var(--base08)' });
	});

	it('sends every text role of Tango, whose base01 is bright green, to its strongest foreground, marked short', () => {
		const roles = slideRoles(tango);
		expect(roles.body.short).toBe(true);
		expect(css(roles)).toEqual({
			bg: 'var(--base00)',
			surface: 'var(--base01)',
			border: 'var(--base02)',
			selection: 'var(--base02)',
			body: 'var(--base06)',
			heading: 'var(--base06)',
			muted: 'var(--base06)',
			link: 'var(--base06)',
			accent: 'var(--base06)'
		});
		expect(css(appRoles(tango))).toMatchObject({ text: 'var(--base06)', danger: 'var(--base06)' });
	});

	it('uses the body color for headings when the body mix contrasts more than the strongest foreground', () => {
		const overshoot = palette(
			'#b42c20',
			'#b90f41',
			'#c2f994',
			'#4725d6',
			'#68edf1',
			'#cce354',
			'#4e8943',
			'#acbb21',
			'#814a9a',
			'#50bed2',
			'#bfeab8',
			'#825806',
			'#681cdc',
			'#3008c1',
			'#a0f87d',
			'#ef201c'
		);
		const roles = slideRoles(overshoot);
		expect(strongestForeground(overshoot)).toBe('04');
		expect(roles.body).toMatchObject({ slot: '05', toward: '04', percent: 30 });
		expect(roles.heading).toEqual(roles.body);
	});

	it('puts base07 on the primary color when it contrasts more than base00, as in a light scheme with a white base07', () => {
		const whiteTop = { ...defaultLight, base07: '#ffffff', base0D: '#3465a4' };
		expect(roleCss(appRoles(whiteTop).primary)).toBe('var(--base0D)');
		expect(roleCss(appRoles(whiteTop).onPrimary)).toBe('var(--base07)');
	});
});

describe('tokenRoles', () => {
	it('keeps the Base16 slots of Default Dark that reach 4.5:1, and mixes its comments and tags toward base07', () => {
		expect(css(tokenRoles(defaultDark))).toMatchInlineSnapshot(`
			{
			  "comment": "color-mix(in oklab, var(--base03) 60%, var(--base07))",
			  "constant": "var(--base09)",
			  "escape": "var(--base0C)",
			  "function": "var(--base0D)",
			  "keyword": "var(--base0E)",
			  "plain": "var(--base05)",
			  "string": "var(--base0B)",
			  "tag": "color-mix(in oklab, var(--base08) 70%, var(--base07))",
			  "type": "var(--base0A)",
			}
		`);
	});

	it('darkens the token colors of Default Light toward base07 until each reaches 4.5:1', () => {
		expect(css(tokenRoles(defaultLight))).toMatchInlineSnapshot(`
			{
			  "comment": "color-mix(in oklab, var(--base03) 50%, var(--base07))",
			  "constant": "color-mix(in oklab, var(--base09) 60%, var(--base07))",
			  "escape": "color-mix(in oklab, var(--base0C) 50%, var(--base07))",
			  "function": "color-mix(in oklab, var(--base0D) 55%, var(--base07))",
			  "keyword": "color-mix(in oklab, var(--base0E) 65%, var(--base07))",
			  "plain": "var(--base05)",
			  "string": "color-mix(in oklab, var(--base0B) 55%, var(--base07))",
			  "tag": "var(--base08)",
			  "type": "color-mix(in oklab, var(--base0A) 45%, var(--base07))",
			}
		`);
	});

	it('gives every kind a color that reaches 4.5:1 against base00 and base01, or the strongest foreground', () => {
		for (const colors of [defaultDark, defaultLight, tango]) {
			const top = strongestForeground(colors);
			const roles = Object.entries(tokenRoles(colors));
			for (const [kind, role] of roles) {
				const worst = Math.min(contrast(role.hex, colors.base00), contrast(role.hex, colors.base01));
				if (role.short) expect(role.slot, kind).toBe(top);
				else expect(worst, kind).toBeGreaterThanOrEqual(4.5);
				expect([tokenSlots[kind as keyof typeof tokenSlots], top], kind).toContain(role.slot);
			}
		}
	});
});
