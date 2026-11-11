import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { log } = vi.hoisted(() => ({ log: vi.fn() }));
vi.mock('@/utils/log', () => ({ log }));

import { rpcHandler } from './rpcHandler';

describe('rpcHandler rpc-call not_available', () => {
    beforeEach(() => { vi.useFakeTimers(); log.mockReset(); });
    afterEach(() => { vi.useRealTimers(); });

    it('warns with method and user, and replies not available', async () => {
        const handlers: Record<string, (...args: any[]) => any> = {};
        const socket: any = { id: 's1', on: (ev: string, fn: any) => { handlers[ev] = fn; } };
        const io: any = { in: () => ({ timeout: () => ({ fetchSockets: async () => [] }) }) };
        rpcHandler('u1', socket, io);

        const callback = vi.fn();
        const pending = handlers['rpc-call']({ method: 'sess1:readFile', params: {} }, callback);
        await vi.advanceTimersByTimeAsync(60_000);
        await pending;

        expect(callback).toHaveBeenCalledWith({ ok: false, error: 'RPC method not available' });
        expect(log).toHaveBeenCalledWith(
            { module: 'websocket', level: 'warn' },
            'rpc-call not_available: method=sess1:readFile user=u1'
        );
    });
});
