import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Gh } from './github.ts';
import { pr } from './pr.ts';

const directory = mkdtempSync(path.join(tmpdir(), 'devtools-pr-'));
const bodyFile = path.join(directory, 'body.md');
writeFileSync(bodyFile, 'Review loop finished at abc\n');
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const sendNothing: Gh = (_stdin, ghArguments) => {
	throw new Error(`gh ${ghArguments.join(' ')} ran`);
};

describe('pr', () => {
	it('takes the repository and pull request from the environment and prints a dry run', () => {
		let out = '';
		pr(
			['ready', '--body-file', bodyFile],
			{ REPO: 'desertthunder/sld', PR: '7', DRY_RUN: '1' },
			{ gh: sendNothing, log: (text) => (out += text) }
		);
		expect(out).toBe(
			'DRY_RUN mark desertthunder/sld#7 ready for review\n' +
				'DRY_RUN comment on desertthunder/sld#7:\nReview loop finished at abc\n\n'
		);
	});

	it('lets flags override the environment', () => {
		let out = '';
		pr(
			['comment', '--body-file', bodyFile, '--repo', 'a/b', '--pr', '9', '--dry-run'],
			{ REPO: 'x/y', PR: '1' },
			{ gh: sendNothing, log: (text) => (out += text) }
		);
		expect(out).toContain('DRY_RUN comment on a/b#9:');
	});

	it('refuses an unknown mode', () => {
		expect(() => pr(['approve', '--body-file', bodyFile], { REPO: 'a/b', PR: '1' })).toThrow('expected one mode');
	});

	it('requires the repository, pull request and body file', () => {
		expect(() => pr(['comment', '--body-file', bodyFile], { PR: '1' })).toThrow('are required');
		expect(() => pr(['comment'], { REPO: 'a/b', PR: '1' })).toThrow('are required');
	});
});
