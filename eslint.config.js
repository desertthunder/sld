import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import unicorn from 'eslint-plugin-unicorn';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	{ ignores: ['.claude/**'] },
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	unicorn.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint recommends turning no-undef off for TypeScript projects:
			// https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off',
			'unicorn/filename-case': ['error', { case: 'kebabCase' }],
			// `Props` is Svelte's name for component props, and SvelteKit generates `LayoutProps` and `PageProps`.
			'unicorn/name-replacements': ['error', { allowList: { Props: true } }],
			// The repo keeps conventional JSDoc style: ` * ` prefixes, and one-line docs on one line.
			'unicorn/no-asterisk-prefix-in-documentation-comments': 'off',
			'unicorn/single-line-block-comment-style': 'off'
		}
	},
	{
		// Svelte components are PascalCase; everything else is kebab-case.
		files: ['**/*.svelte'],
		rules: { 'unicorn/filename-case': ['error', { cases: { kebabCase: true, pascalCase: true } }] }
	},
	{
		// SvelteKit fixes the names of the page options `ssr`, `csr` and `prerender`.
		files: ['apps/web/src/routes/**/+*.ts'],
		rules: { 'unicorn/consistent-boolean-name': ['error', { ignore: ['^(ssr|csr|prerender)$'] }] }
	},
	{
		// SvelteKit generates this placeholder and the repo keeps it as generated.
		files: ['apps/web/src/lib/index.ts'],
		rules: { 'unicorn/no-empty-file': 'off' }
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: { projectService: true, extraFileExtensions: ['.svelte'], parser: ts.parser }
		}
	}
);
