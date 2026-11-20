import { describe, expect, it } from 'vitest';
import { Poster, type Gh } from './github.ts';

const repository = 'desertthunder/sld';
const head = 'a'.repeat(40);

type Call = { stdin: string; ghArguments: string[] };

/**
 * Stands in for the gh CLI: records each call, fails it when the joined
 * arguments contain a key in `fail`, and otherwise answers it with the reply
 * whose key is the longest one they contain, so `addPullRequestReviewThreadReply`
 * doesn't take `addPullRequestReview`'s reply.
 */
function recorder(replies: Record<string, string> = {}, fail: string[] = []): { calls: Call[]; gh: Gh } {
	const calls: Call[] = [];
	const gh: Gh = (stdin, ghArguments) => {
		calls.push({ stdin, ghArguments });
		const joined = ghArguments.join(' ');
		const failing = fail.find((candidate) => joined.includes(candidate));
		if (failing !== undefined) throw new Error(`gh ${failing} failed`);
		const key = Object.keys(replies)
			.filter((candidate) => joined.includes(candidate))
			.toSorted((a, b) => b.length - a.length)[0];
		return key === undefined ? '' : replies[key];
	};
	return { calls, gh };
}

function dryRun(gh?: Gh): { poster: Poster; output: () => string } {
	let out = '';
	const poster = new Poster({ repository, pr: '7', dryRun: true, log: (text) => (out += text), gh });
	return { poster, output: () => out };
}

const diff = JSON.stringify({ files: [{ filename: 'a.ts', patch: '@@ -1,2 +1,12 @@\n+x' }, { filename: 'gone.png' }] });

describe('Poster', () => {
	it('prints the ready request instead of sending it on a dry run', () => {
		const { poster, output } = dryRun();
		poster.ready();
		expect(output()).toBe(`DRY_RUN mark ${repository}#7 ready for review\n`);
	});

	it('prints the comment instead of sending it on a dry run', () => {
		const { poster, output } = dryRun();
		poster.comment('Review loop finished at abc');
		expect(output()).toContain('Review loop finished at abc');
	});

	it('marks the pull request ready before it comments when finishing', () => {
		const { poster, output } = dryRun();
		poster.finish('Review loop finished at abc');
		const ready = output().indexOf('ready for review');
		const comment = output().indexOf('Review loop finished at abc');
		expect(ready).toBeGreaterThanOrEqual(0);
		expect(comment).toBeGreaterThan(ready);
	});

	it('marks nothing ready when the finishing comment is empty', () => {
		const { poster, output } = dryRun();
		expect(() => poster.finish('  \n')).toThrow('empty');
		expect(output()).toBe('');
	});

	it('runs gh pr ready, then gh pr comment, when finishing', () => {
		const { calls, gh } = recorder();
		new Poster({ repository, pr: '7', log: () => {}, gh }).finish('Review loop finished at abc');
		expect(calls).toEqual([
			{ stdin: '', ghArguments: ['pr', 'ready', '7', '--repo', repository] },
			{
				stdin: 'Review loop finished at abc',
				ghArguments: ['pr', 'comment', '7', '--repo', repository, '--body-file', '-']
			}
		]);
	});

	it('posts no comment when marking ready fails', () => {
		const { calls, gh } = recorder({}, ['pr ready']);
		const poster = new Poster({ repository, pr: '7', log: () => {}, gh });
		expect(() => poster.finish('Review loop finished at abc')).toThrow('gh pr ready failed');
		expect(calls.some((call) => call.ghArguments[1] === 'comment')).toBe(false);
	});

	it('refuses an empty comment', () => {
		expect(() => dryRun().poster.comment('  \n')).toThrow('empty');
	});

	it('refuses a review of a head that is not a full SHA', () => {
		const { calls, gh } = recorder();
		expect(() => new Poster({ repository, pr: '7', gh }).review('abc123', 'report')).toThrow(
			'not a full commit SHA'
		);
		expect(calls).toEqual([]);
	});

	it('posts one review with the findings on the diff placed on their lines', () => {
		const { calls, gh } = recorder({ 'pulls/7 --jq': 'main\n', [`compare/main...${head}`]: diff });
		const report = 'Standard pass\n\n- high · a.ts:3 — breaks\n- low · a.ts:4-6 — range\n- low · a.ts:40 — off it';
		new Poster({ repository, pr: '7', log: () => {}, gh }).review(head, report);
		expect(calls).toHaveLength(4);
		expect(calls[2].ghArguments.some((argument) => argument.includes('reviews(states: [PENDING]'))).toBe(true);
		expect(calls[3].ghArguments).toEqual([
			'api',
			'-X',
			'POST',
			`repos/${repository}/pulls/7/reviews`,
			'--input',
			'-'
		]);
		expect(JSON.parse(calls[3].stdin)).toEqual({
			commit_id: head,
			event: 'COMMENT',
			body: 'Standard pass\n\n- low · a.ts:40 — off it',
			comments: [
				{ path: 'a.ts', line: 3, side: 'RIGHT', body: 'high — breaks' },
				{ path: 'a.ts', line: 6, side: 'RIGHT', body: 'low — range', start_line: 4, start_side: 'RIGHT' }
			]
		});
	});

	it('prints the review instead of posting it on a dry run, after reading the diff', () => {
		const { calls, gh } = recorder({ 'pulls/7 --jq': 'main\n', [`compare/main...${head}`]: diff });
		const { poster, output } = dryRun(gh);
		poster.review(head, '- high · a.ts:3 — breaks');
		expect(calls.map((call) => call.ghArguments[1])).toEqual([
			`repos/${repository}/pulls/7`,
			`repos/${repository}/compare/main...${head}`
		]);
		expect(output()).toContain(`DRY_RUN review on ${repository}#7: {"commit_id":"${head}"`);
		expect(output()).toContain('"path":"a.ts","line":3');
	});

	const threads = 'PR_1 PRRT_a 111\nPR_1 PRRT_b 222\n';

	it('prints the replies and resolutions instead of sending them on a dry run', () => {
		const { calls, gh } = recorder({ reviewThreads: threads });
		const { poster, output } = dryRun(gh);
		poster.answer('Answers\n- 111 · Fixed in abc.\n- 222 · Not a defect: see the test.');
		expect(calls).toHaveLength(1);
		expect(output()).toBe(
			'DRY_RUN reply on PRRT_a: "Fixed in abc.", then resolve\n' +
				'DRY_RUN reply on PRRT_b: "Not a defect: see the test."\n' +
				'DRY_RUN review body: "Answers"\n'
		);
	});

	it('refuses answers to a comment that opens no thread', () => {
		const { gh } = recorder({ reviewThreads: threads });
		expect(() => dryRun(gh).poster.answer('- 333 · Fixed.')).toThrow('no review thread starts with comment 333');
	});

	it('replies in one review, then resolves only the threads a fix closes', () => {
		const { calls, gh } = recorder({
			reviewThreads: threads,
			'reviews(states: [PENDING]': 'PRR_old\n',
			deletePullRequestReview: '{}',
			addPullRequestReview: 'PRR_new',
			addPullRequestReviewThreadReply: 'C_1',
			submitPullRequestReview: 'PRR_new',
			resolveReviewThread: 'PRRT_a'
		});
		new Poster({ repository, pr: '7', log: () => {}, gh }).answer(
			'Answers\n- 111 · Fixed in abc.\n- 222 · Not a defect.'
		);
		const steps = calls.map(
			(call) => /{\s*(\w+)/.exec(call.ghArguments.find((argument) => argument.startsWith('query=')) ?? '')?.[1]
		);
		expect(steps).toEqual([
			'repository',
			'repository',
			'deletePullRequestReview',
			'addPullRequestReview',
			'addPullRequestReviewThreadReply',
			'addPullRequestReviewThreadReply',
			'submitPullRequestReview',
			'resolveReviewThread'
		]);
		expect(calls[0].ghArguments).toContain('--paginate');
		expect(calls[2].ghArguments).toContain('review=PRR_old');
		expect(calls[4].ghArguments).toEqual(
			expect.arrayContaining(['review=PRR_new', 'thread=PRRT_a', 'body=Fixed in abc.'])
		);
		expect(calls[5].ghArguments).toEqual(
			expect.arrayContaining(['review=PRR_new', 'thread=PRRT_b', 'body=Not a defect.'])
		);
		expect(calls[6].ghArguments).toEqual(expect.arrayContaining(['review=PRR_new', 'body=Answers']));
		expect(calls.at(-1)?.ghArguments).toContain('thread=PRRT_a');
	});

	const answering = {
		reviewThreads: threads,
		'reviews(states: [PENDING]': '',
		deletePullRequestReview: '{}',
		addPullRequestReview: 'PRR_new',
		addPullRequestReviewThreadReply: 'C_1',
		submitPullRequestReview: 'PRR_new',
		resolveReviewThread: 'PRRT_a'
	};

	it('deletes its pending review and fails when a reply fails', () => {
		const { calls, gh } = recorder(answering, ['addPullRequestReviewThreadReply']);
		expect(() =>
			new Poster({ repository, pr: '7', log: () => {}, gh }).answer(
				'- 111 · Fixed in abc.\n- 222 · Fixed in abc.'
			)
		).toThrow('addPullRequestReviewThreadReply failed');
		const last = calls.at(-1)?.ghArguments ?? [];
		expect(last.some((argument) => argument.includes('deletePullRequestReview'))).toBe(true);
		expect(last).toContain('review=PRR_new');
		expect(
			calls.some((call) => call.ghArguments.some((argument) => argument.includes('resolveReviewThread')))
		).toBe(false);
	});

	it.each(['', 'null'])('treats a mutation that returns %j as failed and deletes its pending review', (reply) => {
		const { calls, gh } = recorder({ ...answering, addPullRequestReviewThreadReply: reply });
		expect(() => new Poster({ repository, pr: '7', log: () => {}, gh }).answer('- 111 · Fixed in abc.')).toThrow(
			'GitHub returned nothing for .data.addPullRequestReviewThreadReply.comment.id'
		);
		const last = calls.at(-1)?.ghArguments ?? [];
		expect(last.some((argument) => argument.includes('deletePullRequestReview'))).toBe(true);
		expect(last).toContain('review=PRR_new');
	});

	it('deletes a pending review a canceled run left before posting a review', () => {
		const { calls, gh } = recorder({
			'pulls/7 --jq': 'main\n',
			[`compare/main...${head}`]: diff,
			'reviews(states: [PENDING]': 'PRR_old\n',
			deletePullRequestReview: '{}'
		});
		new Poster({ repository, pr: '7', log: () => {}, gh }).review(head, '- high · a.ts:3 — breaks');
		expect(calls[3].ghArguments).toContain('review=PRR_old');
		expect(calls.at(-1)?.ghArguments).toContain(`repos/${repository}/pulls/7/reviews`);
	});

	it('warns and carries on when a thread cannot be resolved, since the replies are posted', () => {
		const { gh } = recorder(answering, ['resolveReviewThread']);
		let out = '';
		new Poster({ repository, pr: '7', log: (text) => (out += text), gh }).answer('- 111 · Fixed in abc.');
		expect(out).toContain('warning: cannot resolve thread PRRT_a; resolve it by hand');
		expect(out).toContain('Answered 1 findings and resolved 0 threads.');
	});

	it('posts answers with no comment ids as a plain review', () => {
		const { calls, gh } = recorder();
		new Poster({ repository, pr: '7', log: () => {}, gh }).answer(
			'Every finding was in the body.\n- a.ts:3 · Fixed.'
		);
		expect(calls).toHaveLength(2);
		expect(JSON.parse(calls[1].stdin)).toEqual({
			event: 'COMMENT',
			body: 'Every finding was in the body.\n- a.ts:3 · Fixed.'
		});
	});
});
