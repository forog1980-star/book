import { DeviceSyncRole } from './types';

const SAFE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const QR_PREFIX_V1 = 'GOLZAR_P2P_V1:';
const QR_PREFIX_V2 = 'GOLZAR_P2P_V2:';

// ثابت‌های استاندارد الگوریتم رمزنگاری SHA-256 (NIST FIPS 180-4)
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n));
}

/**
 * محاسبه استاندارد و قطعی SHA-256 (مطابق FIPS 180-4) روی رشته UTF-8
 * خروجی: ۶۴ کاراکتر هگزادسیمال کوچک (کاملاً یکسان در مرورگر اندروید، دسکتاپ و محیط تست)
 */
export function sha256Hex(input: string): string {
  const utf8Bytes = new TextEncoder().encode(input);
  const bitLen = utf8Bytes.length * 8;

  const totalLen = (((utf8Bytes.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(totalLen);
  padded.set(utf8Bytes);
  padded[utf8Bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  const highBits = Math.floor(bitLen / 0x100000000);
  const lowBits = bitLen >>> 0;
  view.setUint32(totalLen - 8, highBits, false);
  view.setUint32(totalLen - 4, lowBits, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3);
      const s1 = rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => (word >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

/**
 * نسخه ناهمگام SHA-256 با استفاده از Web Crypto API در صورت وجود
 */
export async function sha256HexAsync(input: string): Promise<string> {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    const encoded = new TextEncoder().encode(input);
    const buf = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return sha256Hex(input);
}

/**
 * تولید بایت‌های تصادفی رمزنگاری‌شده (CSPRNG) بدون استفاده از Math.random
 */
export function getCryptoRandomBytes(length: number): Uint8Array {
  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  throw new Error('محیط فعلی از مولد تصادفی رمزنگاری‌شده (CSPRNG) پشتیبانی نمی‌کند.');
}

/**
 * تولید رشته تصادفی رمزنگاری‌شده با طول مشخص از الفبای امن
 */
export function generateCryptoRandomToken(length = 8): string {
  const bytes = getCryptoRandomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += SAFE_ALPHABET[bytes[i] % SAFE_ALPHABET.length];
  }
  return out;
}

/**
 * تولید شناسه نشست کاملاً تصادفی (۱۹۲ بیت آنتروپی CSPRNG) و مستقل از کد کوتاه تأیید
 * قالب خروجی: SESS_ + ۴۸ کاراکتر هگزادسیمال کوچک (۵۳ کاراکتر، منطبق با firestore.rules)
 */
export function generateRandomSessionId(): string {
  const bytes = getCryptoRandomBytes(24);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `SESS_${hex}`;
}

export function isValidSignalingSessionId(sessionId: string): boolean {
  return /^SESS_[0-9a-f]{48}$/.test(String(sessionId || '').trim());
}

/**
 * تولید کد تأیید/جفت‌سازی امن ۱۲ کاراکتری (سه بخش ۴ کاراکتری: XXXX-XXXX-XXXX)
 * با استفاده انحصاری از CSPRNG (۶۰ بیت آنتروپی، بدون کاراکترهای ابهام‌برانگیز O/0 یا I/1)
 */
export function generateSecurePairingCode(): string {
  const chars = generateCryptoRandomToken(12);
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/**
 * نرمال‌سازی کد تأیید ۱۲ کاراکتری
 */
export function normalizePairingCode(rawInput: string): string {
  let cleaned = String(rawInput || '').trim().toUpperCase();
  if (cleaned.startsWith(QR_PREFIX_V1)) {
    cleaned = cleaned.slice(QR_PREFIX_V1.length);
  }
  const alnum = cleaned.replace(/[^A-Z0-9]/g, '');
  if (alnum.length !== 12) {
    return '';
  }
  for (let i = 0; i < alnum.length; i++) {
    if (!SAFE_ALPHABET.includes(alnum[i])) {
      return '';
    }
  }
  return `${alnum.slice(0, 4)}-${alnum.slice(4, 8)}-${alnum.slice(8, 12)}`;
}

/**
 * محاسبه هش رمزنگاری‌شده SHA-256 برای یکپارچگی بسته‌ها و تشخیص تغییرات رکوردها
 */
export function computeDeterministicHash(input: string): string {
  return `SHA256_${sha256Hex(input)}`;
}

/**
 * مشتق‌سازی یک‌طرفه شناسه نشست (پشتیبانی سازگار برای کدهای V1؛ در الگوی V2 از generateRandomSessionId استفاده می‌شود)
 */
export function deriveSignalingSessionId(pairingCode: string): string {
  const norm = normalizePairingCode(pairingCode);
  if (!norm) {
    throw new Error('کد جفت‌سازی نامعتبر است. کد باید ۱۲ کاراکتر معتبر (XXXX-XXXX-XXXX) باشد.');
  }
  const sessionHash = sha256Hex(`MARKAZ_ASNAD_SIGNAL_SESSION_V2:${norm}`);
  return `SESS_${sessionHash.slice(0, 48)}`;
}

/**
 * مشتق‌سازی Digest تأیید کد نشست با دامنه مجزا (Domain Separation) و الگوریتم SHA-256
 */
export function derivePairingDigest(pairingCode: string): string {
  const norm = normalizePairingCode(pairingCode);
  if (!norm) {
    throw new Error('کد جفت‌سازی نامعتبر است.');
  }
  return `SHA256_${sha256Hex(`MARKAZ_ASNAD_PAIRING_VERIFY_V2:${norm}`)}`;
}

/**
 * ماسک کردن شناسه نشست برای نمایش ایمن در رابط کاربری
 */
export function maskSessionIdForDisplay(sessionId: string): string {
  if (!sessionId || sessionId.length < 16) return 'SESS_***';
  return `${sessionId.slice(0, 9)}...${sessionId.slice(-6)}`;
}

export interface LaptopInitiatedSessionCredentials {
  sessionId: string;
  pairingCode: string;
  pairingCodeDigest: string;
  laptopDeviceId: string;
  qrValue: string;
}

/**
 * ساخت مشخصات نشست آغازشده توسط لپ‌تاپ:
 * - sessionId کاملاً تصادفی و مستقل از کد کوتاه تأیید (pairingCode) است
 * - QR Code حاوی شناسه نشست تصادفی، کد تأیید و شناسه دستگاه لپ‌تاپ است تا گوشی با اسکن آن مشخصات لپ‌تاپ را ببیند و تأیید کند
 */
export function createLaptopInitiatedSessionCredentials(
  laptopDeviceId: string
): LaptopInitiatedSessionCredentials {
  const sessionId = generateRandomSessionId();
  const pairingCode = generateSecurePairingCode();
  const pairingCodeDigest = derivePairingDigest(pairingCode);
  const safeDeviceId = String(laptopDeviceId || 'DEV_LAPTOP').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48) || 'DEV_LAPTOP';
  const qrValue = buildLaptopSessionQrValue({
    sessionId,
    pairingCode,
    laptopDeviceId: safeDeviceId,
  });

  return {
    sessionId,
    pairingCode,
    pairingCodeDigest,
    laptopDeviceId: safeDeviceId,
    qrValue,
  };
}

export function buildLaptopSessionQrValue(params: {
  sessionId: string;
  pairingCode: string;
  laptopDeviceId: string;
}): string {
  if (!isValidSignalingSessionId(params.sessionId)) {
    throw new Error('شناسه نشست نامعتبر است.');
  }
  const normCode = normalizePairingCode(params.pairingCode);
  if (!normCode) {
    throw new Error('کد تأیید نشست نامعتبر است.');
  }
  const safeDeviceId =
    String(params.laptopDeviceId || 'DEV_LAPTOP')
      .replace(/[^A-Za-z0-9_-]/g, '')
      .slice(0, 48) || 'DEV_LAPTOP';
  return `${QR_PREFIX_V2}${params.sessionId}:${normCode}:${safeDeviceId}`;
}

export interface ParsedLaptopQrPayload {
  sessionId: string;
  pairingCode: string;
  laptopDeviceId: string;
}

/**
 * رمزگشایی و اعتبارسنجی محتوای QR Code اسکن‌شده توسط گوشی
 */
export function parseLaptopSessionQrValue(rawQrInput: string): ParsedLaptopQrPayload | null {
  const trimmed = String(rawQrInput || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith(QR_PREFIX_V2)) {
    const body = trimmed.slice(QR_PREFIX_V2.length);
    const parts = body.split(':');
    if (parts.length < 2) return null;
    const rawSessionId = parts[0].trim();
    const rawCode = parts[1].trim();
    const rawDeviceId = (parts.slice(2).join(':') || 'DEV_LAPTOP').trim();

    if (!isValidSignalingSessionId(rawSessionId)) {
      return null;
    }
    const normCode = normalizePairingCode(rawCode);
    if (!normCode) {
      return null;
    }
    return {
      sessionId: rawSessionId,
      pairingCode: normCode,
      laptopDeviceId: rawDeviceId.slice(0, 48) || 'DEV_LAPTOP',
    };
  }

  return null;
}

export function buildPairingQrValue(pairingCode: string, sessionId?: string, laptopDeviceId?: string): string {
  const norm = normalizePairingCode(pairingCode);
  if (!norm) {
    throw new Error('کد جفت‌سازی نامعتبر است.');
  }
  if (sessionId && isValidSignalingSessionId(sessionId)) {
    return buildLaptopSessionQrValue({
      sessionId,
      pairingCode: norm,
      laptopDeviceId: laptopDeviceId || 'DEV_LAPTOP',
    });
  }
  return `${QR_PREFIX_V1}${norm}`;
}

export function detectDefaultDeviceRole(): DeviceSyncRole {
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent || '';
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) {
      return 'phone-primary';
    }
  }
  return 'pc-companion';
}
