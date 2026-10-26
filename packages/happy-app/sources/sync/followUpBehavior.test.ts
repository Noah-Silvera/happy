import { describe, expect, it } from 'vitest';
import {
    FOLLOW_UP_QUEUEING_CAPABILITY,
    normalizeFollowUpBehavior,
    resolveFollowUpDeliveries,
    resolveFollowUpDelivery,
    rigSupportsFollowUpQueueing,
} from './followUpBehavior';
import { settingsDefaults } from './settings';
import { MetadataSchema } from './storageTypes';
import { rigMetadataFixture } from './__testdata__/rigMetadata';

describe('followUpBehavior', () => {
    it('defaults to steer, which keeps today’s Happy Agent behavior', () => {
        expect(settingsDefaults.followUpBehavior).toBe('steer');
        expect(resolveFollowUpDeliveries(settingsDefaults.followUpBehavior)).toEqual({ plain: 'steer', alternate: 'queue' });
    });

    it.each([
        ['steer', { plain: 'steer', alternate: 'queue' }],
        ['queue', { plain: 'queue', alternate: 'steer' }],
        ['alwaysSteer', { plain: 'steer', alternate: 'steer' }],
        ['alwaysQueue', { plain: 'queue', alternate: 'queue' }],
    ])('maps %s to its send and alternate deliveries', (behavior, deliveries) => {
        expect(resolveFollowUpDeliveries(behavior)).toEqual(deliveries);
        expect(resolveFollowUpDelivery(behavior, 'plain')).toBe(deliveries.plain);
        expect(resolveFollowUpDelivery(behavior, 'alternate')).toBe(deliveries.alternate);
    });

    it.each([undefined, null, '', 'sometimes', 42])('falls back to steer for an unknown stored value (%j)', (value) => {
        expect(normalizeFollowUpBehavior(value)).toBe('steer');
        expect(resolveFollowUpDelivery(value, 'plain')).toBe('steer');
    });
});

describe('rigSupportsFollowUpQueueing', () => {
    const withCapability = (value: unknown) => ({
        ...rigMetadataFixture,
        capabilities: { ...rigMetadataFixture.capabilities!, [FOLLOW_UP_QUEUEING_CAPABILITY]: value },
    });

    it('is on only when a Happy Agent advertises it as exactly true', () => {
        expect(rigSupportsFollowUpQueueing(withCapability(true))).toBe(true);
        expect(rigSupportsFollowUpQueueing(withCapability(false))).toBe(false);
        expect(rigSupportsFollowUpQueueing(withCapability('true'))).toBe(false);
        // Today's daemons advertise steering but not queueing.
        expect(rigSupportsFollowUpQueueing(rigMetadataFixture)).toBe(false);
    });

    it('is on for a happy-cli session that advertises the top-level queueing flag', () => {
        const cli = { path: '/repo', host: 'mac', flavor: 'claude' } as any;
        expect(rigSupportsFollowUpQueueing({ ...cli, queueing: true })).toBe(true);
        expect(rigSupportsFollowUpQueueing({ ...cli, queueing: false })).toBe(false);
        expect(rigSupportsFollowUpQueueing(cli)).toBe(false);
    });

    it('keeps the queueing flag when parsing session metadata', () => {
        const parsed = MetadataSchema.parse({ path: '/repo', host: 'mac', queueing: true });
        expect(parsed.queueing).toBe(true);
        expect(MetadataSchema.parse({ path: '/repo', host: 'mac', queueing: 'yes' }).queueing).toBeUndefined();
    });

    it('is off for legacy happy-cli sessions and missing metadata', () => {
        expect(rigSupportsFollowUpQueueing({ path: '/repo', host: 'mac', flavor: 'claude' } as any)).toBe(false);
        expect(rigSupportsFollowUpQueueing(null)).toBe(false);
        expect(rigSupportsFollowUpQueueing(undefined)).toBe(false);
    });
});
