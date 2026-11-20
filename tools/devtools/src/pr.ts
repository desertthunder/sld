import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { Poster, type PosterOptions } from './github.ts';

export const prUsage = `Usage: devtools pr <mode> --body-file <file> [--repo owner/name] [--pr n] [--head sha] [--dry-run]

Posts to a pull request through gh, as whoever GH_TOKEN belongs to
(desertthunder-bot in the workflows). Modes:

  comment  post the body as a plain pull request comment
  review   post a review report, placing \`severity · path:line — finding\` lines on the diff
  answer   post \`<comment id> · <outcome>\` lines as review thread replies and resolve fixed ones
  ready    mark the draft pull request ready for review, then post the body as a comment

--repo, --pr and --head default to REPO, PR and HEAD_SHA. --dry-run (or
DRY_RUN=1) prints the writes instead of sending them; reads still run.
`;

const modes = ['comment', 'review', 'answer', 'ready'];

/** Parses the pr command's arguments and posts, with the poster's other options taken from `options`. */
export function pr(
	argv: string[],
	environment: Record<string, string | undefined>,
	options: Pick<PosterOptions, 'gh' | 'log'> = {}
): void {
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			repo: { type: 'string', default: environment.REPO ?? '' },
			pr: { type: 'string', default: environment.PR ?? '' },
			head: { type: 'string', default: environment.HEAD_SHA ?? '' },
			'body-file': { type: 'string', default: '' },
			'dry-run': { type: 'boolean', default: environment.DRY_RUN === '1' }
		}
	});
	if (positionals.length !== 1 || !modes.includes(positionals[0])) {
		throw new Error(`expected one mode of ${modes.join(', ')}\n\n${prUsage}`);
	}
	if (values.repo === '' || values.pr === '' || values['body-file'] === '') {
		throw new Error('--repo, --pr and --body-file are required');
	}
	const mode = positionals[0];
	const body = readFileSync(values['body-file'], 'utf8');
	const poster = new Poster({ repository: values.repo, pr: values.pr, dryRun: values['dry-run'], ...options });
	switch (mode) {
		case 'comment': {
			poster.comment(body);
			break;
		}
		case 'review': {
			poster.review(values.head, body);
			break;
		}
		case 'answer': {
			poster.answer(body);
			break;
		}
		case 'ready': {
			poster.finish(body);
			break;
		}
	}
}
