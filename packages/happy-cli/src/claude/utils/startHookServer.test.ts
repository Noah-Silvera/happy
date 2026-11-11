import { afterEach, describe, expect, it, vi } from 'vitest';
import { startHookServer, type HookServer } from './startHookServer';

vi.mock('@/ui/logger', () => ({ logger: { debug: vi.fn() } }));

let server: HookServer | undefined;
afterEach(() => { server?.stop(); server = undefined; });

const post = (port: number, body: unknown, token?: string) =>
    fetch(`http://127.0.0.1:${port}/inject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { 'x-happy-inject-token': token } : {}) },
        body: JSON.stringify(body),
    });

describe('POST /inject', () => {
    it('hands the text to onInject when the token matches', async () => {
        const onInject = vi.fn();
        server = await startHookServer({ onSessionHook: vi.fn(), injectToken: 'secret', onInject });
        const res = await post(server.port, { text: 'hello there' }, 'secret');
        expect(res.status).toBe(200);
        expect(onInject).toHaveBeenCalledWith('hello there');
    });

    it('rejects a missing or wrong token with 401 and never injects', async () => {
        const onInject = vi.fn();
        server = await startHookServer({ onSessionHook: vi.fn(), injectToken: 'secret', onInject });
        expect((await post(server.port, { text: 'x' })).status).toBe(401);
        expect((await post(server.port, { text: 'x' }, 'nope')).status).toBe(401);
        expect(onInject).not.toHaveBeenCalled();
    });

    it('rejects an empty or non-string text with 400', async () => {
        const onInject = vi.fn();
        server = await startHookServer({ onSessionHook: vi.fn(), injectToken: 'secret', onInject });
        expect((await post(server.port, { text: '   ' }, 'secret')).status).toBe(400);
        expect((await post(server.port, { text: 5 }, 'secret')).status).toBe(400);
        expect(onInject).not.toHaveBeenCalled();
    });

    it('is not served at all without a configured token', async () => {
        server = await startHookServer({ onSessionHook: vi.fn(), onInject: vi.fn() });
        expect((await post(server.port, { text: 'x' }, 'anything')).status).toBe(404);
    });
});
