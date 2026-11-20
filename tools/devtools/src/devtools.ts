/**
 * The repository's tools, run by Node as TypeScript:
 *
 *   node tools/devtools/src/devtools.ts pr <mode> --body-file <file>
 */
import { pr, prUsage } from './pr.ts';

const [command, ...rest] = process.argv.slice(2);
try {
	if (command === 'pr') {
		pr(rest, process.env);
	} else {
		process.stderr.write(prUsage);
		process.exitCode = 2;
	}
} catch (error) {
	process.stderr.write(`devtools: ${(error as Error).message}\n`);
	process.exitCode = 1;
}
