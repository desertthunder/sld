import { afterEach, describe, expect, it, vi } from 'vitest';
import { announceDeckChange, listenForDeckChanges } from '#lib/deck-signal.ts';

const deckId = '11111111-1111-4111-8111-111111111111';
const otherDeck = '22222222-2222-4222-8222-222222222222';

describe('deck change signals', () => {
	const stops: (() => void)[] = [];

	afterEach(() => {
		for (const stop of stops.splice(0)) stop();
	});

	function listen(id: string, tab?: string) {
		const heard = { count: 0 };
		stops.push(listenForDeckChanges(id, () => heard.count++, tab));
		return heard;
	}

	it("hears another tab's writes to the deck", async () => {
		const heard = listen(deckId, 'tab-b');
		announceDeckChange(deckId, 'tab-a');
		announceDeckChange(deckId, 'tab-a');
		await vi.waitFor(() => expect(heard.count).toBe(2));
	});

	it("skips its own tab's writes and other decks'", async () => {
		const heard = listen(deckId, 'tab-b');
		const control = listen(otherDeck, 'tab-c');
		announceDeckChange(deckId, 'tab-b');
		announceDeckChange(otherDeck, 'tab-a');
		await vi.waitFor(() => expect(control.count).toBe(1));
		expect(heard.count).toBe(0);
	});

	it('ignores a message that is not a deck signal', async () => {
		const heard = listen(deckId, 'tab-b');
		const channel = new BroadcastChannel('sld:deck-changes');
		channel.postMessage({ tab: 'tab-a', deckId: 7 });
		channel.postMessage('junk');
		channel.close();
		const control = listen(otherDeck, 'tab-c');
		announceDeckChange(otherDeck, 'tab-a');
		await vi.waitFor(() => expect(control.count).toBe(1));
		expect(heard.count).toBe(0);
	});

	it('stops hearing once stopped', async () => {
		const heard = { count: 0 };
		const stop = listenForDeckChanges(deckId, () => heard.count++, 'tab-b');
		stop();
		const control = listen(deckId, 'tab-c');
		announceDeckChange(deckId, 'tab-a');
		await vi.waitFor(() => expect(control.count).toBe(1));
		expect(heard.count).toBe(0);
	});
});
