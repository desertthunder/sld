import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildVersion, gitHead } from './build-version.ts';

const sha = '0ec2e83c1b9a4f7d2e6a5b8c9d0e1f2a3b4c5d6e';
const other = 'ef97223aa1b2c3d4e5f60718293a4b5c6d7e8f90';
const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const tagRun = { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.1.1', GITHUB_SHA: sha };

describe('buildVersion', () => {
	it('takes the release tag from a Deploy run on a tag, and the commit from git', () => {
		expect(buildVersion(tagRun, () => `${sha}\n`)).toEqual({ tag: 'v0.1.1', sha });
	});

	it('leaves a build off a branch untagged', () => {
		const environment = { GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'v0.1.1', GITHUB_SHA: sha };
		expect(buildVersion(environment, () => sha)).toEqual({ sha });
	});

	it('leaves a local build untagged', () => {
		expect(buildVersion({}, () => sha)).toEqual({ sha });
	});

	it('ignores a tag that is not a version tag', () => {
		expect(buildVersion({ ...tagRun, GITHUB_REF_NAME: 'nightly' }, () => sha)).toEqual({ sha });
	});

	it('prefers the commit git reports over the one Actions names', () => {
		expect(buildVersion({ GITHUB_SHA: other }, () => sha)).toEqual({ sha });
	});

	it('takes the commit from Actions when git has none', () => {
		expect(buildVersion(tagRun, () => {})).toEqual({ tag: 'v0.1.1', sha });
		expect(buildVersion({ GITHUB_SHA: sha }, () => 'not a sha')).toEqual({ sha });
	});

	it('builds without a commit when neither git nor Actions has one', () => {
		expect(buildVersion({}, () => {})).toEqual({});
	});
});

describe('gitHead', () => {
	it('reads the checkout commit', () => {
		expect(gitHead(repositoryRoot)).toMatch(/^[\da-f]{40}\s*$/);
	});

	it('reads nothing from a directory below the checkout root', () => {
		expect(gitHead(import.meta.dirname)).toBeUndefined();
	});

	it("reads nothing from a copy of the source inside another repository, rather than that repository's commit", () => {
		const outer = mkdtempSync(path.join(tmpdir(), 'sld-outer-'));
		try {
			const git = (...arguments_: string[]) => execFileSync('git', arguments_, { cwd: outer, stdio: 'ignore' });
			git('init', '--quiet');
			const identity = ['-c', 'user.name=sld', '-c', 'user.email=sld@example.com', '-c', 'commit.gpgsign=false'];
			git(...identity, 'commit', '--quiet', '--allow-empty', '-m', 'outer');
			const copy = path.join(outer, 'sld');
			mkdirSync(copy);
			expect(gitHead(copy)).toBeUndefined();
		} finally {
			rmSync(outer, { recursive: true });
		}
	});

	it('reads nothing outside a git checkout', () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'sld-no-git-'));
		try {
			expect(gitHead(directory)).toBeUndefined();
		} finally {
			rmSync(directory, { recursive: true });
		}
	});
});
