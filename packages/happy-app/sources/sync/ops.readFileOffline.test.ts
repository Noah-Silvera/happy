import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rigMetadataFixture } from './__testdata__/rigMetadata';

const { sessionRPC, getState } = vi.hoisted(() => ({
    sessionRPC: vi.fn(),
    getState: vi.fn(),
}));

vi.mock('./apiSocket', () => ({ apiSocket: { sessionRPC } }));
vi.mock('./sync', () => ({ sync: {} }));
vi.mock('./storage', () => ({ storage: { getState } }));
vi.mock('./rigComposer', () => ({ rigComposerSetMode: vi.fn() }));

describe('sessionReadFile offline mapping', () => {
    beforeEach(() => {
        sessionRPC.mockReset();
        getState.mockReturnValue({ sessions: { rig: { metadata: rigMetadataFixture } } });
    });

    it('maps "RPC method not available" to a friendly offline message', async () => {
        sessionRPC.mockRejectedValue(new Error('RPC method not available'));
        const { sessionReadFile } = await import('./ops');
        await expect(sessionReadFile('rig', '/tmp/a')).resolves.toEqual({
            success: false,
            error: "This session is offline, so its files can't be read",
        });
    });

    it('passes unrelated errors through unchanged', async () => {
        sessionRPC.mockRejectedValue(new Error('boom'));
        const { sessionReadFile } = await import('./ops');
        await expect(sessionReadFile('rig', '/tmp/a')).resolves.toEqual({ success: false, error: 'boom' });
    });
});
