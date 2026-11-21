/**
 * Plain text for a thrown value. Structured cloning turns errors that are not `Error` instances, such as Emscripten's
 * `ErrnoError`, into plain objects, so this reads `message`, `name` and `errno` from any object.
 */
export function errorText(error: unknown): string {
	if (typeof error !== 'object' || error === null) return String(error);
	const { message, name, errno } = error as Record<string, unknown>;
	const text = [message, name].find((part): part is string => typeof part === 'string' && part !== '');
	return typeof errno === 'number' ? `${text ?? 'Error'} (errno ${errno})` : (text ?? json(error) ?? 'Unknown error');
}

function json(value: object): string | undefined {
	try {
		const text = JSON.stringify(value);
		return text === '{}' ? undefined : text;
	} catch {
		return undefined;
	}
}
