// Revoking the URL as soon as the download starts can cancel it in some browsers, so it lives this long.
const urlLifetime = 60_000;

/** Saves `contents` as a file named `name`, the way a link with `download` does. */
export function download(name: string, contents: string | Uint8Array, type: string): void {
	// A Blob copies the bytes, so a view of any buffer will do, though TypeScript asks for an `ArrayBuffer`.
	const url = URL.createObjectURL(new Blob([contents as BlobPart], { type }));
	const link = document.createElement('a');
	link.href = url;
	link.download = name;
	link.hidden = true;
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), urlLifetime);
}
