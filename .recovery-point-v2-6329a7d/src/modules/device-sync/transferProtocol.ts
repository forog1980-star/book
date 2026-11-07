import { computeDeterministicHash } from './pairingService';
import { DeviceSyncRole, SyncTransferPackage } from './types';

const CHUNK_SIZE_CHARS = 12000; // ۱۲ کیلوبایت برای اطمینان کامل از عبور در تمام مرورگرهای اندروید و دسکتاپ

export type WireMessage =
  | {
      type: 'HELLO_HANDSHAKE';
      deviceId: string;
      deviceRole: DeviceSyncRole;
      timestampMs: number;
    }
  | {
      type: 'PING_HEARTBEAT';
      timestampMs: number;
    }
  | {
      type: 'TRANSFER_START';
      packageId: string;
      senderRole: DeviceSyncRole;
      totalChunks: number;
      totalChars: number;
      recordCount: number;
      payloadChecksum: string;
      timestampMs: number;
    }
  | {
      type: 'TRANSFER_CHUNK';
      packageId: string;
      chunkIndex: number;
      chunkData: string;
    }
  | {
      type: 'TRANSFER_END';
      packageId: string;
      payloadChecksum: string;
    }
  | {
      type: 'TRANSFER_ACK';
      packageId: string;
      ok: boolean;
      error?: string;
    };

export interface IncomingTransferBuffer {
  packageId: string;
  senderRole: DeviceSyncRole;
  totalChunks: number;
  totalChars: number;
  recordCount: number;
  expectedChecksum: string;
  receivedChunks: Map<number, string>;
  startedAtMs: number;
}

/**
 * تبدیل یک بسته همگام‌سازی به آرایه‌ای از پیام‌های تکهتکه (Chunked) برای ارسال امن در DataChannel
 */
export function buildTransferWireFrames(pkg: SyncTransferPackage): WireMessage[] {
  const serialized = JSON.stringify(pkg);
  const checksum = computeDeterministicHash(serialized);
  const totalChunks = Math.max(1, Math.ceil(serialized.length / CHUNK_SIZE_CHARS));

  const frames: WireMessage[] = [
    {
      type: 'TRANSFER_START',
      packageId: pkg.packageId,
      senderRole: pkg.senderRole,
      totalChunks,
      totalChars: serialized.length,
      recordCount: pkg.recordCount,
      payloadChecksum: checksum,
      timestampMs: Date.now(),
    },
  ];

  for (let i = 0; i < totalChunks; i++) {
    const slice = serialized.slice(i * CHUNK_SIZE_CHARS, (i + 1) * CHUNK_SIZE_CHARS);
    frames.push({
      type: 'TRANSFER_CHUNK',
      packageId: pkg.packageId,
      chunkIndex: i,
      chunkData: slice,
    });
  }

  frames.push({
    type: 'TRANSFER_END',
    packageId: pkg.packageId,
    payloadChecksum: checksum,
  });

  return frames;
}

/**
 * بازسازی و اعتبارسنجی بسته دریافتی در سمت گیرنده.
 * اگر حتی یک قطعه (Chunk) ناقص باشد یا چک‌سام مطابقت نداشته باشد، خطا برمی‌گرداند و داده ناقص هرگز اعمال نمی‌شود.
 */
export function assembleAndVerifyTransferBuffer(
  buffer: IncomingTransferBuffer
): { ok: true; pkg: SyncTransferPackage } | { ok: false; error: string } {
  if (buffer.receivedChunks.size !== buffer.totalChunks) {
    return {
      ok: false,
      error: `انتقال ناقص: تنها ${buffer.receivedChunks.size} از ${buffer.totalChunks} قطعه دریافت شد. اطلاعات ناقص نادیده گرفته شد.`,
    };
  }

  const orderedParts: string[] = [];
  for (let i = 0; i < buffer.totalChunks; i++) {
    const part = buffer.receivedChunks.get(i);
    if (typeof part !== 'string') {
      return {
        ok: false,
        error: `قطعه شماره ${i + 1} در حین انتقال مفقود شده است.`,
      };
    }
    orderedParts.push(part);
  }

  const fullSerialized = orderedParts.join('');
  if (fullSerialized.length !== buffer.totalChars) {
    return {
      ok: false,
      error: 'طول داده دریافتی با بسته اصلی مطابقت ندارد (احتمال قطع ارتباط در حین ارسال).',
    };
  }

  const actualChecksum = computeDeterministicHash(fullSerialized);
  if (actualChecksum !== buffer.expectedChecksum) {
    return {
      ok: false,
      error: 'عدم تطابق چک‌سام امنیتی بسته (Checksum Mismatch). بسته ناقص یا مخدوش رد شد.',
    };
  }

  try {
    const parsed = JSON.parse(fullSerialized) as SyncTransferPackage;
    if (!parsed || !parsed.packageId || !Array.isArray(parsed.envelopes)) {
      return { ok: false, error: 'ساختار بسته دریافتی نامعتبر است.' };
    }
    return { ok: true, pkg: parsed };
  } catch {
    return { ok: false, error: 'خطا در رمزگشایی JSON بسته دریافتی.' };
  }
}
