import { afterEach, describe, expect, it, vi } from 'vitest';
import { Session } from './session';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import type { EnhancedMode } from './loop';

vi.mock('@/ui/logger', () => ({ logger: { debug: vi.fn() } }));

const modeA = { permissionMode: 'default' } as EnhancedMode;
const modeB = { permissionMode: 'plan' } as EnhancedMode;
const att = { name: 'a.png', mimeType: 'image/png', data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) } as any;

function makeSession() {
    const queue = new MessageQueue2<EnhancedMode>((m) => JSON.stringify(m));
    const session = new Session({
        api: {} as any,
        client: { keepAlive: vi.fn() } as any,
        path: '/p', logPath: '/l', sessionId: null, mcpServers: {},
        messageQueue: queue, onModeChange: vi.fn(), hookSettingsPath: '/s',
    });
    const sink = vi.fn();
    session.setSteerSink(sink);
    return { session, queue, sink };
}

describe('Session pending steers', () => {
    let current: Session | null = null;
    afterEach(() => { current?.cleanup(); current = null; });

    it('returns false and records nothing when no sink is live', () => {
        const { session } = makeSession();
        current = session;
        session.setSteerSink(null);
        expect(session.steer('x', [], modeA)).toBe(false);
        session.requeuePendingSteers();
        expect(current.queue.size()).toBe(0);
    });

    it('re-queues pending steers in order with their text, mode and attachments, once', () => {
        const { session, queue, sink } = makeSession();
        current = session;
        expect(session.steer('one', [att], modeA)).toBe(true);
        session.steer('two', [], modeB);
        expect(sink).toHaveBeenCalledTimes(2);

        session.requeuePendingSteers();
        expect(queue.size()).toBe(2);
        const items = (queue as any).queue as Array<{ message: string; mode: EnhancedMode; attachments?: unknown[] }>;
        expect(items.map(i => i.message)).toEqual(['one', 'two']);
        expect(items[0].mode).toBe(modeA);
        expect(items[1].mode).toBe(modeB);
        expect(items[0].attachments).toEqual([att]);

        session.requeuePendingSteers();
        expect(queue.size()).toBe(2);
    });

    it('clearPendingSteers (turn completed) prevents re-queue', () => {
        const { session, queue } = makeSession();
        current = session;
        session.steer('one', [], modeA);
        session.clearPendingSteers();
        session.requeuePendingSteers();
        expect(queue.size()).toBe(0);
    });

    it('a new run (non-null sink) clears stale pending steers; null sink does not', () => {
        const { session, queue } = makeSession();
        current = session;
        session.steer('one', [], modeA);
        session.setSteerSink(null);
        session.requeuePendingSteers();
        expect(queue.size()).toBe(1);

        session.steer('two', [], modeA); // no sink -> not recorded
        session.setSteerSink(vi.fn());
        session.steer('three', [], modeA);
        session.setSteerSink(vi.fn());
        session.requeuePendingSteers();
        expect(queue.size()).toBe(1);
    });
});
