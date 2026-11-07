import { DeviceSyncRole } from './types';

const SAFE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const QR_PREFIX = 'GOLZAR_P2P_V1:';

/**
 * تولید کد جفت‌سازی امن ۱۲ کاراکتری (سه بخش ۴ کاراکتری: XXXX-XXXX-XXXX)
 * با آنتروپی بالا (۳۲ به توان ۱۲ حالت) و بدون کاراکترهای مشابه مثل O/0 یا I/1
 */
export function generateSecurePairingCode(): string {
  const bytes = new Uint8Array(12);
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 12; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  let chars = '';
  for (let i = 0; i < 12; i++) {
    chars += SAFE_ALPHABET[bytes[i] % SAFE_ALPHABET.length];
  }

  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/**
 * نرمال‌سازی کد جفت‌سازی واردشده توسط کاربر یا اسکن‌شده از QR
 */
export function normalizePairingCode(rawInput: string): string {
  let cleaned = String(rawInput || '').trim().toUpperCase();
  if (cleaned.startsWith(QR_PREFIX)) {
    cleaned = cleaned.slice(QR_PREFIX.length);
  }
  const alnum = cleaned.replace(/[^A-Z0-9]/g, '');
  if (alnum.length !== 12) {
    return '';
  }
  return `${alnum.slice(0, 4)}-${alnum.slice(4, 8)}-${alnum.slice(8, 12)}`;
}

/**
 * محاسبه هش قطعی (FNV-1a 64-bit / Hex) برای بررسی صحت کد و چک‌سام بسته‌ها
 */
export function computeDeterministicHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `DG_${hex1}${hex2}`;
}

/**
 * استخراج شناسه جلسه Firestore از کد جفت‌سازی (مطابق الگوی امنیتی ^[A-Za-z0-9_\-]{12,64}$)
 */
export function deriveSignalingSessionId(pairingCode: string): string {
  const norm = normalizePairingCode(pairingCode);
  if (!norm) {
    throw new Error('کد جفت‌سازی نامعتبر است. کد باید ۱۲ کاراکتر (XXXX-XXXX-XXXX) باشد.');
  }
  const cleanAlnum = norm.replace(/-/g, '');
  const digestSuffix = computeDeterministicHash(`GOLZAR_SESSION_${cleanAlnum}`).slice(3, 11);
  return `SESS_${cleanAlnum}_${digestSuffix}`;
}

export function derivePairingDigest(pairingCode: string): string {
  const norm = normalizePairingCode(pairingCode);
  return computeDeterministicHash(`PAIRING_VERIFY_${norm}`);
}

export function buildPairingQrValue(pairingCode: string): string {
  return `${QR_PREFIX}${normalizePairingCode(pairingCode)}`;
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
