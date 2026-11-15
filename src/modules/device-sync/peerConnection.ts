import {
  buildLaptopSessionQrValue,
  createLaptopInitiatedSessionCredentials,
  derivePairingDigest,
  generateRandomSessionId,
  isValidSignalingSessionId,
  LaptopInitiatedSessionCredentials,
  maskSessionIdForDisplay,
  normalizePairingCode,
  parseLaptopSessionQrValue,
} from './pairingService';
import {
  claimAndInspectSignalingSession,
  cleanupSignalingSession,
  createSignalingOfferSession,
  fetchSignalingSession,
  isSignalingDocExpired,
  rejectSignalingSession,
  submitSignalingAnswer,
  subscribeToSignalingSession,
  updateSignalingCandidates,
  WebRtcSignalingDocument,
} from './signalingService';
import {
  assembleAndVerifyTransferBuffer,
  buildTransferWireFrames,
  CHUNK_SIZE_CHARS,
  IncomingTransferBuffer,
  validateTransferStartFrame,
  WireMessage,
} from './transferProtocol';
import {
  ConnectionUiStatus,
  DeviceSyncRole,
  SUPPORTED_SYNC_PROTOCOL_VERSION,
  SyncTransferPackage,
} from './types';

// فقط سرورهای STUN برای کشف آدرس شبکه؛ استفاده از TURN Relay به‌طور پیش‌فرض ممنوع است
const DIRECT_STUN_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

const MAX_BUFFERED_AMOUNT_BYTES = 256 * 1024; // سقف بافر ۲۵۶ کیلوبایت برای کنترل جریان (Backpressure)
const INITIAL_ICE_GATHER_WAIT_MS = 1800; // فرصت کافی اولیه برای جمع‌آوری کاندیداهای شبکه پیش از ثبت SDP جهت جلوگیری از ترافیک Trickle ICE

export interface PendingPhoneApprovalRequest {
  sessionId: string;
  pairingCode: string;
  laptopDeviceId: string;
  hostDeviceRole: DeviceSyncRole;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface PeerConnectionCallbacks {
  onStatusChange: (status: ConnectionUiStatus, detailMessage?: string) => void;
  onPhoneApprovalRequired?: (request: PendingPhoneApprovalRequest) => void;
  getLocalPreSyncCounts?: () => { auditCount: number; totalCount: number };
  onPeerHandshake?: (
    peerDeviceId: string,
    peerRole: DeviceSyncRole,
    peerPreCounts?: { auditCount: number; totalCount: number }
  ) => void;
  onChannelReadyForAutoSync?: (peerDeviceId: string, peerRole: DeviceSyncRole) => void;
  onTransferProgress?: (packageId: string, receivedChunks: number, totalChunks: number) => void;
  onPackageReceived: (pkg: SyncTransferPackage) => void;
  onPackageAckReceived?: (ack: Extract<WireMessage, { type: 'TRANSFER_ACK' }>) => void;
  onTransferInterrupted: (packageId: string, reason: string) => void;
  onSignalCleanedUp?: (sessionId: string) => void;
}

function waitForInitialIceGathering(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
  if (pc.iceGatheringState === 'complete') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (typeof pc.removeEventListener === 'function') {
        pc.removeEventListener('icegatheringstatechange', onStateChange);
      }
      resolve();
    };
    const onStateChange = () => {
      if (pc.iceGatheringState === 'complete') {
        finish();
      }
    };
    const timer = setTimeout(finish, timeoutMs);
    if (typeof pc.addEventListener === 'function') {
      pc.addEventListener('icegatheringstatechange', onStateChange);
    } else {
      finish();
    }
  });
}

export class DirectWebRtcSessionManager {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private unsubscribeSignaling: (() => void) | null = null;
  private activeSessionId = '';
  private signalingDocCleaned = false;
  private localDeviceId: string;
  private localRole: DeviceSyncRole;
  private callbacks: PeerConnectionCallbacks;
  private incomingBuffers = new Map<string, IncomingTransferBuffer>();
  private pendingUnackedSentPackageIds = new Set<string>();
  private ackSentForReceivedPackageIds = new Set<string>();
  private appliedRemoteAnswer = false;
  private autoSyncTriggeredForSession = false;
  private addedRemoteCandidateKeys = new Set<string>();
  private connectionTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private connectionTimeoutMs: number;
  private heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
  private disconnectedGraceTimerId: ReturnType<typeof setTimeout> | null = null;
  private delayedSignalingCleanupTimerId: ReturnType<typeof setTimeout> | null = null;
  private lastPeerActivityMs = 0;
  private heartbeatSentCount = 0;
  private heartbeatReceivedCount = 0;
  private wakeLockSentinel: { release: () => Promise<void> } | null = null;
  private pendingPhoneApproval: {
    mode: 'peer-side' | 'host-side';
    request: PendingPhoneApprovalRequest;
    sessionDoc: WebRtcSignalingDocument;
  } | null = null;
  private readonly boundWindowUnloadHandler: () => void;
  private readonly boundVisibilityChangeHandler: () => void;

  constructor(
    localDeviceId: string,
    localRole: DeviceSyncRole,
    callbacks: PeerConnectionCallbacks,
    connectionTimeoutMs = 90000
  ) {
    this.localDeviceId = localDeviceId;
    this.localRole = localRole;
    this.callbacks = callbacks;
    this.connectionTimeoutMs = connectionTimeoutMs;

    this.boundWindowUnloadHandler = () => {
      this.closeConnection(false);
    };

    this.boundVisibilityChangeHandler = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        if (this.isConnected() || this.activeSessionId) {
          void this.acquireWakeLock();
          if (this.isConnected()) {
            this.sendWireMessage({
              type: 'PING_HEARTBEAT',
              timestampMs: Date.now(),
            });
          }
        }
      }
    };

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('beforeunload', this.boundWindowUnloadHandler);
      window.addEventListener('pagehide', this.boundWindowUnloadHandler);
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', this.boundVisibilityChangeHandler);
    }
  }

  public setLocalRole(role: DeviceSyncRole): void {
    this.localRole = role;
  }

  public isConnected(): boolean {
    return Boolean(this.dataChannel && this.dataChannel.readyState === 'open');
  }

  public getActiveSessionId(): string {
    return this.activeSessionId;
  }

  public getLastPeerActivityMs(): number {
    return this.lastPeerActivityMs;
  }

  public getHeartbeatStats(): { sent: number; received: number; lastPeerActivityMs: number } {
    return {
      sent: this.heartbeatSentCount,
      received: this.heartbeatReceivedCount,
      lastPeerActivityMs: this.lastPeerActivityMs,
    };
  }

  public getPendingPhoneApproval(): PendingPhoneApprovalRequest | null {
    return this.pendingPhoneApproval ? this.pendingPhoneApproval.request : null;
  }

  /**
   * آزادسازی کامل لیسنرهای پنجره هنگام Unmount شدن کامپوننت
   */
  public dispose(): void {
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('beforeunload', this.boundWindowUnloadHandler);
      window.removeEventListener('pagehide', this.boundWindowUnloadHandler);
    }
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', this.boundVisibilityChangeHandler);
    }
    this.closeConnection(false);
  }

  /**
   * انصراف دستی کاربر از فرآیند جفت‌سازی و پاک‌سازی فوری نشست موقت
   */
  public async cancelPairing(): Promise<void> {
    this.pendingPhoneApproval = null;
    await this.cleanupSignalingAndLocalResources(
      'ready',
      'فرآیند جفت‌سازی توسط کاربر لغو شد و نشست موقت پاک‌سازی گردید.'
    );
  }

  /**
   * آغاز نشست در نقش Host (قابل اجرا از هر دو سمت: لپ‌تاپ یا گوشی):
   * ایجاد نشست موقت و امن با sessionId تصادفی (۱۹۲ بیت CSPRNG و مستقل از کد تأیید) و تولید QR Code یک‌بارمصرف
   */
  public async startLaptopInitiatorSession(): Promise<LaptopInitiatedSessionCredentials> {
    const creds = createLaptopInitiatedSessionCredentials(this.localDeviceId);
    await this.startHostSession(creds.pairingCode, creds.sessionId);
    return creds;
  }

  /**
   * شروع نشست میزبان (Host) با شناسه نشست تصادفی مستقل از کد تأیید
   */
  public async startHostSession(
    pairingCode: string,
    explicitRandomSessionId?: string
  ): Promise<{ sessionId: string; qrValue: string }> {
    this.closeConnection(false);

    const normalizedCode = normalizePairingCode(pairingCode);
    if (!normalizedCode) {
      this.callbacks.onStatusChange(
        'connection-error',
        'کد تأیید نشست نامعتبر است. کد باید ۱۲ کاراکتر از الفبای مجاز باشد.'
      );
      throw new Error('کد تأیید نشست نامعتبر است.');
    }

    const sessionId =
      explicitRandomSessionId && isValidSignalingSessionId(explicitRandomSessionId)
        ? explicitRandomSessionId
        : generateRandomSessionId();
    const pairingCodeDigest = derivePairingDigest(normalizedCode);
    const qrValue = buildLaptopSessionQrValue({
      sessionId,
      pairingCode: normalizedCode,
      laptopDeviceId: this.localDeviceId,
    });

    this.activeSessionId = sessionId;
    this.signalingDocCleaned = false;
    this.autoSyncTriggeredForSession = false;
    this.pendingPhoneApproval = null;

    this.callbacks.onStatusChange(
      'pairing',
      `نشست امن (${maskSessionIdForDisplay(sessionId)}) ایجاد شد. لطفاً QR Code را در دستگاه مقابل اسکن کنید...`
    );

    let isOfferSessionCreated = false;
    try {
      const pc = new RTCPeerConnection({
        iceServers: DIRECT_STUN_ICE_SERVERS,
      });
      this.pc = pc;

      const localCandidates: RTCIceCandidateInit[] = [];

      const dc = pc.createDataChannel('markaz_asnad_direct_p2p', {
        ordered: true,
      });
      this.setupDataChannel(dc);

      pc.onicecandidate = (event) => {
        if (event.candidate && !this.signalingDocCleaned && this.activeSessionId === sessionId) {
          localCandidates.push(event.candidate.toJSON());
          // کاندیداهای دیررس (Trickle ICE) تنها پس از ثبت اولیه سند در سرور ارسال می‌شوند
          if (isOfferSessionCreated) {
            void updateSignalingCandidates({
              sessionId,
              isHost: true,
              candidates: localCandidates,
            });
          }
        }
      };

      this.setupPeerConnectionStateHandlers(pc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForInitialIceGathering(pc, INITIAL_ICE_GATHER_WAIT_MS);

      await createSignalingOfferSession({
        sessionId,
        pairingCodeDigest,
        hostDeviceRole: this.localRole,
        offerSdp: pc.localDescription?.sdp || offer.sdp || '',
        hostCandidates: localCandidates,
      });
      isOfferSessionCreated = true;

      this.unsubscribeSignaling = subscribeToSignalingSession(
        sessionId,
        async (docData) => {
          if (!this.pc) return;

          // اگر دستگاه مقابل صراحتاً نشست را بسته یا منقضی کرده باشد (قبل از برقراری ارتباط)
          if (
            docData &&
            (docData.status === 'closed' || docData.status === 'expired') &&
            !this.appliedRemoteAnswer &&
            !this.isConnected()
          ) {
            this.signalingDocCleaned = true;
            await this.cleanupSignalingAndLocalResources(
              'disconnected',
              'درخواست اتصال رد شد یا نشست موقت منقضی گردید و اتصال بلافاصله بسته شد.'
            );
            return;
          }

          if (!docData) return;

          if (docData.status === 'waiting-for-peer' && !docData.answerSdp && !this.appliedRemoteAnswer) {
            this.callbacks.onStatusChange(
              'connecting',
              'QR Code اسکن شد؛ در حال برقراری مستقیم اتصال WebRTC و آغاز همگام‌سازی خودکار...'
            );
          }

          if (docData.answerSdp && !this.appliedRemoteAnswer) {
            // طبق بخش ۲ دستور اجرایی (ساده‌سازی فرایند اتصال):
            // QR Code مجوز عملی اتصال بین دو دستگاه کاربر است و به محض دریافت پاسخ، اتصال و همگام‌سازی خودکار بدون توقف اضافی برقرار می‌شود.
            await this.applyHostRemoteAnswerAndCandidates(docData);
          } else if (docData.peerCandidatesJson && this.pc && this.pc.remoteDescription) {
            await this.addPeerCandidatesFromDoc(docData);
          }
        },
        (err) => {
          if (this.isConnected() || this.appliedRemoteAnswer || this.signalingDocCleaned) {
            return;
          }
          void this.cleanupSignalingAndLocalResources(
            'connection-error',
            `خطا در هماهنگی اولیه اتصال: ${err.message}`
          );
        }
      );

      this.armDirectConnectionTimeout();
      return { sessionId, qrValue };
    } catch (err) {
      if (!isOfferSessionCreated) {
        this.signalingDocCleaned = true;
      }
      const msg = err instanceof Error ? err.message : String(err);
      await this.cleanupSignalingAndLocalResources(
        'connection-error',
        `شکست در راه‌اندازی نشست Signaling: ${msg}`
      );
      throw err;
    }
  }

  private async applyHostRemoteAnswerAndCandidates(
    docData: WebRtcSignalingDocument
  ): Promise<void> {
    if (!this.pc || !docData.answerSdp || this.appliedRemoteAnswer) return;
    this.appliedRemoteAnswer = true;
    this.callbacks.onStatusChange(
      'connecting',
      'تأیید اتصال دریافت شد؛ در حال برقراری کانال مستقیم WebRTC و شروع همگام‌سازی دوطرفه...'
    );
    try {
      await this.pc.setRemoteDescription(
        new RTCSessionDescription({
          type: 'answer',
          sdp: docData.answerSdp,
        })
      );
      await this.addPeerCandidatesFromDoc(docData);
    } catch {
      await this.cleanupSignalingAndLocalResources(
        'connection-error',
        'خطا در اعمال پاسخ شبکه (SDP Answer) دستگاه مقابل؛ نشست موقت پاک‌سازی شد.'
      );
    }
  }

  private async addPeerCandidatesFromDoc(docData: WebRtcSignalingDocument): Promise<void> {
    if (!docData.peerCandidatesJson || !this.pc || !this.pc.remoteDescription) return;
    try {
      const peerCands = JSON.parse(docData.peerCandidatesJson) as RTCIceCandidateInit[];
      for (const c of peerCands) {
        const key = `${c.candidate}_${c.sdpMid}_${c.sdpMLineIndex}`;
        if (!this.addedRemoteCandidateKeys.has(key)) {
          this.addedRemoteCandidateKeys.add(key);
          await this.pc.addIceCandidate(new RTCIceCandidate(c));
        }
      }
    } catch {
      // ignore malformed candidate entry
    }
  }

  /**
   * اسکن QR Code در دستگاه دوم (Peer - چه گوشی و چه لپ‌تاپ):
   * اعتبارسنجی فنی QR، قفل اتمیک peerUid با تراکنش Firestore (جلوگیری از تصاحب نشست توسط دستگاه ثالث)،
   * و برقراری بی‌درنگ کانال مستقیم WebRTC جهت آغاز خودکار همگام‌سازی بدون توقف برای تأیید انسانی جداگانه.
   */
  public async inspectLaptopQrOnPhone(
    rawScannedQrValue: string
  ): Promise<PendingPhoneApprovalRequest> {
    this.closeConnection(false);
    this.pendingPhoneApproval = null;

    const parsed = parseLaptopSessionQrValue(rawScannedQrValue);
    if (!parsed) {
      const errMsg =
        'فرمت QR Code اسکن‌شده معتبر نیست. لطفاً QR Code نمایش‌داده‌شده در دستگاه مقابل را اسکن کنید.';
      this.callbacks.onStatusChange('connection-error', errMsg);
      throw new Error(errMsg);
    }

    const { sessionId, pairingCode, laptopDeviceId } = parsed;
    const expectedDigest = derivePairingDigest(pairingCode);

    this.callbacks.onStatusChange(
      'pairing',
      `در حال بررسی فنی و قفل اتمیک نشست (${maskSessionIdForDisplay(sessionId)})...`
    );

    try {
      const sessionDoc = await claimAndInspectSignalingSession(sessionId, expectedDigest);
      if (!sessionDoc || !sessionDoc.offerSdp) {
        const msg = 'نشست فعالی برای این QR Code یافت نشد یا مهلت اعتبار آن به پایان رسیده است.';
        this.callbacks.onStatusChange('connection-error', msg);
        throw new Error(msg);
      }

      if (isSignalingDocExpired(sessionDoc)) {
        await cleanupSignalingSession(sessionId);
        const msg = 'مهلت زمانی این QR Code به پایان رسیده است. لطفاً QR جدید تولید کنید.';
        this.callbacks.onStatusChange('connection-error', msg);
        throw new Error(msg);
      }

      const approvalRequest: PendingPhoneApprovalRequest = {
        sessionId,
        pairingCode,
        laptopDeviceId,
        hostDeviceRole: sessionDoc.hostDeviceRole,
        createdAtMs: sessionDoc.createdAtMs,
        expiresAtMs: sessionDoc.expiresAtMs,
      };

      await this.establishPeerAnswerConnection(approvalRequest, sessionDoc);
      return approvalRequest;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.callbacks.onStatusChange('connection-error', msg);
      throw err;
    }
  }

  /**
   * برقراری مستقیم اتصال WebRTC در سمت اسکن‌کننده QR (Peer) بلافاصله پس از قفل اتمیک نشست
   */
  private async establishPeerAnswerConnection(
    request: PendingPhoneApprovalRequest,
    lockedSessionDoc?: WebRtcSignalingDocument
  ): Promise<{ sessionId: string }> {
    const sessionId = request.sessionId;
    this.activeSessionId = sessionId;
    this.signalingDocCleaned = false;
    this.autoSyncTriggeredForSession = false;
    this.pendingPhoneApproval = null;

    this.callbacks.onStatusChange(
      'connecting',
      `نشست (${maskSessionIdForDisplay(sessionId)}) قفل شد؛ در حال برقراری کانال مستقیم WebRTC و شروع همگام‌سازی خودکار...`
    );

    try {
      const freshDoc = lockedSessionDoc?.offerSdp
        ? lockedSessionDoc
        : await fetchSignalingSession(sessionId);
      if (!freshDoc || !freshDoc.offerSdp) {
        throw new Error('نشست منقضی یا بسته شده است.');
      }

      if (isSignalingDocExpired(freshDoc)) {
        await cleanupSignalingSession(sessionId);
        throw new Error('مهلت زمانی این QR Code به پایان رسیده است. لطفاً QR جدید تولید کنید.');
      }

      const pc = new RTCPeerConnection({
        iceServers: DIRECT_STUN_ICE_SERVERS,
      });
      this.pc = pc;

      const peerCandidates: RTCIceCandidateInit[] = [];
      let isAnswerSubmitted = false;

      pc.ondatachannel = (event) => {
        this.setupDataChannel(event.channel);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && !this.signalingDocCleaned && this.activeSessionId === sessionId) {
          peerCandidates.push(event.candidate.toJSON());
          if (isAnswerSubmitted) {
            void updateSignalingCandidates({
              sessionId,
              isHost: false,
              candidates: peerCandidates,
            });
          }
        }
      };

      this.setupPeerConnectionStateHandlers(pc);

      await pc.setRemoteDescription(
        new RTCSessionDescription({
          type: 'offer',
          sdp: freshDoc.offerSdp,
        })
      );

      if (freshDoc.hostCandidatesJson) {
        try {
          const hostCands = JSON.parse(freshDoc.hostCandidatesJson) as RTCIceCandidateInit[];
          for (const c of hostCands) {
            const key = `${c.candidate}_${c.sdpMid}_${c.sdpMLineIndex}`;
            if (!this.addedRemoteCandidateKeys.has(key)) {
              this.addedRemoteCandidateKeys.add(key);
              await pc.addIceCandidate(new RTCIceCandidate(c));
            }
          }
        } catch {
          // ignore
        }
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForInitialIceGathering(pc, INITIAL_ICE_GATHER_WAIT_MS);

      await submitSignalingAnswer({
        sessionId,
        answerSdp: pc.localDescription?.sdp || answer.sdp || '',
        peerCandidates,
      });
      isAnswerSubmitted = true;

      this.unsubscribeSignaling = subscribeToSignalingSession(
        sessionId,
        async (updatedDoc) => {
          if (
            updatedDoc &&
            (updatedDoc.status === 'closed' || updatedDoc.status === 'expired') &&
            !this.isConnected()
          ) {
            this.signalingDocCleaned = true;
            await this.cleanupSignalingAndLocalResources(
              'disconnected',
              'نشست موقت بسته یا منقضی گردید.'
            );
            return;
          }
          if (!updatedDoc || !this.pc || !this.pc.remoteDescription) return;
          if (updatedDoc.hostCandidatesJson) {
            try {
              const hostCands = JSON.parse(updatedDoc.hostCandidatesJson) as RTCIceCandidateInit[];
              for (const c of hostCands) {
                const key = `${c.candidate}_${c.sdpMid}_${c.sdpMLineIndex}`;
                if (!this.addedRemoteCandidateKeys.has(key)) {
                  this.addedRemoteCandidateKeys.add(key);
                  await this.pc.addIceCandidate(new RTCIceCandidate(c));
                }
              }
            } catch {
              // ignore
            }
          }
        },
        (err) => {
          if (this.isConnected() || this.signalingDocCleaned) {
            return;
          }
          void this.cleanupSignalingAndLocalResources(
            'connection-error',
            `خطا در دریافت کاندیداهای شبکه: ${err.message}`
          );
        }
      );

      this.armDirectConnectionTimeout();
      return { sessionId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.cleanupSignalingAndLocalResources('connection-error', msg);
      throw err;
    }
  }

  /**
   * حفظ سازگاری با فراخوانی‌های قبلی:
   * از آنجا که اسکن QR بلافاصله اتصال را برقرار می‌کند، اگر نشست فعال وجود داشته باشد همان برگردانده می‌شود.
   */
  public async approvePendingSessionOnPhone(): Promise<{ sessionId: string }> {
    if (!this.pendingPhoneApproval) {
      if (this.activeSessionId) {
        return { sessionId: this.activeSessionId };
      }
      const msg = 'هیچ نشست فعالی برای اتصال وجود ندارد. ابتدا QR نشست را اسکن کنید.';
      this.callbacks.onStatusChange('connection-error', msg);
      throw new Error(msg);
    }

    const { mode, request, sessionDoc } = this.pendingPhoneApproval;
    this.pendingPhoneApproval = null;

    if (isSignalingDocExpired(sessionDoc)) {
      await cleanupSignalingSession(request.sessionId);
      const msg = 'مهلت زمانی این QR Code به پایان رسیده است. لطفاً QR جدید تولید کنید.';
      this.callbacks.onStatusChange('connection-error', msg);
      throw new Error(msg);
    }

    if (mode === 'host-side') {
      await this.applyHostRemoteAnswerAndCandidates(sessionDoc);
      return { sessionId: request.sessionId };
    }

    return this.establishPeerAnswerConnection(request, sessionDoc);
  }

  /**
   * لغو و بستن نشست در صورت انصراف کاربر
   */
  public async rejectPendingSessionOnPhone(): Promise<void> {
    const pending = this.pendingPhoneApproval;
    this.pendingPhoneApproval = null;
    const targetSessionId = pending?.request.sessionId || this.activeSessionId;
    if (targetSessionId) {
      try {
        if (pending?.mode === 'peer-side') {
          await rejectSignalingSession(targetSessionId);
        } else {
          await cleanupSignalingSession(targetSessionId);
        }
        if (this.callbacks.onSignalCleanedUp) {
          this.callbacks.onSignalCleanedUp(targetSessionId);
        }
      } catch {
        // ignore cleanup error on rejection
      }
    }
    await this.cleanupSignalingAndLocalResources(
      'disconnected',
      'نشست موقت بسته و اتصال لغو گردید.'
    );
  }

  /**
   * اتصال مستقیم یک‌مرحله‌ای با اسکن QR Code (از هر دو جهت و بدون نیاز به تأیید انسانی جداگانه روی گوشی):
   * به محض اسکن QR، نشست بررسی و قفل اتمیک شده و پاسخ WebRTC ارسال می‌گردد تا همگام‌سازی خودکار آغاز شود.
   */
  public async connectWithScannedQr(
    rawQrOrPairingCode: string
  ): Promise<{ sessionId: string; peerInfo: PendingPhoneApprovalRequest }> {
    const peerInfo = await this.inspectLaptopQrOnPhone(rawQrOrPairingCode);
    return { sessionId: peerInfo.sessionId, peerInfo };
  }

  /**
   * اتصال با رشته QR V2 (یا sessionId تصادفی صریح + کد تأیید ۱۲ کاراکتری)
   * توجه: sessionId همیشه تصادفی و مستقل از کد تأیید است.
   */
  public async joinSessionWithCode(
    rawQrOrPairingCode: string,
    explicitSessionId?: string
  ): Promise<{ sessionId: string }> {
    const parsedQr = parseLaptopSessionQrValue(rawQrOrPairingCode);
    if (parsedQr) {
      const peerInfo = await this.inspectLaptopQrOnPhone(rawQrOrPairingCode);
      return { sessionId: peerInfo.sessionId };
    }

    const normalizedCode = normalizePairingCode(rawQrOrPairingCode);
    if (!normalizedCode || !explicitSessionId || !isValidSignalingSessionId(explicitSessionId)) {
      this.callbacks.onStatusChange(
        'connection-error',
        'اطلاعات QR نامعتبر است؛ شناسه نشست تصادفی (SESS_) و کد تأیید هر دو الزامی هستند.'
      );
      throw new Error('اطلاعات QR نامعتبر است؛ شناسه نشست تصادفی الزامی است.');
    }

    const syntheticQr = buildLaptopSessionQrValue({
      sessionId: explicitSessionId,
      pairingCode: normalizedCode,
      laptopDeviceId: 'DEV_LAPTOP',
    });
    const peerInfo = await this.inspectLaptopQrOnPhone(syntheticQr);
    return { sessionId: peerInfo.sessionId };
  }

  /**
   * ارسال بسته تغییرات از طریق کانال مستقیم WebRTC DataChannel با کنترل بافر (Backpressure).
   * توجه مهم (بخش ۳ و ۵ دستور اجرایی): ارسال شبکه به معنی اعمال موفق در مقصد نیست؛
   * بسته در لیست منتظر تأیید (pendingUnackedSentPackageIds) قرار می‌گیرد تا تنها پس از دریافت TRANSFER_ACK از مقصد، Baseline به‌روزرسانی شود.
   */
  public async sendTransferPackage(pkg: SyncTransferPackage): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      this.callbacks.onStatusChange(
        'connection-error',
        'کانال مستقیم WebRTC باز نیست؛ ارسال بسته متوقف شد.'
      );
      throw new Error('کانال مستقیم WebRTC متصل نیست.');
    }

    this.pendingUnackedSentPackageIds.add(pkg.packageId);

    this.callbacks.onStatusChange(
      'transferring',
      `در حال ارسال مستقیم بسته ${pkg.packageId} شامل ${pkg.recordCount} رکورد...`
    );

    const frames = buildTransferWireFrames(pkg);
    for (let i = 0; i < frames.length; i++) {
      if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
        this.pendingUnackedSentPackageIds.delete(pkg.packageId);
        this.callbacks.onTransferInterrupted(
          pkg.packageId,
          'قطع ارتباط در حین ارسال قطعات بسته؛ انتقال ناتمام ماند و خط مبنا (Baseline) تغییر نکرد.'
        );
        throw new Error('ارتباط در حین ارسال بسته قطع شد.');
      }

      let waitCycles = 0;
      while (
        this.dataChannel &&
        this.dataChannel.readyState === 'open' &&
        typeof this.dataChannel.bufferedAmount === 'number' &&
        this.dataChannel.bufferedAmount > MAX_BUFFERED_AMOUNT_BYTES &&
        waitCycles < 100
      ) {
        await new Promise((r) => setTimeout(r, 15));
        waitCycles++;
      }

      this.dataChannel.send(JSON.stringify(frames[i]));
      if (i % 6 === 5) {
        await new Promise((r) => setTimeout(r, 10));
      }
    }
  }

  /**
   * ارسال پیام تأیید واقعی اعمال بسته (TRANSFER_ACK) توسط دستگاه مقصد به دستگاه فرستنده
   * تنها پس از آنکه بسته دریافت، کنترل چک‌سام، ادغام غیراخلال‌گر و ذخیره پایدار در مقصد واقعاً انجام شده باشد.
   */
  public sendPackageAppliedAck(params: {
    packageId: string;
    ok: boolean;
    applied?: boolean;
    appliedNewCount?: number;
    appliedModifiedCount?: number;
    unchangedCount?: number;
    conflictCount?: number;
    receiverPostAuditCount?: number;
    receiverPostTotalCount?: number;
    error?: string;
  }): void {
    const strictOk = params.ok === true && params.applied === true;
    const strictApplied = params.ok === true && params.applied === true;
    this.ackSentForReceivedPackageIds.add(params.packageId);
    this.sendWireMessage({
      type: 'TRANSFER_ACK',
      packageId: params.packageId,
      ok: strictOk,
      applied: strictApplied,
      appliedNewCount: params.appliedNewCount,
      appliedModifiedCount: params.appliedModifiedCount,
      unchangedCount: params.unchangedCount,
      conflictCount: params.conflictCount,
      receiverPostAuditCount: params.receiverPostAuditCount,
      receiverPostTotalCount: params.receiverPostTotalCount,
      error: params.error,
    });
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    this.dataChannel = channel;

    channel.onopen = () => {
      this.clearConnectionTimeout();
      this.clearDisconnectedGraceTimer();
      this.lastPeerActivityMs = Date.now();
      this.startHeartbeatLoop();
      void this.acquireWakeLock();
      this.callbacks.onStatusChange(
        'connected',
        'کانال مستقیم WebRTC (DTLS) باز شد؛ در حال تبادل پیام معرفی (Handshake) و شروع همگام‌سازی خودکار...'
      );

      const preCounts = this.callbacks.getLocalPreSyncCounts
        ? this.callbacks.getLocalPreSyncCounts()
        : undefined;

      // ارسال معرفی نقش دستگاه، نسخه پروتکل و تعداد رکوردهای محلی پیش از شروع همگام‌سازی
      const hello: WireMessage = {
        type: 'HELLO_HANDSHAKE',
        protocolVersion: SUPPORTED_SYNC_PROTOCOL_VERSION,
        deviceId: this.localDeviceId,
        deviceRole: this.localRole,
        timestampMs: Date.now(),
        localAuditCount: preCounts?.auditCount,
        localTotalCount: preCounts?.totalCount,
      };
      try {
        channel.send(JSON.stringify(hello));
      } catch {
        // ignore
      }
    };

    channel.onmessage = (event) => {
      this.handleIncomingWireRaw(String(event.data || ''));
    };

    channel.onclose = () => {
      void this.cleanupSignalingAndLocalResources(
        'disconnected',
        'کانال مستقیم DataChannel توسط دستگاه مقابل یا سیستم‌عامل بسته شد.'
      );
    };

    channel.onerror = () => {
      void this.cleanupSignalingAndLocalResources(
        'connection-error',
        'خطا در کانال مستقیم WebRTC DataChannel.'
      );
    };
  }

  public handleIncomingWireRaw(rawText: string): void {
    let msg: WireMessage;
    try {
      msg = JSON.parse(rawText) as WireMessage;
    } catch {
      return;
    }

    this.lastPeerActivityMs = Date.now();
    this.clearDisconnectedGraceTimer();

    if (msg.type === 'PING_HEARTBEAT') {
      this.heartbeatReceivedCount += 1;
      return;
    }

    if (msg.type === 'HELLO_HANDSHAKE') {
      const peerVer = msg.protocolVersion ?? 1;
      if (peerVer !== SUPPORTED_SYNC_PROTOCOL_VERSION) {
        this.callbacks.onStatusChange(
          'connection-error',
          `نسخه پروتکل دستگاه مقابل (${peerVer}) با نسخه این دستگاه (${SUPPORTED_SYNC_PROTOCOL_VERSION}) سازگار نیست.`
        );
        return;
      }

      // پس از دریافت HELLO_HANDSHAKE روی کانال باز DataChannel، لیسنر محلی را متوقف می‌کنیم
      // و حذف فیزیکی سند موقت Signaling از Firebase را ۱۵ ثانیه به تعویق می‌اندازیم تا دستگاه مقابل نیز
      // بدون هیچ تداخلی مذاکره خود را تکمیل کند.
      if (this.unsubscribeSignaling) {
        this.unsubscribeSignaling();
        this.unsubscribeSignaling = null;
      }
      this.scheduleDelayedSignalingDocumentCleanup(15000);

      if (this.callbacks.onPeerHandshake) {
        const peerPreCounts =
          typeof msg.localAuditCount === 'number' && typeof msg.localTotalCount === 'number'
            ? { auditCount: msg.localAuditCount, totalCount: msg.localTotalCount }
            : undefined;
        this.callbacks.onPeerHandshake(msg.deviceId, msg.deviceRole, peerPreCounts);
      }
      if (!this.autoSyncTriggeredForSession && this.callbacks.onChannelReadyForAutoSync) {
        this.autoSyncTriggeredForSession = true;
        this.callbacks.onChannelReadyForAutoSync(msg.deviceId, msg.deviceRole);
      }
      return;
    }

    if (msg.type === 'TRANSFER_START') {
      const validation = validateTransferStartFrame(msg);
      if (!validation.ok) {
        const errText = (validation as { ok: false; error: string }).error;
        if (msg.packageId) {
          this.incomingBuffers.delete(msg.packageId);
        }
        this.callbacks.onTransferInterrupted(msg.packageId || 'UNKNOWN_PKG', errText);
        this.callbacks.onStatusChange('connection-error', errText);
        this.sendWireMessage({
          type: 'TRANSFER_ACK',
          packageId: msg.packageId || 'UNKNOWN_PKG',
          ok: false,
          applied: false,
          error: errText,
        });
        return;
      }

      this.incomingBuffers.set(msg.packageId, {
        protocolVersion: msg.protocolVersion ?? SUPPORTED_SYNC_PROTOCOL_VERSION,
        packageId: msg.packageId,
        senderRole: msg.senderRole,
        totalChunks: msg.totalChunks,
        totalChars: msg.totalChars,
        recordCount: msg.recordCount,
        expectedChecksum: msg.payloadChecksum,
        receivedChunks: new Map<number, string>(),
        startedAtMs: Date.now(),
      });
      this.callbacks.onStatusChange(
        'transferring',
        `در حال دریافت بسته ${msg.packageId} (${msg.recordCount} رکورد)...`
      );
      return;
    }

    if (msg.type === 'TRANSFER_CHUNK') {
      const buf = this.incomingBuffers.get(msg.packageId);
      if (!buf) {
        return;
      }
      if (
        !Number.isInteger(msg.chunkIndex) ||
        msg.chunkIndex < 0 ||
        msg.chunkIndex >= buf.totalChunks ||
        typeof msg.chunkData !== 'string' ||
        msg.chunkData.length > CHUNK_SIZE_CHARS * 2
      ) {
        const badChunkPkgId = buf.packageId;
        this.incomingBuffers.delete(badChunkPkgId);
        const errMsg = 'قطعه دریافتی خارج از محدوده مجاز پروتکل است؛ انتقال متوقف شد.';
        this.callbacks.onTransferInterrupted(badChunkPkgId, errMsg);
        this.callbacks.onStatusChange('connection-error', errMsg);
        return;
      }

      buf.receivedChunks.set(msg.chunkIndex, msg.chunkData);
      if (this.callbacks.onTransferProgress) {
        this.callbacks.onTransferProgress(
          msg.packageId,
          buf.receivedChunks.size,
          buf.totalChunks
        );
      }
      return;
    }

    if (msg.type === 'TRANSFER_END') {
      const bufferToAssemble = this.incomingBuffers.get(msg.packageId);
      if (!bufferToAssemble) {
        return;
      }
      this.incomingBuffers.delete(msg.packageId);

      const verified = assembleAndVerifyTransferBuffer(bufferToAssemble);
      if (!verified.ok) {
        const errMsg = (verified as { ok: false; error: string }).error;
        this.callbacks.onTransferInterrupted(msg.packageId, errMsg);
        this.callbacks.onStatusChange('connection-error', errMsg);
        this.sendWireMessage({
          type: 'TRANSFER_ACK',
          packageId: msg.packageId,
          ok: false,
          applied: false,
          error: errMsg,
        });
        return;
      }

      this.callbacks.onStatusChange(
        'transferring',
        `بسته ${verified.pkg.packageId} شامل ${verified.pkg.recordCount} رکورد دریافت و چک‌سام SHA-256 تأیید شد؛ در حال اعمال و ذخیره پایدار در مقصد...`
      );

      // بسته به لایه اپلیکیشن تحویل داده می‌شود؛ ارسال TRANSFER_ACK با applied: true صرفاً پس از تکمیل اعمال و ذخیره پایدار مجاز است
      Promise.resolve(this.callbacks.onPackageReceived(verified.pkg)).catch((err) => {
        const errMsg =
          err instanceof Error
            ? `خطا در اعمال یا ذخیره پایدار بسته در مقصد: ${err.message}`
            : 'خطا در اعمال یا ذخیره پایدار بسته در مقصد.';
        this.callbacks.onTransferInterrupted(msg.packageId, errMsg);
        this.callbacks.onStatusChange('connection-error', errMsg);
        if (!this.ackSentForReceivedPackageIds.has(msg.packageId)) {
          this.sendPackageAppliedAck({
            packageId: msg.packageId,
            ok: false,
            applied: false,
            error: errMsg,
          });
        }
      });
      return;
    }

    if (msg.type === 'TRANSFER_ACK') {
      if (msg.ok === true && msg.applied === true) {
        this.pendingUnackedSentPackageIds.delete(msg.packageId);
        this.callbacks.onStatusChange(
          'transfer-success',
          `دریافت، اعمال و ذخیره پایدار بسته ${msg.packageId} توسط دستگاه مقصد تأیید شد و خط مبنا (Baseline) به‌روز گردید.`
        );
        if (this.callbacks.onPackageAckReceived) {
          this.callbacks.onPackageAckReceived(msg);
        }
      } else {
        const errReason =
          msg.error ||
          (msg.ok !== true
            ? 'تأییدیه ناموفق از دستگاه مقصد دریافت شد (ok !== true).'
            : 'اعمال و ذخیره پایدار بسته در دستگاه مقصد تأیید نشد (applied !== true).');
        if (this.callbacks.onPackageAckReceived) {
          this.callbacks.onPackageAckReceived(msg);
        }
        this.callbacks.onTransferInterrupted(msg.packageId, errReason);
        this.callbacks.onStatusChange(
          'connection-error',
          `تأییدیه بسته ${msg.packageId} رد شد (Baseline تغییر نکرد): ${errReason}`
        );
      }
    }
  }

  private sendWireMessage(msg: WireMessage): void {
    try {
      if (this.dataChannel && this.dataChannel.readyState === 'open') {
        this.dataChannel.send(JSON.stringify(msg));
      }
    } catch {
      // ignore
    }
  }

  private startHeartbeatLoop(): void {
    this.stopHeartbeatLoop();
    this.heartbeatIntervalId = setInterval(() => {
      if (this.dataChannel && this.dataChannel.readyState === 'open') {
        this.heartbeatSentCount += 1;
        this.sendWireMessage({
          type: 'PING_HEARTBEAT',
          timestampMs: Date.now(),
        });
      }
    }, 10000);
  }

  private stopHeartbeatLoop(): void {
    if (this.heartbeatIntervalId !== null) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
  }

  private clearDisconnectedGraceTimer(): void {
    if (this.disconnectedGraceTimerId !== null) {
      clearTimeout(this.disconnectedGraceTimerId);
      this.disconnectedGraceTimerId = null;
    }
  }

  private async acquireWakeLock(): Promise<void> {
    try {
      if (
        typeof navigator !== 'undefined' &&
        'wakeLock' in navigator &&
        (navigator as unknown as { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
      ) {
        if (!this.wakeLockSentinel) {
          this.wakeLockSentinel = await (
            navigator as unknown as { wakeLock: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }
          ).wakeLock.request('screen');
        }
      }
    } catch {
      // مرورگر یا وضعیت صفحه اجازه WakeLock نداد؛ بدون خطا ادامه می‌دهیم
    }
  }

  private releaseWakeLock(): void {
    if (this.wakeLockSentinel) {
      const sentinel = this.wakeLockSentinel;
      this.wakeLockSentinel = null;
      void sentinel.release().catch(() => {});
    }
  }

  private clearDelayedSignalingCleanupTimer(): void {
    if (this.delayedSignalingCleanupTimerId !== null) {
      clearTimeout(this.delayedSignalingCleanupTimerId);
      this.delayedSignalingCleanupTimerId = null;
    }
  }

  private scheduleDelayedSignalingDocumentCleanup(delayMs = 15000): void {
    this.clearDelayedSignalingCleanupTimer();
    const targetSessionId = this.activeSessionId;
    if (!targetSessionId || this.signalingDocCleaned) return;
    this.delayedSignalingCleanupTimerId = setTimeout(() => {
      this.delayedSignalingCleanupTimerId = null;
      if (this.activeSessionId === targetSessionId && !this.signalingDocCleaned) {
        void this.cleanupSignalingDocumentOnly();
      }
    }, delayMs);
  }

  private setupPeerConnectionStateHandlers(pc: RTCPeerConnection): void {
    const startRecoveryGraceWindow = (graceMs: number, timeoutReason: string) => {
      this.sendWireMessage({
        type: 'PING_HEARTBEAT',
        timestampMs: Date.now(),
      });
      if (this.disconnectedGraceTimerId === null) {
        this.disconnectedGraceTimerId = setTimeout(() => {
          this.disconnectedGraceTimerId = null;
          if (
            this.pc &&
            (this.pc.connectionState === 'disconnected' ||
              this.pc.connectionState === 'failed' ||
              this.pc.connectionState === 'closed') &&
            (!this.dataChannel ||
              this.dataChannel.readyState !== 'open' ||
              Date.now() - this.lastPeerActivityMs > graceMs - 2000)
          ) {
            void this.cleanupSignalingAndLocalResources('disconnected', timeoutReason);
          }
        }, graceMs);
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        this.clearDisconnectedGraceTimer();
        return;
      }
      if (state === 'failed') {
        // اگر کانال داده هنوز باز است یا تازه پیام دریافت کرده، ۱۰ ثانیه فرصت بازیابی می‌دهیم
        if (
          this.dataChannel &&
          this.dataChannel.readyState === 'open' &&
          Date.now() - this.lastPeerActivityMs < 10000
        ) {
          startRecoveryGraceWindow(
            10000,
            'اتصال مستقیم نظیربه‌نظیر (WebRTC) به علت قطع شبکه، تغییر Wi-Fi یا محدودیت فایروال خاتمه یافت.'
          );
          return;
        }
        this.clearDisconnectedGraceTimer();
        void this.cleanupSignalingAndLocalResources(
          'connection-error',
          'اتصال مستقیم نظیربه‌نظیر (WebRTC) به علت قطع شبکه، تغییر Wi-Fi یا محدودیت فایروال خاتمه یافت.'
        );
      } else if (state === 'disconnected') {
        // در WebRTC وضعیت disconnected موقت است (مثلاً نوسان چندثانیه‌ای وای‌فای یا کم‌نور شدن صفحه گوشی).
        // به جای قطع فوری، ۲۵ ثانیه فرصت بازیابی خودکار می‌دهیم و یک پالس Keep-Alive ارسال می‌کنیم.
        startRecoveryGraceWindow(
          25000,
          'اتصال مستقیم بین دو دستگاه پس از ۲۵ ثانیه عدم پاسخ شبکه یا خاموش شدن صفحه گوشی قطع شد.'
        );
      } else if (state === 'closed') {
        this.clearDisconnectedGraceTimer();
        void this.cleanupSignalingAndLocalResources(
          'disconnected',
          'اتصال مستقیم بین دو دستگاه بسته شد و منابع نشست آزاد گردید.'
        );
      }
    };
  }

  private async cleanupSignalingDocumentOnly(): Promise<void> {
    this.clearDelayedSignalingCleanupTimer();
    if (this.unsubscribeSignaling) {
      this.unsubscribeSignaling();
      this.unsubscribeSignaling = null;
    }
    if (this.activeSessionId && !this.signalingDocCleaned) {
      const sid = this.activeSessionId;
      this.signalingDocCleaned = true;
      const cleaned = await cleanupSignalingSession(sid);
      if (cleaned && this.callbacks.onSignalCleanedUp) {
        this.callbacks.onSignalCleanedUp(sid);
      }
    }
  }

  /**
   * پاک‌سازی یکپارچه نشست Signaling و منابع محلی WebRTC در مسیرهای Timeout، خطا، قطع ارتباط و انصراف
   * بدون دستکاری اطلاعات کتابخانه یا داده‌های محلی دستگاه
   */
  public async cleanupSignalingAndLocalResources(
    targetStatus: ConnectionUiStatus,
    reasonMessage: string
  ): Promise<void> {
    this.clearConnectionTimeout();
    this.clearDisconnectedGraceTimer();
    this.clearDelayedSignalingCleanupTimer();
    this.stopHeartbeatLoop();
    this.releaseWakeLock();

    if (this.incomingBuffers.size > 0) {
      for (const interruptedPkgId of this.incomingBuffers.keys()) {
        this.callbacks.onTransferInterrupted(
          interruptedPkgId,
          `قطع ارتباط در حین دریافت (${reasonMessage})؛ بسته ناقص حذف شد و هیچ رکوردی ثبت نگردید.`
        );
      }
      this.incomingBuffers.clear();
    }

    if (this.pendingUnackedSentPackageIds.size > 0) {
      for (const unackedPkgId of this.pendingUnackedSentPackageIds.values()) {
        this.callbacks.onTransferInterrupted(
          unackedPkgId,
          `قطع ارتباط پیش از دریافت تأیید اعمال بسته از مقصد (${reasonMessage})؛ خط مبنا (Baseline) تغییر نکرد.`
        );
      }
      this.pendingUnackedSentPackageIds.clear();
    }

    await this.cleanupSignalingDocumentOnly();
    this.activeSessionId = '';
    this.pendingPhoneApproval = null;

    if (this.dataChannel) {
      try {
        this.dataChannel.onopen = null;
        this.dataChannel.onmessage = null;
        this.dataChannel.onclose = null;
        this.dataChannel.onerror = null;
        this.dataChannel.close();
      } catch {
        // ignore
      }
      this.dataChannel = null;
    }

    if (this.pc) {
      try {
        this.pc.onicecandidate = null;
        this.pc.ondatachannel = null;
        this.pc.onconnectionstatechange = null;
        this.pc.close();
      } catch {
        // ignore
      }
      this.pc = null;
    }

    this.appliedRemoteAnswer = false;
    this.autoSyncTriggeredForSession = false;
    this.addedRemoteCandidateKeys.clear();
    this.callbacks.onStatusChange(targetStatus, reasonMessage);
  }

  private armDirectConnectionTimeout(): void {
    this.clearConnectionTimeout();
    this.connectionTimeoutId = setTimeout(() => {
      if (!this.isConnected()) {
        void this.cleanupSignalingAndLocalResources(
          'connection-error',
          'مهلت برقراری اتصال مستقیم به پایان رسید و نشست موقت پاک‌سازی شد. اگر هر دو دستگاه پشت فایروال محدود هستند، از یک Wi-Fi یا هات‌اسپات مشترک استفاده کنید.'
        );
      }
    }, this.connectionTimeoutMs);
  }

  private clearConnectionTimeout(): void {
    if (this.connectionTimeoutId !== null) {
      clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = null;
    }
  }

  public closeConnection(notify = true): void {
    this.clearConnectionTimeout();
    this.clearDisconnectedGraceTimer();
    this.clearDelayedSignalingCleanupTimer();
    this.stopHeartbeatLoop();
    this.releaseWakeLock();
    if (this.unsubscribeSignaling) {
      this.unsubscribeSignaling();
      this.unsubscribeSignaling = null;
    }
    if (this.activeSessionId && !this.signalingDocCleaned) {
      const sid = this.activeSessionId;
      this.signalingDocCleaned = true;
      void cleanupSignalingSession(sid).then((cleaned) => {
        if (cleaned && this.callbacks.onSignalCleanedUp) {
          this.callbacks.onSignalCleanedUp(sid);
        }
      });
    }
    this.activeSessionId = '';
    this.pendingPhoneApproval = null;

    if (this.dataChannel) {
      try {
        this.dataChannel.onopen = null;
        this.dataChannel.onmessage = null;
        this.dataChannel.onclose = null;
        this.dataChannel.onerror = null;
        this.dataChannel.close();
      } catch {
        // ignore
      }
      this.dataChannel = null;
    }
    if (this.pc) {
      try {
        this.pc.onicecandidate = null;
        this.pc.ondatachannel = null;
        this.pc.onconnectionstatechange = null;
        this.pc.close();
      } catch {
        // ignore
      }
      this.pc = null;
    }
    this.appliedRemoteAnswer = false;
    this.autoSyncTriggeredForSession = false;
    this.addedRemoteCandidateKeys.clear();
    if (this.incomingBuffers.size > 0) {
      for (const pkgId of this.incomingBuffers.keys()) {
        this.callbacks.onTransferInterrupted(pkgId, 'بسته شدن دستی اتصال پیش از اتمام دریافت.');
      }
      this.incomingBuffers.clear();
    }
    if (this.pendingUnackedSentPackageIds.size > 0) {
      for (const unackedPkgId of this.pendingUnackedSentPackageIds.values()) {
        this.callbacks.onTransferInterrupted(
          unackedPkgId,
          'بسته شدن اتصال پیش از دریافت تأیید اعمال بسته از مقصد؛ خط مبنا (Baseline) تغییر نکرد.'
        );
      }
      this.pendingUnackedSentPackageIds.clear();
    }
    if (notify) {
      this.callbacks.onStatusChange(
        'disconnected',
        'اتصال مستقیم پایان یافت و اطلاعات جلسه موقت پاک‌سازی شد.'
      );
    }
  }
}
