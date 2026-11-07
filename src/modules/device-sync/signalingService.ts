import { getApps, initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  setDoc,
  Unsubscribe,
  updateDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';
import { isValidSignalingSessionId, maskSessionIdForDisplay } from './pairingService';
import { DeviceSyncRole } from './types';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const signalingDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const signalingAuth = getAuth(app);

export const SIGNALING_COLLECTION = 'webrtc_signaling_sessions';
export const SESSION_TTL_MS = 10 * 60 * 1000; // ۱۰ دقیقه اعتبار موقت و یک‌بارمصرف جلسه

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
 * احراز هویت ناشناس الزامی (بدون هیچ مسیر بازگشتی غیرمعتبر):
 * اگر احراز هویت برقرار نشود، پیام خطای روشن پرتاب شده و اتصال متوقف می‌شود.
 */
export async function ensureSignalingAuth(): Promise<string> {
  try {
    if (signalingAuth.currentUser?.uid) {
      return signalingAuth.currentUser.uid;
    }
    const cred = await signInAnonymously(signalingAuth);
    const uid = cred.user?.uid;
    if (!uid) {
      throw new Error('شناسه کاربری ناشناس (UID) از سرویس احراز هویت دریافت نشد.');
    }
    return uid;
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `احراز هویت ناشناس (Anonymous Auth) برقرار نشد و اتصال متوقف گردید. لطفاً فعال بودن Anonymous Authentication در کنسول Firebase و اتصال شبکه را بررسی کنید. (${rawMsg})`
    );
  }
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
  const docWithAuth: WebRtcSignalingDocument = {
    sessionId: params.sessionId,
    pairingCodeDigest: params.pairingCodeDigest.slice(0, 128),
    hostDeviceRole: params.hostDeviceRole,
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
    await setDoc(doc(signalingDb, SIGNALING_COLLECTION, params.sessionId), docWithAuth);
    return docWithAuth;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, params.sessionId);
  }
}

export async function fetchSignalingSession(
  sessionId: string
): Promise<WebRtcSignalingDocument | null> {
  if (!isValidSignalingSessionId(sessionId)) {
    throw new Error('شناسه نشست اسکن‌شده نامعتبر است.');
  }

  await ensureSignalingAuth();
  try {
    const snap = await getDoc(doc(signalingDb, SIGNALING_COLLECTION, sessionId));
    if (!snap.exists()) {
      return null;
    }
    const data = snap.data() as WebRtcSignalingDocument;
    if (Date.now() > data.expiresAtMs) {
      await cleanupSignalingSession(sessionId);
      return null;
    }
    if (
      data.status === 'connected' ||
      data.status === 'closed' ||
      data.status === 'expired' ||
      Boolean(data.answerSdp)
    ) {
      throw new Error(
        'این QR Code و نشست جفت‌سازی یک‌بارمصرف بوده و قبلاً استفاده یا بسته شده است. لطفاً در لپ‌تاپ QR جدیدی تولید کنید.'
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

export async function submitSignalingAnswer(params: {
  sessionId: string;
  answerSdp: string;
  peerCandidates: RTCIceCandidateInit[];
}): Promise<void> {
  if (!isValidSignalingSessionId(params.sessionId)) {
    throw new Error('شناسه نشست نامعتبر است.');
  }

  const uid = await ensureSignalingAuth();
  const payloadWithAuth: Record<string, unknown> = {
    peerUid: uid,
    status: 'answer-ready',
    answerType: 'answer',
    answerSdp: params.answerSdp.slice(0, 24000),
    peerCandidatesJson: JSON.stringify(params.peerCandidates || []).slice(0, 32000),
    updatedAtMs: Date.now(),
  };

  assertSignalingOnlyPayload(payloadWithAuth);

  try {
    await updateDoc(doc(signalingDb, SIGNALING_COLLECTION, params.sessionId), payloadWithAuth);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, params.sessionId);
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
}

export function subscribeToSignalingSession(
  sessionId: string,
  onUpdate: (docData: WebRtcSignalingDocument | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(signalingDb, SIGNALING_COLLECTION, sessionId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onUpdate(null);
        return;
      }
      const data = snapshot.data() as WebRtcSignalingDocument;
      if (Date.now() > data.expiresAtMs) {
        void cleanupSignalingSession(sessionId);
        onUpdate(null);
        return;
      }
      onUpdate(data);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, sessionId);
      } catch (formattedErr) {
        if (onError && formattedErr instanceof Error) {
          onError(formattedErr);
        }
      }
    }
  );
}

/**
 * حذف فوری و کامل سند موقت Signaling از Firestore پس از برقراری اتصال WebRTC، خطا، تایم‌اوت، رد اتصال یا پایان جلسه
 */
export async function cleanupSignalingSession(sessionId: string): Promise<boolean> {
  if (!sessionId) return false;
  try {
    await deleteDoc(doc(signalingDb, SIGNALING_COLLECTION, sessionId));
    return true;
  } catch {
    return false;
  }
}
