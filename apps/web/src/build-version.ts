import { execFileSync } from 'node:child_process';
import type { BuildVersion } from './lib/app-info.ts';

const versionTag = /^v\d+\.\d+\.\d+$/;
const commitSha = /^[\da-f]{40}$/;

/** Reads the checkout's commit, or nothing when git or its history is missing. */
export function gitHead(cwd: string): string | undefined {
	try {
		return execFileSync('git', ['rev-parse', 'HEAD'], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		});
	} catch {
		return undefined;
	}
}

/**
 * Finds the version the build is made from. Deploy builds on a release tag, which GitHub Actions names in the
 * environment; any other build is untagged. The commit comes from git, then from Actions, and a build with neither
 * has no commit.
 */
export function buildVersion(environment: NodeJS.ProcessEnv, readHead: () => string | undefined): BuildVersion {
	const tag = environment.GITHUB_REF_TYPE === 'tag' ? environment.GITHUB_REF_NAME : undefined;
	const sha = [readHead(), environment.GITHUB_SHA]
		.map((value) => value?.trim())
		.find((value) => value !== undefined && commitSha.test(value));
	return { ...(tag && versionTag.test(tag) && { tag }), ...(sha && { sha }) };
}
