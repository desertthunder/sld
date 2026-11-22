import { defineConfig, presetIcons } from 'unocss';

// Icons only: styles stay in the components and read the scheme's variables. Mask mode draws in `currentColor`.
export default defineConfig({
	presets: [presetIcons({ mode: 'mask', extraProperties: { display: 'inline-block', 'flex-shrink': '0' } })]
});
