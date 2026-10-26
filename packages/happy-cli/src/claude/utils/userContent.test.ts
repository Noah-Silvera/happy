import { describe, expect, it } from 'vitest';
import { MessageMetaSchema } from '@/api/types';
import { buildUserContent } from './userContent';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);

describe('buildUserContent', () => {
    it('returns plain text without attachments', () => {
        expect(buildUserContent('hi', [])).toBe('hi');
    });

    it('puts image blocks before the text and drops unsupported bytes', () => {
        const out = buildUserContent('look', [
            { data: png, mimeType: 'image/heic', name: 'a.png' },
            { data: new Uint8Array([1, 2, 3]), mimeType: 'image/png', name: 'bad' },
        ]) as Array<{ type: string }>;
        expect(out.map((b) => b.type)).toEqual(['image', 'text']);
    });
});

describe('MessageMetaSchema delivery', () => {
    it.each(['steer', 'queue'])('keeps %s', (delivery) => {
        expect(MessageMetaSchema.parse({ delivery }).delivery).toBe(delivery);
    });

    it('degrades an unknown delivery to unset instead of rejecting the message', () => {
        expect(MessageMetaSchema.parse({ delivery: 'later', model: 'm' })).toEqual({ model: 'm' });
    });
});
