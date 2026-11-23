<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import type { DeckSummary } from '#lib/decks.ts';
	import { slideCount } from '#lib/landing.ts';
	import { editedWhen, renamedTitle, type TabPlace } from '#lib/library.ts';

	let {
		deck,
		place,
		now,
		onrename,
		onduplicate,
		ondelete
	}: {
		deck: DeckSummary;
		place: TabPlace;
		now: Date;
		onrename: (title: string) => void;
		onduplicate: () => void;
		ondelete: () => void;
	} = $props();

	const row = $state({ isMenuOpen: false, isRenaming: false, draft: '' });
	let actions: HTMLElement | undefined = $state();
	let menuButton: HTMLButtonElement | undefined = $state();
	let menu: HTMLElement | undefined = $state();
	let field: HTMLInputElement | undefined = $state();

	const menuId = $derived(`menu-${deck.id}`);

	function menuItems(): HTMLElement[] {
		return [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
	}

	async function openMenu(at: 'first' | 'last') {
		row.isMenuOpen = true;
		await tick();
		const items = menuItems();
		(at === 'first' ? items[0] : items.at(-1))?.focus();
	}

	function closeMenu(shouldFocusButton: boolean) {
		if (!row.isMenuOpen) return;
		row.isMenuOpen = false;
		if (shouldFocusButton) menuButton?.focus();
	}

	function onmenubuttonkeydown(event: KeyboardEvent) {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		event.preventDefault();
		void openMenu(event.key === 'ArrowDown' ? 'first' : 'last');
	}

	function onmenukeydown(event: KeyboardEvent) {
		const items = menuItems();
		const at = items.indexOf(document.activeElement as HTMLElement);
		const target = {
			ArrowDown: (at + 1) % items.length,
			ArrowUp: (at - 1 + items.length) % items.length,
			Home: 0,
			End: items.length - 1
		}[event.key];
		if (target !== undefined) {
			event.preventDefault();
			items[target]?.focus();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			closeMenu(true);
		} else if (event.key === 'Tab') {
			// Focus goes back to the menu button first, so the key's own move carries on from there.
			closeMenu(true);
		}
	}

	function onfocusout(event: FocusEvent) {
		if (!actions?.contains(event.relatedTarget as Node | null)) closeMenu(false);
	}

	function onwindowpointerdown(event: PointerEvent) {
		if (row.isMenuOpen && !actions?.contains(event.target as Node)) closeMenu(false);
	}

	async function startRename() {
		closeMenu(false);
		row.draft = deck.title;
		row.isRenaming = true;
		await tick();
		field?.select();
	}

	/** Ends renaming. Only a key takes focus back to the menu button: a blur leaves it where the person moved it. */
	async function finishRename(shouldSave: boolean, shouldFocus: boolean) {
		if (!row.isRenaming) return;
		row.isRenaming = false;
		const title = renamedTitle(deck.title, row.draft);
		if (shouldSave && title !== deck.title) onrename(title);
		if (!shouldFocus) return;
		await tick();
		menuButton?.focus();
	}

	function onfieldkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			void finishRename(true, true);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			void finishRename(false, true);
		}
	}

	function duplicate() {
		closeMenu(true);
		onduplicate();
	}

	function remove() {
		closeMenu(false);
		ondelete();
	}
</script>

<svelte:window onpointerdown={onwindowpointerdown} />

<li class="deck {place}">
	<span class="tab">{slideCount(deck.slideCount)}</span>
	<div class="card">
		{#if row.isRenaming}
			<input
				class="title rename"
				type="text"
				aria-label="Deck title"
				spellcheck="false"
				autocomplete="off"
				bind:value={row.draft}
				bind:this={field}
				onkeydown={onfieldkeydown}
				onblur={() => void finishRename(true, false)} />
		{:else}
			<a class="title" id="deck-{deck.id}" href={resolve('/app/deck/[id]', { id: deck.id })} title={deck.title}>
				{deck.title}
			</a>
		{/if}
		<span class="details">
			edited
			<time datetime={deck.updatedAt.toISOString()}>{editedWhen(deck.updatedAt, now)}</time>
		</span>
		<div class="actions" bind:this={actions} {onfocusout}>
			<a
				class="icon-button"
				href={resolve('/app/deck/[id]/present', { id: deck.id })}
				aria-label="Present {deck.title}">
				<span class="i-ri-play-line icon" aria-hidden="true"></span>
			</a>
			<button
				class="icon-button"
				type="button"
				aria-label="More actions for {deck.title}"
				aria-haspopup="menu"
				aria-expanded={row.isMenuOpen}
				aria-controls={row.isMenuOpen ? menuId : undefined}
				bind:this={menuButton}
				onclick={() => (row.isMenuOpen ? closeMenu(true) : void openMenu('first'))}
				onkeydown={onmenubuttonkeydown}>
				<span class="i-ri-more-line icon" aria-hidden="true"></span>
			</button>
			{#if row.isMenuOpen}
				<div
					class="menu"
					id={menuId}
					role="menu"
					tabindex="-1"
					aria-label="More actions for {deck.title}"
					bind:this={menu}
					onkeydown={onmenukeydown}>
					<button type="button" role="menuitem" tabindex="-1" onclick={startRename}>
						<span class="i-ri-pencil-line icon" aria-hidden="true"></span>Rename
					</button>
					<button type="button" role="menuitem" tabindex="-1" onclick={duplicate}>
						<span class="i-ri-file-copy-line icon" aria-hidden="true"></span>Duplicate
					</button>
					<!-- TODO: export the deck as markdown once export exists. -->
					<button type="button" role="menuitem" tabindex="-1" aria-disabled="true">
						<span class="i-ri-markdown-line icon" aria-hidden="true"></span>Export
					</button>
					<hr />
					<button class="danger" type="button" role="menuitem" tabindex="-1" onclick={remove}>
						<span class="i-ri-delete-bin-line icon" aria-hidden="true"></span>Delete
					</button>
				</div>
			{/if}
		</div>
	</div>
</li>

<style>
	.deck {
		position: relative;
		padding-top: 28px;
	}

	.tab {
		position: absolute;
		top: 0;
		z-index: 1;
		height: 29px;
		min-width: 48px;
		padding: 0 16px;
		box-sizing: border-box;
		background: var(--surface);
		border: 1px solid var(--border);
		border-bottom: 0;
		border-radius: 8px 8px 0 0;
		font-family: var(--code-font);
		font-size: 12.5px;
		line-height: 28px;
		text-align: center;
		color: var(--muted);
	}

	.left .tab {
		left: 0;
	}

	.center .tab {
		left: 50%;
		transform: translateX(-50%);
	}

	.right .tab {
		right: 0;
	}

	.card {
		position: relative;
		display: flex;
		align-items: center;
		gap: 16px;
		min-height: 76px;
		padding: 14px 12px 14px 24px;
		box-sizing: border-box;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
	}

	.left .card {
		border-top-left-radius: 0;
	}

	.right .card {
		border-top-right-radius: 0;
	}

	.deck:hover :is(.card, .tab),
	.deck:focus-within :is(.card, .tab) {
		border-color: color-mix(in oklab, var(--muted) 40%, var(--border));
	}

	.title {
		flex: 1;
		min-width: 0;
		font-family: var(--display-font);
		font-weight: 500;
		font-size: 22px;
		line-height: 1.3;
		color: var(--heading);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	a.title {
		text-decoration: none;
		border-radius: 4px;
	}

	/* The whole card opens the deck; the buttons sit above this. */
	a.title::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
	}

	a.title:hover {
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 5px;
	}

	a.title:focus-visible {
		outline: none;
	}

	a.title:focus-visible::after {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}

	.rename {
		margin: -7px 0 -7px -11px;
		padding: 6px 10px;
		background: var(--background);
		border: 1px solid var(--border);
		border-radius: 8px;
		text-overflow: clip;
	}

	.rename:focus {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}

	.details {
		flex: none;
		font-size: 14px;
		color: var(--muted);
		white-space: nowrap;
	}

	.actions {
		position: relative;
		z-index: 2;
		flex: none;
		display: flex;
		gap: 4px;
	}

	.icon-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 10px;
		background: transparent;
		color: var(--text);
		cursor: pointer;
	}

	.icon-button:hover,
	.icon-button[aria-expanded='true'] {
		background: var(--background);
		border-color: var(--border);
		color: var(--heading);
	}

	.icon-button:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}

	.icon {
		width: 20px;
		height: 20px;
	}

	.menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 3;
		display: flex;
		flex-direction: column;
		min-width: 220px;
		padding: 6px;
		box-sizing: border-box;
		background: var(--background);
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow:
			0 4px 8px var(--shadow),
			0 18px 40px var(--shadow);
	}

	.menu button {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 40px;
		padding: 0 12px;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--text);
		font: 500 15px var(--ui-font);
		text-align: left;
		cursor: pointer;
	}

	.menu .icon {
		width: 18px;
		height: 18px;
		color: var(--muted);
	}

	.menu button:hover:not([aria-disabled='true']),
	.menu button:focus-visible {
		background: var(--surface);
		color: var(--heading);
	}

	.menu button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.menu button[aria-disabled='true'] {
		color: var(--muted);
		opacity: 0.6;
		cursor: not-allowed;
	}

	.menu .danger,
	.menu .danger .icon,
	.menu .danger:hover,
	.menu .danger:focus-visible {
		color: var(--danger);
	}

	hr {
		height: 1px;
		margin: 4px 0;
		border: 0;
		background: var(--border);
	}

	@media (max-width: 640px) {
		.card {
			flex-wrap: wrap;
			row-gap: 4px;
			padding: 14px 8px 10px 16px;
		}

		.title {
			flex-basis: 100%;
			font-size: 20px;
			white-space: normal;
			overflow-wrap: anywhere;
		}

		.rename {
			margin: -7px 0 -3px -11px;
		}

		.details {
			flex: 1;
			white-space: normal;
		}
	}
</style>
