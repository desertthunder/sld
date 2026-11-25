export const appName = 'sld';

export const appSummary =
	'Paste markdown, get a deck split on ---, edit each slide, and present full screen. Your decks stay in this browser.';

export const repositoryUrl = 'https://github.com/desertthunder/sld';

/** The release tag and full commit sha the build was made from; a build off a branch has no tag. */
export type BuildVersion = { tag?: string; sha?: string };

export type VersionLabel = { name: string; nameHref?: string; sha?: string; shaHref?: string };

/** Labels a build as its release tag, or `dev` untagged, with its short commit sha. */
export function versionLabel({ tag, sha }: BuildVersion): VersionLabel {
	return {
		name: tag ?? 'dev',
		nameHref: tag && `${repositoryUrl}/releases/tag/${tag}`,
		sha: sha?.slice(0, 7),
		shaHref: sha && `${repositoryUrl}/commit/${sha}`
	};
}

export const appVersion: BuildVersion = __APP_VERSION__;
