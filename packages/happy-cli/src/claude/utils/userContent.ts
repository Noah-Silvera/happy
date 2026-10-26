import type { ContentBlockParam, MessageParam } from '@anthropic-ai/sdk/resources';
import { logger } from '@/ui/logger';
import type { PendingAttachment } from '@/utils/MessageQueue2';

/**
 * Detect the image media type Claude accepts from the decrypted blob's
 * magic-byte header. The wire-supplied mimeType is unreliable (iOS picker
 * reports things like "image/heic" or no value at all), and the Anthropic
 * API enforces a strict enum on `image.source.base64.media_type`. Returning
 * null when the bytes don't match a supported format causes the caller to
 * drop the attachment instead of shipping an invalid request that the API
 * rejects with HTTP 400.
 */
function detectClaudeImageMime(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null {
    if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
        return 'image/png';
    }
    if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
        return 'image/jpeg';
    }
    if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
        return 'image/gif';
    }
    if (
        bytes.length >= 12 &&
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) {
        return 'image/webp';
    }
    return null;
}

/**
 * Build the SDK user-message content for a prompt: the plain text when there
 * are no usable attachments, else image blocks followed by the text. Shared by
 * the turn-start path and the mid-run steer path so both treat attachments alike.
 */
export function buildUserContent(text: string, attachments: PendingAttachment[]): MessageParam['content'] {
    if (attachments.length === 0) return text;
    const contentBlocks: ContentBlockParam[] = [];
    for (const att of attachments) {
        // Detect media type from the decrypted bytes' magic header rather than
        // trusting the wire-supplied mimeType; unsupported bytes are dropped.
        const detected = detectClaudeImageMime(att.data);
        if (!detected) {
            logger.debug(`[remote] Skipping unsupported attachment (no magic-byte match): ${att.name}, claimed mimeType=${att.mimeType}`);
            continue;
        }
        contentBlocks.push({
            type: 'image' as const,
            source: {
                type: 'base64' as const,
                media_type: detected,
                data: Buffer.from(att.data).toString('base64'),
            },
        });
    }
    contentBlocks.push({ type: 'text' as const, text });
    logger.debug(`[remote] Combined ${contentBlocks.length - 1} image(s) with text message`);
    return contentBlocks;
}
