import { spawnSync } from 'node:child_process';
import { isClosing, hunks, parseAnswers, place, lines, type ChangedFile } from './parse.ts';

/** Runs gh with `stdin` and arguments and returns its standard output, throwing when gh fails. */
export type Gh = (stdin: string, ghArguments: string[]) => string;

export type PosterOptions = {
	/** The repository as owner/name. */
	repository: string;
	pr: string;
	/** Print writes instead of sending them; reads still run. */
	dryRun?: boolean;
	/** Where progress and dry-run output go; standard error when unset. */
	log?: (text: string) => void;
	/** Runs gh; the gh CLI when unset. Tests set it to record the calls. */
	gh?: Gh;
};

const fullSha = /^[\da-f]{40}$/;

const pendingQuery = `query($owner: String!, $name: String!, $pr: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $pr) { reviews(states: [PENDING], first: 10) { nodes { id } } }
  }
}`;

const threadsQuery = `query($owner: String!, $name: String!, $pr: Int!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $pr) {
      id
      reviewThreads(first: 100, after: $endCursor) {
        pageInfo { hasNextPage endCursor }
        nodes { id comments(first: 1) { nodes { fullDatabaseId } } }
      }
    }
  }
}`;

/** Runs the gh CLI with `stdin` and returns its standard output. */
export const runGh: Gh = (stdin, ghArguments) => {
	const result = spawnSync('gh', ghArguments, { input: stdin, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	if (result.error) throw new Error(`gh ${ghArguments[0]}: ${result.error.message}`);
	if (result.status !== 0)
		throw new Error(`gh ${ghArguments[0]}: exit status ${result.status}: ${result.stderr.trim()}`);
	return result.stdout;
};

/**
 * Posts to one pull request through the gh CLI, with whatever token gh is
 * given (`GH_TOKEN`), which is desertthunder-bot's in the workflows.
 */
export class Poster {
	readonly #log: (text: string) => void;
	readonly #gh: Gh;
	readonly repository: string;
	readonly pr: string;
	readonly dryRun: boolean;

	constructor(options: PosterOptions) {
		this.repository = options.repository;
		this.pr = options.pr;
		this.dryRun = options.dryRun ?? false;
		this.#log = options.log ?? ((text) => process.stderr.write(text));
		this.#gh = options.gh ?? runGh;
	}

	#postReview(request: Record<string, unknown>): void {
		const json = JSON.stringify(request);
		if (this.dryRun) {
			this.#log(`DRY_RUN review on ${this.repository}#${this.pr}: ${json}\n`);
			return;
		}
		this.#deletePending();
		this.#gh(json, ['api', '-X', 'POST', `repos/${this.repository}/pulls/${this.pr}/reviews`, '--input', '-']);
	}

	/** Splits the repository into its owner and name. */
	#ownerAndName(): [string, string] {
		const [owner, name, ...extra] = this.repository.split('/');
		if (!owner || !name || extra.length > 0)
			throw new Error(`${JSON.stringify(this.repository)} is not owner/name`);
		return [owner, name];
	}

	/**
	 * Deletes the pending reviews this token's user has on the pull request.
	 * GitHub allows one per author, so one that a canceled answer run left
	 * behind would make the next review fail.
	 */
	#deletePending(): void {
		const [owner, name] = this.#ownerAndName();
		const pending = this.#gh('', [
			'api',
			'graphql',
			'-f',
			`query=${pendingQuery}`,
			'-f',
			`owner=${owner}`,
			'-f',
			`name=${name}`,
			'-F',
			`pr=${this.pr}`,
			'--jq',
			'.data.repository.pullRequest.reviews.nodes[].id'
		]);
		for (const old of lines(pending)) {
			if (old.trim() !== '') this.#deleteReview(old.trim());
		}
	}

	#deleteReview(id: string): void {
		this.#graphql(
			'mutation($review: ID!) { deletePullRequestReview(input: {pullRequestReviewId: $review}) { clientMutationId } }',
			{ review: id },
			'.data'
		);
	}

	/** Runs one GraphQL request and returns what `filter` picks, failing when it picks nothing. */
	#graphql(query: string, variables: Record<string, string>, filter: string): string {
		const ghArguments = ['api', 'graphql', '-f', `query=${query}`];
		for (const [key, value] of Object.entries(variables)) ghArguments.push('-f', `${key}=${value}`);
		ghArguments.push('--jq', filter);
		const out = this.#gh('', ghArguments).trim();
		if (out === '' || out === 'null') throw new Error(`GitHub returned nothing for ${filter}`);
		return out;
	}

	/** Posts `body` as a plain pull request comment. */
	comment(body: string): void {
		if (body.trim() === '') throw new Error('the comment is empty');
		if (this.dryRun) {
			this.#log(`DRY_RUN comment on ${this.repository}#${this.pr}:\n${body}\n`);
			return;
		}
		this.#gh(body, ['pr', 'comment', this.pr, '--repo', this.repository, '--body-file', '-']);
	}

	/**
	 * Marks a draft pull request ready for review. GitHub holds back the
	 * CODEOWNERS review request while a pull request is a draft, so this is
	 * what asks Owais to review it.
	 */
	ready(): void {
		if (this.dryRun) {
			this.#log(`DRY_RUN mark ${this.repository}#${this.pr} ready for review\n`);
			return;
		}
		this.#gh('', ['pr', 'ready', this.pr, '--repo', this.repository]);
	}

	/**
	 * Marks the draft pull request ready, then posts `body` as a comment saying
	 * what the review loop found. It marks ready first so a failed mark leaves
	 * no comment claiming the loop finished on a draft. Running it again after
	 * the comment failed is safe: gh treats a pull request that is already
	 * ready as done.
	 */
	finish(body: string): void {
		if (body.trim() === '') throw new Error('the comment is empty');
		this.ready();
		this.comment(body);
	}

	/**
	 * Posts a review report as one review on `head`: findings inside the diff
	 * go on their lines, the rest of the report is the review's body.
	 */
	review(head: string, report: string): void {
		if (!fullSha.test(head)) throw new Error(`${JSON.stringify(head)} is not a full commit SHA`);
		const base = this.#gh('', ['api', `repos/${this.repository}/pulls/${this.pr}`, '--jq', '.base.ref']).trim();
		const raw = this.#gh('', ['api', `repos/${this.repository}/compare/${base}...${head}`]);
		let compare: { files?: { filename: string; patch?: string }[] };
		try {
			compare = JSON.parse(raw) as typeof compare;
		} catch (error) {
			throw new Error(`read the diff: ${(error as Error).message}`, { cause: error });
		}
		const files: ChangedFile[] = (compare.files ?? []).map((file) => ({
			name: file.filename,
			hunks: hunks(file.patch ?? '')
		}));
		const { placed, body } = place(report, files);
		const comments = placed.map((finding) => ({
			path: finding.path,
			line: finding.line,
			side: 'RIGHT',
			body: finding.text,
			...(finding.start !== 0 && { start_line: finding.start, start_side: 'RIGHT' })
		}));
		this.#postReview({ commit_id: head, event: 'COMMENT', body, comments });
		this.#log(`Posted the review with ${placed.length} of its findings on the diff.\n`);
	}

	/** Posts revise answers as replies in one review, then resolves the threads a fix or a deferral closes. */
	answer(text: string): void {
		const { answers, body } = parseAnswers(text);
		if (answers.length === 0) {
			// Every finding was in a review's body, so the answers are too.
			if (body === '') throw new Error('the answers are empty');
			this.#postReview({ event: 'COMMENT', body });
			this.#log('Posted the answers as a review, with no thread to reply on.\n');
			return;
		}
		const [owner, name] = this.#ownerAndName();
		const found = this.#gh('', [
			'api',
			'graphql',
			'--paginate',
			'-f',
			`query=${threadsQuery}`,
			'-f',
			`owner=${owner}`,
			'-f',
			`name=${name}`,
			'-F',
			`pr=${this.pr}`,
			'--jq',
			String.raw`.data.repository.pullRequest | .id as $pr | .reviewThreads.nodes[] | "\($pr) \(.id) \(.comments.nodes[0].fullDatabaseId)"`
		]);
		const threads = lines(found)
			.map((line) => line.split(' '))
			.filter((fields) => fields.length === 3)
			.map(([pr, id, comment]) => ({ pr, id, comment }));
		if (threads.length === 0) throw new Error('the pull request has no review threads to answer');

		const targets: { thread: string; text: string }[] = [];
		const unknown: string[] = [];
		for (const answer of answers) {
			const thread = threads.find((candidate) => candidate.comment === answer.comment);
			if (thread) targets.push({ thread: thread.id, text: answer.text });
			else unknown.push(answer.comment);
		}
		if (unknown.length > 0) throw new Error(`no review thread starts with comment ${unknown.join(', ')}`);

		if (this.dryRun) {
			for (const target of targets) {
				const then = isClosing(target.text) ? ', then resolve' : '';
				this.#log(`DRY_RUN reply on ${target.thread}: ${JSON.stringify(target.text)}${then}\n`);
			}
			this.#log(`DRY_RUN review body: ${JSON.stringify(body)}\n`);
			return;
		}

		this.#deletePending();
		const review = this.#graphql(
			'mutation($pr: ID!) { addPullRequestReview(input: {pullRequestId: $pr}) { pullRequestReview { id } } }',
			{ pr: threads[0].pr },
			'.data.addPullRequestReview.pullRequestReview.id'
		);
		try {
			for (const target of targets) {
				this.#graphql(
					'mutation($review: ID!, $thread: ID!, $body: String!) { addPullRequestReviewThreadReply(input: {pullRequestReviewId: $review, pullRequestReviewThreadId: $thread, body: $body}) { comment { id } } }',
					{ review, thread: target.thread, body: target.text },
					'.data.addPullRequestReviewThreadReply.comment.id'
				);
			}
			this.#graphql(
				'mutation($review: ID!, $body: String!) { submitPullRequestReview(input: {pullRequestReviewId: $review, event: COMMENT, body: $body}) { pullRequestReview { id } } }',
				{ review, body },
				'.data.submitPullRequestReview.pullRequestReview.id'
			);
		} catch (error) {
			// The next run deletes a pending review left behind, so a failed
			// delete here only needs saying.
			try {
				this.#deleteReview(review);
			} catch (deleteError) {
				this.#log(`warning: cannot delete the pending review ${review}: ${(deleteError as Error).message}\n`);
			}
			throw error;
		}
		// The replies are posted, so a failed resolve is a warning: running
		// again would post them twice.
		let resolved = 0;
		for (const target of targets) {
			if (!isClosing(target.text)) continue;
			try {
				this.#graphql(
					'mutation($thread: ID!) { resolveReviewThread(input: {threadId: $thread}) { thread { id } } }',
					{ thread: target.thread },
					'.data.resolveReviewThread.thread.id'
				);
				resolved++;
			} catch (error) {
				this.#log(
					`warning: cannot resolve thread ${target.thread}; resolve it by hand: ${(error as Error).message}\n`
				);
			}
		}
		this.#log(`Answered ${targets.length} findings and resolved ${resolved} threads.\n`);
	}
}
