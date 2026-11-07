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
import { maskSessionIdForDisplay } from './pairingService';
import { DeviceSyncRole } from './types';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const signalingDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const signalingAuth = getAuth(app);

export const SIGNALING_COLLECTION = 'webrtc_signaling_sessions';
export const SESSION_TTL_MS = 10 * 60 * 1000; // ۱۰ دقیقه اعتبار موقت جلسه جفت‌سازی

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
 * ثبت خطای ساختاریافته بدون افشای کد جفت‌سازی، ایمیل یا اطلاعات محرمانه کاربر در لاگ‌ها
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
  throw new Error(JSON.stringify(errInfo));
}

export interface WebRtcSignalingDocument {
  sessionId: string;
  pairingCodeDigest: string;
  hostDeviceRole: DeviceSyncRole;
  hostUid?: string;
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
 * احراز هویت ناشناس برای قفل کردن مالکیت نشست (hostUid / peerUid) در صورت فعال بودن در کنسول Firebase
 */
export async function ensureSignalingAuth(): Promise<string | null> {
  try {
    if (signalingAuth.currentUser?.uid) {
      return signalingAuth.currentUser.uid;
    }
    const cred = await signInAnonymously(signalingAuth);
    return cred.user?.uid || null;
  } catch {
    // اگر Anonymous Auth هنوز در کنسول Firebase توسط مالک پروژه فعال نشده باشد، بدون خطا ادامه می‌دهد
    return signalingAuth.currentUser?.uid || null;
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

function isPermissionDeniedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('permission-denied') || msg.includes('PERMISSION_DENIED');
}

export async function createSignalingOfferSession(params: {
  sessionId: string;
  pairingCodeDigest: string;
  hostDeviceRole: DeviceSyncRole;
  offerSdp: string;
  hostCandidates: RTCIceCandidateInit[];
}): Promise<WebRtcSignalingDocument> {
  const uid = await ensureSignalingAuth();
  const now = Date.now();
  const baseDoc: WebRtcSignalingDocument = {
    sessionId: params.sessionId.slice(0, 64),
    pairingCodeDigest: params.pairingCodeDigest.slice(0, 128),
    hostDeviceRole: params.hostDeviceRole,
    status: 'offer-ready',
    offerType: 'offer',
    offerSdp: params.offerSdp.slice(0, 24000),
    hostCandidatesJson: JSON.stringify(params.hostCandidates || []).slice(0, 32000),
    peerCandidatesJson: '[]',
    createdAtMs: now,
    expiresAtMs: now + SESSION_TTL_MS,
    updatedAtMs: now,
  };

  const docWithAuth: WebRtcSignalingDocument = uid ? { ...baseDoc, hostUid: uid } : baseDoc;
  assertSignalingOnlyPayload(docWithAuth as unknown as Record<string, unknown>);

  try {
    await setDoc(doc(signalingDb, SIGNALING_COLLECTION, params.sessionId), docWithAuth);
    return docWithAuth;
  } catch (error) {
    // سازگاری با قواعد قبلی مستقر در ابر تا زمان تأیید انتشار قواعد جدید توسط مالک پروژه
    if (uid && isPermissionDeniedError(error)) {
      try {
        assertSignalingOnlyPayload(baseDoc as unknown as Record<string, unknown>);
        await setDoc(doc(signalingDb, SIGNALING_COLLECTION, params.sessionId), baseDoc);
        return baseDoc;
      } catch (retryErr) {
        handleFirestoreError(retryErr, OperationType.CREATE, params.sessionId);
      }
    }
    handleFirestoreError(error, OperationType.CREATE, params.sessionId);
  }
}

export async function fetchSignalingSession(
  sessionId: string
): Promise<WebRtcSignalingDocument | null> {
  await ensureSignalingAuth();
  try {
    const snap = await getDoc(doc(signalingDb, SIGNALING_COLLECTION, sessionId));
    if (!snap.exists()) {
      return null;
    }
    const data = snap.data() as WebRtcSignalingDocument;
    if (Date.now() > data.expiresAtMs) {
      // پاک‌سازی خودکار جلسه منقضی‌شده هنگام برخورد با آن
      await cleanupSignalingSession(sessionId);
      return null;
    }
    // جلوگیری از استفاده مجدد غیرمجاز از نشست قبلاً مصرف‌شده یا بسته‌شده
    if (
      data.status === 'connected' ||
      data.status === 'closed' ||
      data.status === 'expired' ||
      Boolean(data.answerSdp)
    ) {
      throw new Error('این نشست جفت‌سازی قبلاً استفاده یا بسته شده است. لطفاً کد جدیدی تولید کنید.');
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
  const uid = await ensureSignalingAuth();
  const basePayload: Record<string, unknown> = {
    status: 'answer-ready',
    answerType: 'answer',
    answerSdp: params.answerSdp.slice(0, 24000),
    peerCandidatesJson: JSON.stringify(params.peerCandidates || []).slice(0, 32000),
    updatedAtMs: Date.now(),
  };

  const payloadWithAuth = uid ? { ...basePayload, peerUid: uid } : basePayload;
  assertSignalingOnlyPayload(payloadWithAuth);

  try {
    await updateDoc(doc(signalingDb, SIGNALING_COLLECTION, params.sessionId), payloadWithAuth);
  } catch (error) {
    if (uid && isPermissionDeniedError(error)) {
      try {
        assertSignalingOnlyPayload(basePayload);
        await updateDoc(doc(signalingDb, SIGNALING_COLLECTION, params.sessionId), basePayload);
        return;
      } catch (retryErr) {
        handleFirestoreError(retryErr, OperationType.UPDATE, params.sessionId);
      }
    }
    handleFirestoreError(error, OperationType.UPDATE, params.sessionId);
  }
}

export async function updateSignalingCandidates(params: {
  sessionId: string;
  isHost: boolean;
  candidates: RTCIceCandidateInit[];
}): Promise<void> {
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
 * حذف فوری و کامل سند موقت Signaling از Firestore پس از برقراری اتصال WebRTC، خطا، تایم‌اوت یا پایان جلسه
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
