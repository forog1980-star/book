import { canonicalizeRecordData } from './conflictResolver';
import { computeDeterministicHash } from './pairingService';
import {
  DeviceSyncRole,
  SUPPORTED_SYNC_PROTOCOL_VERSION,
  SyncTransferPackage,
} from './types';

export const CHUNK_SIZE_CHARS = 12000; // ۱۲ کیلوبایت در هر قطعه برای عبور امن در تمامی مرورگرها
export const MAX_TOTAL_CHUNKS = 500; // سقف مجاز تعداد قطعات در یک بسته
export const MAX_PACKAGE_CHARS = 5_000_000; // سقف مجاز حجم رشته بسته (۵ مگابایت کاراکتر)
export const MAX_RECORDS_PER_PACKAGE = 10_000; // سقف مجاز تعداد رکورد در یک بسته

export type WireMessage =
  | {
      type: 'HELLO_HANDSHAKE';
      protocolVersion: number;
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
      protocolVersion: number;
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
  protocolVersion: number;
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
 * بررسی اولیه معتبر بودن پیام شروع انتقال (TRANSFER_START) از نظر نسخه پروتکل و محدودیت‌های اندازه
 */
export function validateTransferStartFrame(
  msg: Extract<WireMessage, { type: 'TRANSFER_START' }>
): { ok: true } | { ok: false; error: string } {
  const version = msg.protocolVersion ?? 1;
  if (version !== SUPPORTED_SYNC_PROTOCOL_VERSION) {
    return {
      ok: false,
      error: `نسخه پروتکل همگام‌سازی دستگاه مقابل (${version}) با نسخه این دستگاه (${SUPPORTED_SYNC_PROTOCOL_VERSION}) سازگار نیست.`,
    };
  }
  if (!msg.packageId || typeof msg.packageId !== 'string' || msg.packageId.length > 96) {
    return { ok: false, error: 'شناسه بسته انتقالی نامعتبر است.' };
  }
  if (
    !Number.isInteger(msg.totalChunks) ||
    msg.totalChunks <= 0 ||
    msg.totalChunks > MAX_TOTAL_CHUNKS
  ) {
    return {
      ok: false,
      error: `تعداد قطعات بسته (${msg.totalChunks}) خارج از محدوده مجاز (۱ تا ${MAX_TOTAL_CHUNKS}) است.`,
    };
  }
  if (
    !Number.isInteger(msg.totalChars) ||
    msg.totalChars <= 0 ||
    msg.totalChars > MAX_PACKAGE_CHARS
  ) {
    return {
      ok: false,
      error: `حجم بسته انتقالی (${msg.totalChars} کاراکتر) خارج از سقف مجاز است.`,
    };
  }
  if (
    !Number.isInteger(msg.recordCount) ||
    msg.recordCount < 0 ||
    msg.recordCount > MAX_RECORDS_PER_PACKAGE
  ) {
    return {
      ok: false,
      error: `تعداد رکوردهای اعلام‌شده (${msg.recordCount}) خارج از محدوده مجاز است.`,
    };
  }
  if (!msg.payloadChecksum || !msg.payloadChecksum.startsWith('SHA256_')) {
    return {
      ok: false,
      error: 'فرمت هش امنیتی SHA-256 در هدر بسته نامعتبر است.',
    };
  }
  return { ok: true };
}

/**
 * تبدیل یک بسته همگام‌سازی به آرایه‌ای از پیام‌های تکه‌تکه (Chunked) با هش یکپارچگی SHA-256
 */
export function buildTransferWireFrames(pkg: SyncTransferPackage): WireMessage[] {
  const serialized = JSON.stringify(pkg);
  if (serialized.length > MAX_PACKAGE_CHARS) {
    throw new Error(
      `حجم بسته (${serialized.length} کاراکتر) بیش از سقف مجاز (${MAX_PACKAGE_CHARS}) است.`
    );
  }

  const checksum = computeDeterministicHash(serialized);
  const totalChunks = Math.max(1, Math.ceil(serialized.length / CHUNK_SIZE_CHARS));
  if (totalChunks > MAX_TOTAL_CHUNKS) {
    throw new Error(
      `تعداد قطعات بسته (${totalChunks}) بیش از سقف مجاز (${MAX_TOTAL_CHUNKS}) است.`
    );
  }

  const frames: WireMessage[] = [
    {
      type: 'TRANSFER_START',
      protocolVersion: pkg.protocolVersion || SUPPORTED_SYNC_PROTOCOL_VERSION,
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
 * بازسازی و بررسی چک‌سام یکپارچگی داده (SHA-256 Data Integrity Checksum) در سمت گیرنده جهت تشخیص خرابی یا ناقص بودن انتقال.
 * (توجه: چک‌سام SHA-256 بدون کلید صرفاً برای کنترل سلامت و یکپارچگی انتقال است و رمزنگاری/احراز اصالت کانال توسط لایه WebRTC DTLS-SRTP و قفل نشست تأمین می‌شود.)
 * اگر حتی یک قطعه ناقص باشد، طول رشته متفاوت باشد، یا چک‌سام SHA-256 بیرونی یا درونی مغایرت داشته باشد،
 * بسته کاملاً رد می‌شود و هیچ داده‌ای اعمال نمی‌گردد.
 */
export function assembleAndVerifyTransferBuffer(
  buffer: IncomingTransferBuffer
): { ok: true; pkg: SyncTransferPackage } | { ok: false; error: string } {
  if ((buffer.protocolVersion ?? 1) !== SUPPORTED_SYNC_PROTOCOL_VERSION) {
    return {
      ok: false,
      error: `عدم سازگاری نسخه پروتکل بسته (${buffer.protocolVersion}).`,
    };
  }

  if (buffer.totalChunks <= 0 || buffer.totalChunks > MAX_TOTAL_CHUNKS) {
    return {
      ok: false,
      error: `تعداد کل قطعات بسته (${buffer.totalChunks}) نامعتبر یا خارج از سقف مجاز است.`,
    };
  }

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
      error: 'طول داده دریافتی با بسته اصلی مطابقت ندارد (احتمال قطع ارتباط یا دستکاری در حین ارسال).',
    };
  }

  const actualChecksum = computeDeterministicHash(fullSerialized);
  if (actualChecksum !== buffer.expectedChecksum) {
    return {
      ok: false,
      error: 'عدم تطابق هش یکپارچگی SHA-256 بسته (Checksum Mismatch). بسته ناقص یا دستکاری‌شده رد شد.',
    };
  }

  try {
    const parsed = JSON.parse(fullSerialized) as SyncTransferPackage;
    if (!parsed || !parsed.packageId || !Array.isArray(parsed.envelopes)) {
      return { ok: false, error: 'ساختار بسته دریافتی نامعتبر است.' };
    }
    if (parsed.protocolVersion !== SUPPORTED_SYNC_PROTOCOL_VERSION) {
      return {
        ok: false,
        error: `نسخه پروتکل داخل بسته (${parsed.protocolVersion}) پشتیبانی نمی‌شود.`,
      };
    }
    if (parsed.envelopes.length !== parsed.recordCount || parsed.recordCount !== buffer.recordCount) {
      return {
        ok: false,
        error: 'تعداد رکوردهای داخل بسته با هدر بسته مطابقت ندارد. بسته رد شد.',
      };
    }

    // ۱. اعتبارسنجی هش SHA-256 محتوای تک‌تک رکوردها در برابر changeId ثبت‌شده در متادیتای رکورد
    for (const env of parsed.envelopes) {
      if (!env || !env.meta || !env.meta.collection || !env.meta.recordId || !env.meta.changeId) {
        return { ok: false, error: 'متادیتای یکی از رکوردهای بسته ناقص یا نامعتبر است.' };
      }
      if (!env.meta.softDeleted) {
        const canonical = canonicalizeRecordData(env.data);
        const expectedRecordHash = computeDeterministicHash(
          `${env.meta.collection}:${env.meta.recordId}:${canonical}`
        );
        if (env.meta.changeId !== expectedRecordHash) {
          return {
            ok: false,
            error: `عدم تطابق هش یکپارچگی SHA-256 در محتوای رکورد «${env.meta.recordId}». بسته دستکاری‌شده رد شد.`,
          };
        }
      }
    }

    // ۲. اعتبارسنجی هش SHA-256 کلی رکوردهای بسته (payloadChecksum)
    const expectedInnerDigest = computeDeterministicHash(
      parsed.envelopes
        .map((e) => `${e.meta.collection}:${e.meta.recordId}:${e.meta.changeId}`)
        .join('|')
    );
    if (parsed.payloadChecksum !== expectedInnerDigest) {
      return {
        ok: false,
        error: 'عدم تطابق هش SHA-256 درونی رکوردهای بسته. بسته دستکاری‌شده رد شد.',
      };
    }

    return { ok: true, pkg: parsed };
  } catch {
    return { ok: false, error: 'خطا در رمزگشایی JSON بسته دریافتی.' };
  }
}
