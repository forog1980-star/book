import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
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
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: signalingAuth.currentUser?.uid,
      email: signalingAuth.currentUser?.email,
      emailVerified: signalingAuth.currentUser?.emailVerified,
      isAnonymous: signalingAuth.currentUser?.isAnonymous,
      tenantId: signalingAuth.currentUser?.tenantId,
      providerInfo:
        signalingAuth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface WebRtcSignalingDocument {
  sessionId: string;
  pairingCodeDigest: string;
  hostDeviceRole: DeviceSyncRole;
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

export async function testSignalingConnection(): Promise<boolean> {
  const testPath = `${SIGNALING_COLLECTION}/CONN_PROBE_SESSION_0001`;
  try {
    await getDocFromServer(doc(signalingDb, SIGNALING_COLLECTION, 'CONN_PROBE_SESSION_0001'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    return true;
  }
}

// اجرای تست اتصال اولیه طبق الزامات مهارت Firebase
void testSignalingConnection();

export async function createSignalingOfferSession(params: {
  sessionId: string;
  pairingCodeDigest: string;
  hostDeviceRole: DeviceSyncRole;
  offerSdp: string;
  hostCandidates: RTCIceCandidateInit[];
}): Promise<WebRtcSignalingDocument> {
  const now = Date.now();
  const sessionDoc: WebRtcSignalingDocument = {
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

  assertSignalingOnlyPayload(sessionDoc as unknown as Record<string, unknown>);
  const path = `${SIGNALING_COLLECTION}/${params.sessionId}`;

  try {
    await setDoc(doc(signalingDb, SIGNALING_COLLECTION, params.sessionId), sessionDoc);
    return sessionDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function fetchSignalingSession(
  sessionId: string
): Promise<WebRtcSignalingDocument | null> {
  const path = `${SIGNALING_COLLECTION}/${sessionId}`;
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
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function submitSignalingAnswer(params: {
  sessionId: string;
  answerSdp: string;
  peerCandidates: RTCIceCandidateInit[];
}): Promise<void> {
  const path = `${SIGNALING_COLLECTION}/${params.sessionId}`;
  const updatePayload = {
    status: 'answer-ready',
    answerType: 'answer',
    answerSdp: params.answerSdp.slice(0, 24000),
    peerCandidatesJson: JSON.stringify(params.peerCandidates || []).slice(0, 32000),
    updatedAtMs: Date.now(),
  };

  assertSignalingOnlyPayload(updatePayload);
  try {
    await updateDoc(doc(signalingDb, SIGNALING_COLLECTION, params.sessionId), updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateSignalingCandidates(params: {
  sessionId: string;
  isHost: boolean;
  candidates: RTCIceCandidateInit[];
}): Promise<void> {
  const path = `${SIGNALING_COLLECTION}/${params.sessionId}`;
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
  const path = `${SIGNALING_COLLECTION}/${sessionId}`;
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
        handleFirestoreError(error, OperationType.GET, path);
      } catch (formattedErr) {
        if (onError && formattedErr instanceof Error) {
          onError(formattedErr);
        }
      }
    }
  );
}

/**
 * حذف فوری و کامل سند موقت Signaling از Firestore پس از برقراری اتصال WebRTC یا پایان جلسه
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
