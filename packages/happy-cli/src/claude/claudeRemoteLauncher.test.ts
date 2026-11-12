import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claudeRemote } from './claudeRemote';
import { claudeRemoteLauncher } from './claudeRemoteLauncher';
import { closeClaudeTurnWithStatus, mapClaudeLogMessageToSessionEnvelopes, type ClaudeSessionProtocolState } from './utils/sessionProtocolMapper';
import { CLAUDE_LOGIN_EXPIRED_MESSAGE } from './utils/providerAuth';
import type { SessionEnvelope } from '@slopus/happy-wire';
import { Session } from './session';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import type { EnhancedMode } from './loop';

// Exercise the real outgoing queue, SDK converter and protocol mapper without
// a terminal, credential store, provider process, relay or push service.
vi.mock('./claudeRemote', () => ({ claudeRemote: vi.fn() }));
vi.mock('ink', () => ({ render: vi.fn() }));
vi.mock('@/ui/ink/RemoteModeDisplay', () => ({ RemoteModeDisplay: vi.fn() }));
vi.mock('@/ui/logger', () => ({ logger: { debug: vi.fn() } }));
vi.mock('@/ui/messageFormatterInk', () => ({ formatClaudeMessageForInk: vi.fn() }));
vi.mock('@/utils/terminalStdinCleanup', () => ({ cleanupStdinAfterInk: vi.fn() }));
vi.mock('node:child_process', () => ({ execSync: () => 'fixture-branch' }));
vi.mock('./utils/permissionHandler', () => ({
    PermissionHandler: class {
        reset = vi.fn();
        setOnPermissionRequest = vi.fn();
        getResponseLookup = () => new Map();
        handleToolCall = vi.fn();
    },
}));

function fixture() {
    const handlers = new Map<string, () => Promise<void>>();
    const state: ClaudeSessionProtocolState = { currentTurnId: null };
    const envelopes: SessionEnvelope[] = [];
    const session = {
        sessionId: 'fixture-session', path: '/fixture/project', hookSettingsPath: '/fixture/settings.json',
        queue: { size: () => 0 },
        consumeOneTimeFlags: vi.fn(),
        api: { push: () => ({ sendSessionNotification: notification }) },
        client: {
            sessionId: 'fixture-happy-session',
            rpcHandlerManager: { registerHandler: (name: string, handler: () => Promise<void>) => handlers.set(name, handler) },
            getMetadata: () => ({}),
            sendSessionEvent: vi.fn(),
            sendClaudeSessionMessage: vi.fn((message) => {
                const mapped = mapClaudeLogMessageToSessionEnvelopes(message, state);
                state.currentTurnId = mapped.currentTurnId;
                envelopes.push(...mapped.envelopes);
            }),
            closeClaudeSessionTurn: vi.fn((status) => {
                const mapped = closeClaudeTurnWithStatus(state, status);
                state.currentTurnId = mapped.currentTurnId;
                envelopes.push(...mapped.envelopes);
            }),
        },
    };
    const notification = vi.fn();
    const stop = () => { void handlers.get('switch')!(); };
    return { session, state, envelopes, notification, stop };
}

describe('claudeRemoteLauncher provider auth', () => {
    beforeEach(() => { vi.mocked(claudeRemote).mockReset(); });

    it('flushes back-to-back auth output before closing the failed wire turn, without a done push', async () => {
        const { session, state, envelopes, notification, stop } = fixture();
        let eventsAtReady: string[] = [];
        let turnAtReady: string | null | undefined;
        vi.mocked(claudeRemote).mockImplementation(async opts => {
            opts.onCompletionEvent?.(CLAUDE_LOGIN_EXPIRED_MESSAGE);
            opts.onMessage({
                type: 'assistant', error: 'authentication_failed', parent_tool_use_id: null,
                message: { role: 'assistant', content: [{ type: 'text', text: 'Provider login failed' }] },
            } as any);
            await opts.onReady('failed');
            // Verify before cleanup's final flush can hide incorrect ordering.
            eventsAtReady = envelopes.map(envelope => envelope.ev.t);
            turnAtReady = state.currentTurnId;
            stop();
        });
        await claudeRemoteLauncher(session as any);
        expect(eventsAtReady).toEqual(['turn-start', 'text', 'turn-end']);
        expect(envelopes.at(-1)?.ev).toEqual({ t: 'turn-end', status: 'failed' });
        expect(turnAtReady).toBeNull();
        expect(notification).not.toHaveBeenCalled();
        expect(session.client.sendSessionEvent).toHaveBeenCalledWith({ type: 'message', message: CLAUDE_LOGIN_EXPIRED_MESSAGE });
        expect(envelopes.filter(envelope => envelope.ev.t === 'turn-end')).toHaveLength(1);
    });

    it('shows untruncated host-login guidance for a thrown OAuth error and accepts a later invocation', async () => {
        const { session, notification, stop } = fixture();
        vi.mocked(claudeRemote)
            .mockRejectedValueOnce(new Error('Failed to authenticate: OAuth session expired and could not be refreshed\nhttps://fixture-secret@example.invalid'))
            .mockImplementationOnce(async () => { stop(); });
        await claudeRemoteLauncher(session as any);
        expect(session.client.closeClaudeSessionTurn).toHaveBeenCalledWith('failed');
        expect(session.client.sendSessionEvent).toHaveBeenCalledWith({ type: 'message', message: CLAUDE_LOGIN_EXPIRED_MESSAGE });
        expect(JSON.stringify(session.client.sendSessionEvent.mock.calls)).not.toContain('fixture-secret');
        expect(notification).not.toHaveBeenCalled();
        expect(claudeRemote).toHaveBeenCalledTimes(2);
    });
});
describe('claudeRemoteLauncher abort keeps steered messages', () => {
    beforeEach(() => { vi.mocked(claudeRemote).mockReset(); });
    const mode = { permissionMode: 'default' } as EnhancedMode;

    // Real Session + queue over the shared fixture; claudeRemote ends when the launcher aborts it.
    function setup(runBody: (opts: any, session: Session) => void) {
        const f = fixture();
        const handlers = new Map<string, () => Promise<void>>();
        f.session.client.rpcHandlerManager.registerHandler = (n: string, h: () => Promise<void>) => handlers.set(n, h);
        const queue = new MessageQueue2<EnhancedMode>((m) => JSON.stringify(m));
        const session = new Session({
            api: f.session.api as any, client: { ...f.session.client, keepAlive: vi.fn() } as any,
            path: '/fixture/project', logPath: '/l', sessionId: 'fixture-session', mcpServers: {},
            messageQueue: queue, onModeChange: vi.fn(), hookSettingsPath: '/fixture/settings.json',
        });
        (session.client as any).rpcHandlerManager = f.session.client.rpcHandlerManager;
        (session as any).consumeOneTimeFlags = vi.fn();
        let stopped = false;
        vi.mocked(claudeRemote).mockImplementation(async (opts: any) => {
            if (stopped) { handlers.get('switch')!(); return; }
            runBody(opts, session);
            await new Promise<void>(resolve => opts.signal.addEventListener('abort', () => resolve()));
            opts.onSteerSink?.(null);
            stopped = true;
        });
        return { session, queue, abort: () => handlers.get('abort')!(), done: () => claudeRemoteLauncher(session as any), cleanup: () => session.cleanup() };
    }
    const queued = (q: MessageQueue2<EnhancedMode>) => ((q as any).queue as Array<{ message: string }>).map(i => i.message);

    it('re-queues a steer that was in flight when the user aborted, exactly once', async () => {
        const s = setup((opts, session) => {
            opts.onSteerSink((c: unknown) => void c);
            session.steer('steered', [], mode);
            setTimeout(() => void s.abort(), 0);
        });
        await s.done();
        expect(queued(s.queue)).toEqual(['steered']);
        s.cleanup();
    });

    it('does not re-queue a steer once the turn produced a result', async () => {
        const s = setup((opts, session) => {
            opts.onSteerSink((c: unknown) => void c);
            session.steer('steered', [], mode);
            opts.onTurnComplete?.();
            setTimeout(() => void s.abort(), 0);
        });
        await s.done();
        expect(queued(s.queue)).toEqual([]);
        s.cleanup();
    });

    it('keeps a plain queued message on the queue across an abort', async () => {
        const s = setup((_opts, _session) => {
            s.queue.push('queued', mode);
            setTimeout(() => void s.abort(), 0);
        });
        await s.done();
        expect(queued(s.queue)).toEqual(['queued']);
        s.cleanup();
    });
});
