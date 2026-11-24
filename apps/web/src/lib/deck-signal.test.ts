import { afterEach, describe, expect, it, vi } from 'vitest';
import { announceDeckChange, listenForDeckChanges, type DeckChangeKind } from '#lib/deck-signal.ts';

const deckId = '11111111-1111-4111-8111-111111111111';
const otherDeck = '22222222-2222-4222-8222-222222222222';

describe('deck change signals', () => {
	const stops: (() => void)[] = [];

	afterEach(() => {
		for (const stop of stops.splice(0)) stop();
	});

	function listen(id: string, tab?: string) {
		const heard: DeckChangeKind[][] = [];
		stops.push(
			listenForDeckChanges(
				id,
				(changed) => {
					heard.push(changed);
				},
				tab
			)
		);
		return heard;
	}

	it("hears another tab's writes to the deck, once per kind", async () => {
		const heard = listen(deckId, 'tab-b');
		announceDeckChange(deckId, ['text', 'slides', 'text'], 'tab-a');
		await vi.waitFor(() => expect(heard).toEqual([['text', 'slides']]));
	});

	it("skips its own tab's writes, other decks' and writes that changed nothing", async () => {
		const heard = listen(deckId, 'tab-b');
		const control = listen(otherDeck, 'tab-c');
		announceDeckChange(deckId, ['title'], 'tab-b');
		announceDeckChange(otherDeck, ['deleted'], 'tab-a');
		announceDeckChange(deckId, [], 'tab-a');
		await vi.waitFor(() => expect(control).toEqual([['deleted']]));
		expect(heard).toEqual([]);
	});

	it('ignores a message that is not a deck signal', async () => {
		const heard = listen(deckId, 'tab-b');
		const channel = new BroadcastChannel('sld:deck-changes');
		channel.postMessage({ tab: 'tab-a', deckId, changed: ['everything'] });
		channel.postMessage('junk');
		channel.close();
		announceDeckChange(deckId, ['scheme'], 'tab-a');
		await vi.waitFor(() => expect(heard).toEqual([['scheme']]));
	});

	it('stops hearing once stopped', async () => {
		const heard: DeckChangeKind[][] = [];
		const stop = listenForDeckChanges(
			deckId,
			(changed) => {
				heard.push(changed);
			},
			'tab-b'
		);
		stop();
		const control = listen(deckId, 'tab-c');
		announceDeckChange(deckId, ['text'], 'tab-a');
		await vi.waitFor(() => expect(control).toEqual([['text']]));
		expect(heard).toEqual([]);
	});
});
