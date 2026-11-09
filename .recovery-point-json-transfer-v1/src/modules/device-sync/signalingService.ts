import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  setDoc,
  Unsubscribe,
  updateDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';
import { isValidSignalingSessionId, maskSessionIdForDisplay } from './pairingService';
import { getOrCreateLocalDeviceId } from './syncStorage';
import { DeviceSyncRole } from './types';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

/**
 * راه‌اندازی Firestore با فعال‌سازی اجباری HTTP Long-Polling:
 * در شبکه‌های موبایل، هات‌اسپات و پراکسی‌ها، کانال استریم WebChannel پیش‌فرض فایربیس
 * در عملیات نوشتن و تراکنش‌ها با خطای «Connection failed» قطع می‌شود.
 * استفاده از experimentalForceLongPolling ارتباط را روی درخواست‌های استاندارد HTTP پایدار می‌کند.
 */
function createStableSignalingFirestore(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const signalingDb = createStableSignalingFirestore();
export const signalingAuth = getAuth(app);

export const SIGNALING_COLLECTION = 'webrtc_signaling_sessions';
export const SESSION_TTL_MS = 10 * 60 * 1000; // ۱۰ دقیقه اعتبار موقت و یک‌بارمصرف جلسه
// تلورانس اختلاف ساعت محلی بین دو دستگاه (مثلاً اختلاف ۱ ساعته ساعت تابستانی/زمستانی ویندوز و اندروید در ایران)
export const CLOCK_SKEW_TOLERANCE_MS = 2 * 60 * 60 * 1000;

export function isSignalingDocExpired(data: { createdAtMs: number; expiresAtMs: number }): boolean {
  const now = Date.now();
  return (
    now > data.expiresAtMs + CLOCK_SKEW_TOLERANCE_MS ||
    now > data.createdAtMs + SESSION_TTL_MS + CLOCK_SKEW_TOLERANCE_MS
  );
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    isAnonymous?: boolean | null;
  };
}

/**
 * تشخیص خطاهای موقت شبکه/کانال در موبایل و لپ‌تاپ جهت تلاش مجدد خودکار (Retry)
 */
function isTransientFirestoreNetworkError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error || '')).toLowerCase();
  return (
    msg.includes('connection failed') ||
    msg.includes('unavailable') ||
    msg.includes('deadline-exceeded') ||
    msg.includes('network-request-failed') ||
    msg.includes('failed to get document') ||
    msg.includes('client is offline') ||
    msg.includes('fetch') ||
    msg.includes('aborted') ||
    msg.includes('internal') ||
    msg.includes('unknown')
  );
}

async function withFirestoreRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 4,
  baseDelayMs = 450
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts || !isTransientFirestoreNetworkError(err)) {
        throw err;
      }
      const waitMs = baseDelayMs * attempt;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

async function getSignalingDocSnapshot(sessionId: string) {
  const sessionRef = doc(signalingDb, SIGNALING_COLLECTION, sessionId);
  try {
    return await getDocFromServer(sessionRef);
  } catch (err) {
    if (isTransientFirestoreNetworkError(err)) {
      return await getDoc(sessionRef);
    }
    throw err;
  }
}

/**
 * ثبت خطای ساختاریافته بدون افشای کد تأیید، ایمیل یا اطلاعات محرمانه کاربر در لاگ‌ها
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  sessionIdOrPath: string | null
): never {
  const maskedPath = sessionIdOrPath
    ? `${SIGNALING_COLLECTION}/${maskSessionIdForDisplay(
        sessionIdOrPath.replace(`${SIGNALING_COLLECTION}/`, '')
      )}`
    : null;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: signalingAuth.currentUser?.uid || null,
      isAnonymous: signalingAuth.currentUser?.isAnonymous ?? null,
    },
    operationType,
    path: maskedPath,
  };
  console.error('Signaling Firestore Error:', JSON.stringify(errInfo));
  throw new Error(
    `خطای مجوز یا ارتباط با سرویس هماهنگی اولیه (${operationType}): ${errInfo.error}`
  );
}

export interface WebRtcSignalingDocument {
  sessionId: string;
  pairingCodeDigest: string;
  hostDeviceRole: DeviceSyncRole;
  hostUid: string;
  peerUid?: string;
  status:
    | 'waiting-for-peer'
    | 'offer-ready'
    | 'answer-ready'
    | 'connected'
    | 'closed'
    | 'expired';
  offerType: string;
  offerSdp: string;
  answerType?: string;
  answerSdp?: string;
  hostCandidatesJson: string;
  peerCandidatesJson: string;
  createdAtMs: number;
  expiresAtMs: number;
  updatedAtMs: number;
}

const ALLOWED_SIGNALING_KEYS = new Set([
  'sessionId',
  'pairingCodeDigest',
  'hostDeviceRole',
  'hostUid',
  'peerUid',
  'status',
  'offerType',
  'offerSdp',
  'answerType',
  'answerSdp',
  'hostCandidatesJson',
  'peerCandidatesJson',
  'createdAtMs',
  'expiresAtMs',
  'updatedAtMs',
]);

/**
 * گارد امنیتی سخت‌گیرانه سمت کلاینت:
 * تضمین می‌کند هیچ فیلد محتوایی کتابخانه، شهید، قفسه یا پشتیبان هرگز وارد شیء Signaling نشود.
 */
export function assertSignalingOnlyPayload(payload: Record<string, unknown>): void {
  for (const key of Object.keys(payload)) {
    if (!ALLOWED_SIGNALING_KEYS.has(key)) {
      throw new Error(
        `SECURITY_VIOLATION: فیلد غیرمجاز «${key}» در پیام Signaling شناسایی و مسدود شد. ذخیره اطلاعات کتابخانه در Firebase ممنوع است.`
      );
    }
  }
}

/**
 * شناسه مالکیت نشست برای دستگاه فعلی بدون فراخوانی شبکه اضافی (signInAnonymously)
 * که در مرورگرهای موبایل باعث تأخیر و خطای شبکه هنگام اسکن QR می‌شد.
 */
export async function ensureSignalingAuth(): Promise<string> {
  if (signalingAuth.currentUser?.uid) {
    return signalingAuth.currentUser.uid;
  }
  const fallbackId = String(getOrCreateLocalDeviceId() || 'LOCAL_DEV')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 96);
  return `DEV_${fallbackId || 'LOCAL_DEV'}`;
}

export async function testSignalingConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(signalingDb, SIGNALING_COLLECTION, 'SESS_CONN_PROBE_00000001'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    return true;
  }
}

export async function createSignalingOfferSession(params: {
  sessionId: string;
  pairingCodeDigest: string;
  hostDeviceRole: DeviceSyncRole;
  offerSdp: string;
  hostCandidates: RTCIceCandidateInit[];
}): Promise<WebRtcSignalingDocument> {
  if (!isValidSignalingSessionId(params.sessionId)) {
    throw new Error('شناسه نشست نامعتبر است؛ باید ۵۳ کاراکتر تصادفی با پیشوند SESS_ باشد.');
  }

  const uid = await ensureSignalingAuth();
  const now = Date.now();
  const safeHostRole: DeviceSyncRole =
    params.hostDeviceRole === 'phone-primary' ? 'phone-primary' : 'pc-companion';
  const docWithAuth: WebRtcSignalingDocument = {
    sessionId: params.sessionId,
    pairingCodeDigest: params.pairingCodeDigest.slice(0, 128),
    hostDeviceRole: safeHostRole,
    hostUid: uid,
    status: 'offer-ready',
    offerType: 'offer',
    offerSdp: params.offerSdp.slice(0, 24000),
    hostCandidatesJson: JSON.stringify(params.hostCandidates || []).slice(0, 32000),
    peerCandidatesJson: '[]',
    createdAtMs: now,
    expiresAtMs: now + SESSION_TTL_MS,
    updatedAtMs: now,
  };

  assertSignalingOnlyPayload(docWithAuth as unknown as Record<string, unknown>);

  try {
    await withFirestoreRetry(async () => {
      await setDoc(doc(signalingDb, SIGNALING_COLLECTION, params.sessionId), docWithAuth);
    });
    return docWithAuth;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, params.sessionId);
  }
}

/**
 * بررسی و اعتبارسنجی نشست به محض اسکن QR در دستگاه دوم:
 * بدون استفاده از runTransaction (که روی شبکه موبایل در برخورد با Trickle ICE دچار خطای Connection failed می‌شد).
 * ثبت نهایی peerUid و پاسخ SDP به‌صورت یکجا در submitSignalingAnswer انجام می‌گیرد.
 */
export async function claimAndInspectSignalingSession(
  sessionId: string,
  expectedPairingDigest: string
): Promise<WebRtcSignalingDocument> {
  if (!isValidSignalingSessionId(sessionId)) {
    throw new Error('شناسه نشست اسکن‌شده نامعتبر است.');
  }

  const uid = await ensureSignalingAuth();

  try {
    return await withFirestoreRetry(async () => {
      const snap = await getSignalingDocSnapshot(sessionId);
      if (!snap.exists()) {
        throw new Error('SESSION_NOT_FOUND_OR_EXPIRED');
      }

      const data = snap.data() as WebRtcSignalingDocument;
      if (isSignalingDocExpired(data)) {
        throw new Error('SESSION_NOT_FOUND_OR_EXPIRED');
      }

      if (
        data.status === 'connected' ||
        data.status === 'closed' ||
        data.status === 'expired' ||
        (data.status === 'answer-ready' && data.peerUid && data.peerUid !== uid) ||
        (Boolean(data.answerSdp) && data.peerUid && data.peerUid !== uid)
      ) {
        throw new Error('SESSION_ALREADY_CONSUMED');
      }

      if (data.peerUid && data.peerUid !== uid) {
        throw new Error('SESSION_ALREADY_CLAIMED_BY_ANOTHER_PEER');
      }

      if (data.pairingCodeDigest !== expectedPairingDigest) {
        throw new Error('SESSION_DIGEST_MISMATCH');
      }

      return {
        ...data,
        peerUid: uid,
      };
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'SESSION_NOT_FOUND_OR_EXPIRED') {
        await cleanupSignalingSession(sessionId);
        throw new Error('نشست فعالی برای این QR Code یافت نشد یا مهلت ۱۰ دقیقه‌ای آن منقضی شده است.');
      }
      if (error.message === 'SESSION_ALREADY_CONSUMED') {
        throw new Error(
          'این QR Code و نشست جفت‌سازی یک‌بارمصرف بوده و قبلاً استفاده یا بسته شده است. لطفاً در دستگاه مقابل QR جدیدی تولید کنید.'
        );
      }
      if (error.message === 'SESSION_ALREADY_CLAIMED_BY_ANOTHER_PEER') {
        throw new Error(
          'این نشست قبلاً توسط دستگاه دیگری قفل شده است؛ جهت امنیت، QR جدید تولید نمایید.'
        );
      }
      if (error.message === 'SESSION_DIGEST_MISMATCH') {
        throw new Error('عدم تطابق هش یکپارچگی SHA-256 کد نشست؛ درخواست اتصال مسدود شد.');
      }
    }
    handleFirestoreError(error, OperationType.GET, sessionId);
  }
}

export async function fetchSignalingSession(
  sessionId: string
): Promise<WebRtcSignalingDocument | null> {
  if (!isValidSignalingSessionId(sessionId)) {
    throw new Error('شناسه نشست اسکن‌شده نامعتبر است.');
  }

  const uid = await ensureSignalingAuth();
  try {
    const snap = await withFirestoreRetry(() => getSignalingDocSnapshot(sessionId));
    if (!snap.exists()) {
      return null;
    }
    const data = snap.data() as WebRtcSignalingDocument;
    if (isSignalingDocExpired(data)) {
      await cleanupSignalingSession(sessionId);
      return null;
    }
    if (
      data.status === 'connected' ||
      data.status === 'closed' ||
      data.status === 'expired' ||
      (Boolean(data.answerSdp) && data.peerUid && data.peerUid !== uid) ||
      (data.peerUid && data.peerUid !== uid)
    ) {
      throw new Error(
        'این QR Code و نشست جفت‌سازی یک‌بارمصرف بوده و قبلاً استفاده یا بسته شده است. لطفاً QR جدیدی تولید کنید.'
      );
    }
    return data;
  } catch (error) {
    if (error instanceof Error && error.message.includes('قبلاً استفاده یا بسته شده')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.GET, sessionId);
  }
}

// مجموعه نشست‌هایی که در حال ارسال Answer هستند تا ارسال کاندیداهای موازی با آن‌ها تداخل نکند
const activeAnswerSubmissionSessions = new Set<string>();
const pendingCandidateTimers = new Map<string, ReturnType<typeof setTimeout>>();

export async function submitSignalingAnswer(params: {
  sessionId: string;
  answerSdp: string;
  peerCandidates: RTCIceCandidateInit[];
}): Promise<void> {
  if (!isValidSignalingSessionId(params.sessionId)) {
    throw new Error('شناسه نشست نامعتبر است.');
  }

  const uid = await ensureSignalingAuth();
  const sessionRef = doc(signalingDb, SIGNALING_COLLECTION, params.sessionId);
  activeAnswerSubmissionSessions.add(params.sessionId);

  try {
    await withFirestoreRetry(
      async () => {
        const snap = await getSignalingDocSnapshot(params.sessionId);
        if (!snap.exists()) {
          throw new Error('نشست دستگاه مقابل منقضی یا بسته شده است.');
        }
        const existing = snap.data() as WebRtcSignalingDocument;
        if (isSignalingDocExpired(existing)) {
          throw new Error('مهلت زمانی این نشست به پایان رسیده است.');
        }
        if (existing.peerUid && existing.peerUid !== uid) {
          throw new Error('مالکیت این نشست متعلق به این دستگاه نیست.');
        }
        // اگر در تلاش قبلی پاسخ همین دستگاه ثبت شده اما تایید شبکه قطع شده بود، موفقیت‌آمیز تلقی می‌شود
        if (
          existing.status === 'answer-ready' &&
          existing.peerUid === uid &&
          Boolean(existing.answerSdp)
        ) {
          return;
        }
        if (
          existing.status === 'closed' ||
          existing.status === 'expired' ||
          existing.status === 'connected' ||
          (Boolean(existing.answerSdp) && existing.peerUid !== uid)
        ) {
          throw new Error('این نشست قبلاً پاسخ داده شده یا بسته شده است.');
        }

        const payloadWithAuth: Record<string, unknown> = {
          peerUid: uid,
          status: 'answer-ready',
          answerType: 'answer',
          answerSdp: params.answerSdp.slice(0, 24000),
          peerCandidatesJson: JSON.stringify(params.peerCandidates || []).slice(0, 32000),
          updatedAtMs: Math.max(Date.now(), (existing.createdAtMs || 0) + 1),
        };
        assertSignalingOnlyPayload(payloadWithAuth);
        await updateDoc(sessionRef, payloadWithAuth);
      },
      4,
      450
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('منقضی') ||
        error.message.includes('قبلاً پاسخ') ||
        error.message.includes('مالکیت این نشست'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, params.sessionId);
  } finally {
    activeAnswerSubmissionSessions.delete(params.sessionId);
  }
}

/**
 * رد صریح درخواست اتصال توسط گوشی:
 * نشست را بلافاصله به وضعیت closed تغییر داده و سند موقت را حذف می‌کند تا لپ‌تاپ فوراً مطلع و متوقف شود.
 */
export async function rejectSignalingSession(sessionId: string): Promise<void> {
  if (!isValidSignalingSessionId(sessionId)) {
    return;
  }
  const uid = await ensureSignalingAuth();
  const closePayload: Record<string, unknown> = {
    peerUid: uid,
    status: 'closed',
    updatedAtMs: Date.now(),
  };
  assertSignalingOnlyPayload(closePayload);

  try {
    await updateDoc(doc(signalingDb, SIGNALING_COLLECTION, sessionId), closePayload);
  } catch {
    // اگر قبلاً بسته یا حذف شده باشد، ادامه می‌دهیم تا حذف نهایی انجام شود
  }
  await cleanupSignalingSession(sessionId);
}

export async function updateSignalingCandidates(params: {
  sessionId: string;
  isHost: boolean;
  candidates: RTCIceCandidateInit[];
}): Promise<void> {
  if (!isValidSignalingSessionId(params.sessionId)) return;

  const timerKey = `${params.sessionId}_${params.isHost ? 'host' : 'peer'}`;
  const existingTimer = pendingCandidateTimers.get(timerKey);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  return new Promise((resolve) => {
    const timer = setTimeout(async () => {
      pendingCandidateTimers.delete(timerKey);
      // اگر در همین لحظه submitSignalingAnswer در حال اجراست، کمی صبر می‌کنیم تا تداخل رخ ندهد
      if (activeAnswerSubmissionSessions.has(params.sessionId)) {
        await new Promise((r) => setTimeout(r, 600));
      }
      await ensureSignalingAuth();
      const jsonStr = JSON.stringify(params.candidates || []).slice(0, 32000);
      const updatePayload = params.isHost
        ? { hostCandidatesJson: jsonStr, updatedAtMs: Date.now() }
        : { peerCandidatesJson: jsonStr, updatedAtMs: Date.now() };

      assertSignalingOnlyPayload(updatePayload);
      try {
        await updateDoc(doc(signalingDb, SIGNALING_COLLECTION, params.sessionId), updatePayload);
      } catch {
        // اگر جلسه پس از برقراری ارتباط پاک شده باشد، خطای به‌روزرسانی کاندیدا نادیده گرفته می‌شود
      }
      resolve();
    }, 550);
    pendingCandidateTimers.set(timerKey, timer);
  });
}

export function subscribeToSignalingSession(
  sessionId: string,
  onUpdate: (docData: WebRtcSignalingDocument | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  let isDisposed = false;
  let lastDeliveredUpdatedAtMs = -1;
  let lastDeliveredStatus = '';
  let lastDeliveredHasAnswer = false;

  const deliverIfChanged = (data: WebRtcSignalingDocument | null) => {
    if (isDisposed) return;
    if (!data) {
      if (lastDeliveredStatus !== '__NULL__') {
        lastDeliveredStatus = '__NULL__';
        lastDeliveredHasAnswer = false;
        onUpdate(null);
      }
      return;
    }
    if (isSignalingDocExpired(data)) {
      void cleanupSignalingSession(sessionId);
      if (lastDeliveredStatus !== '__NULL__') {
        lastDeliveredStatus = '__NULL__';
        lastDeliveredHasAnswer = false;
        onUpdate(null);
      }
      return;
    }
    const hasAnswer = Boolean(data.answerSdp);
    if (
      data.updatedAtMs !== lastDeliveredUpdatedAtMs ||
      data.status !== lastDeliveredStatus ||
      hasAnswer !== lastDeliveredHasAnswer
    ) {
      lastDeliveredUpdatedAtMs = data.updatedAtMs;
      lastDeliveredStatus = data.status;
      lastDeliveredHasAnswer = hasAnswer;
      onUpdate(data);
    }
  };

  const unsubscribeSnapshot = onSnapshot(
    doc(signalingDb, SIGNALING_COLLECTION, sessionId),
    (snapshot) => {
      if (!snapshot.exists()) {
        deliverIfChanged(null);
        return;
      }
      const data = snapshot.data() as WebRtcSignalingDocument;
      deliverIfChanged(data);
    },
    (error) => {
      // اگر خطای موقت شبکه در لیسنر رخ داد، بلافاصله اتصال را قطع نمی‌کنیم چون حلقه Polling فعال است
      if (isTransientFirestoreNetworkError(error)) {
        return;
      }
      try {
        handleFirestoreError(error, OperationType.GET, sessionId);
      } catch (formattedErr) {
        if (onError && formattedErr instanceof Error) {
          onError(formattedErr);
        }
      }
    }
  );

  // حلقه کمکی Polling هر ۲ ثانیه برای اطمینان از دریافت سریع SDP Answer حتی در صورت کندی کانال Listen در موبایل
  const pollIntervalId = setInterval(async () => {
    if (isDisposed) return;
    try {
      const snap = await getSignalingDocSnapshot(sessionId);
      if (isDisposed) return;
      if (!snap.exists()) {
        deliverIfChanged(null);
        return;
      }
      deliverIfChanged(snap.data() as WebRtcSignalingDocument);
    } catch {
      // خطاهای موقت Polling نادیده گرفته می‌شوند
    }
  }, 2000);

  return () => {
    isDisposed = true;
    clearInterval(pollIntervalId);
    unsubscribeSnapshot();
  };
}

/**
 * حذف فوری و کامل سند موقت Signaling از Firestore پس از برقراری اتصال WebRTC، خطا، تایم‌اوت، رد اتصال یا پایان جلسه
 */
export async function cleanupSignalingSession(sessionId: string): Promise<boolean> {
  if (!sessionId) return false;
  for (const key of [`${sessionId}_host`, `${sessionId}_peer`]) {
    const t = pendingCandidateTimers.get(key);
    if (t) {
      clearTimeout(t);
      pendingCandidateTimers.delete(key);
    }
  }
  try {
    await deleteDoc(doc(signalingDb, SIGNALING_COLLECTION, sessionId));
    return true;
  } catch {
    return false;
  }
}
