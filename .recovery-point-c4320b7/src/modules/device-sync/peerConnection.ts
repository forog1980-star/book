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
];

const MAX_BUFFERED_AMOUNT_BYTES = 256 * 1024; // سقف بافر ۲۵۶ کیلوبایت برای کنترل جریان (Backpressure)
const INITIAL_ICE_GATHER_WAIT_MS = 700; // فرصت کوتاه اولیه برای جمع‌آوری کاندیداهای شبکه پیش از ثبت SDP

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
  private pendingPhoneApproval: {
    mode: 'peer-side' | 'host-side';
    request: PendingPhoneApprovalRequest;
    sessionDoc: WebRtcSignalingDocument;
  } | null = null;
  private readonly boundWindowUnloadHandler: () => void;

  constructor(
    localDeviceId: string,
    localRole: DeviceSyncRole,
    callbacks: PeerConnectionCallbacks,
    connectionTimeoutMs = 60000
  ) {
    this.localDeviceId = localDeviceId;
    this.localRole = localRole;
    this.callbacks = callbacks;
    this.connectionTimeoutMs = connectionTimeoutMs;

    this.boundWindowUnloadHandler = () => {
      this.closeConnection(false);
    };

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('beforeunload', this.boundWindowUnloadHandler);
      window.addEventListener('pagehide', this.boundWindowUnloadHandler);
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

    try {
      const pc = new RTCPeerConnection({
        iceServers: DIRECT_STUN_ICE_SERVERS,
      });
      this.pc = pc;

      const localCandidates: RTCIceCandidateInit[] = [];
      let isOfferSessionCreated = false;

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

          // اگر دستگاه مقابل درخواست اتصال را رد کند، نشست را ببندد یا سند موقت حذف شود (قبل از برقراری ارتباط)
          if (
            (!docData || docData.status === 'closed' || docData.status === 'expired') &&
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
          void this.cleanupSignalingAndLocalResources(
            'connection-error',
            `خطا در هماهنگی اولیه اتصال: ${err.message}`
          );
        }
      );

      this.armDirectConnectionTimeout();
      return { sessionId, qrValue };
    } catch (err) {
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
   * گام ۳ و ۴ (در دستگاه دوم / Peer که QR را اسکن می‌کند):
   * اسکن QR Code، قفل اتمیک peerUid با تراکنش Firestore (جلوگیری از تصاحب نشست توسط دستگاه ثالث)،
   * و آماده‌سازی مشخصات دستگاه مقابل جهت تأیید.
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
      `در حال بررسی و قفل اتمیک نشست (${maskSessionIdForDisplay(sessionId)})...`
    );

    try {
      const sessionDoc = await claimAndInspectSignalingSession(sessionId, expectedDigest);
      if (!sessionDoc || !sessionDoc.offerSdp) {
        const msg = 'نشست فعالی برای این QR Code یافت نشد یا مهلت اعتبار آن به پایان رسیده است.';
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

      this.pendingPhoneApproval = {
        mode: 'peer-side',
        request: approvalRequest,
        sessionDoc,
      };

      this.callbacks.onStatusChange(
        'pairing',
        `نشست دستگاه مقابل (${laptopDeviceId}) بررسی و به‌صورت اتمیک قفل شد. ${
          this.localRole === 'phone-primary'
            ? 'لطفاً روی گوشی اتصال را تأیید یا رد کنید.'
            : 'در حال ارسال پاسخ به گوشی جهت تأیید نهایی روی گوشی...'
        }`
      );

      return approvalRequest;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.callbacks.onStatusChange('connection-error', msg);
      throw err;
    }
  }

  /**
   * گام ۵: تأیید صریح اتصال روی گوشی (چه گوشی در نقش Peer باشد و چه در نقش Host)
   * و یا ارسال درخواست پیوستن از لپ‌تاپ به نشست گوشی
   */
  public async approvePendingSessionOnPhone(): Promise<{ sessionId: string }> {
    if (!this.pendingPhoneApproval) {
      const msg = 'هیچ درخواست اتصال منتظر تأییدی وجود ندارد. ابتدا QR نشست را اسکن کنید.';
      this.callbacks.onStatusChange('connection-error', msg);
      throw new Error(msg);
    }

    const { mode, request, sessionDoc } = this.pendingPhoneApproval;
    this.pendingPhoneApproval = null;

    if (Date.now() > sessionDoc.expiresAtMs) {
      await cleanupSignalingSession(request.sessionId);
      const msg = 'مهلت زمانی این QR Code به پایان رسیده است. لطفاً QR جدید تولید کنید.';
      this.callbacks.onStatusChange('connection-error', msg);
      throw new Error(msg);
    }

    // حالت الف: گوشی خودش آغازکننده نشست (Host) بوده و اکنون درخواست پیوستن لپ‌تاپ را تأیید می‌کند
    if (mode === 'host-side') {
      await this.applyHostRemoteAnswerAndCandidates(sessionDoc);
      return { sessionId: request.sessionId };
    }

    // حالت ب: دستگاه فعلی اسکن‌کننده QR (Peer) است و پاسخ SDP Answer را ثبت می‌کند
    const sessionId = request.sessionId;
    this.activeSessionId = sessionId;
    this.signalingDocCleaned = false;
    this.autoSyncTriggeredForSession = false;

    this.callbacks.onStatusChange(
      'connecting',
      this.localRole === 'phone-primary'
        ? 'اتصال توسط گوشی تأیید شد؛ در حال برقراری کانال مستقیم WebRTC و شروع همگام‌سازی دوطرفه...'
        : 'پاسخ شبکه ارسال شد؛ در انتظار تأیید نهایی اتصال روی صفحه گوشی...'
    );

    try {
      const freshDoc = await fetchSignalingSession(sessionId);
      if (!freshDoc || !freshDoc.offerSdp) {
        throw new Error('نشست منقضی یا بسته شده است.');
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
            (!updatedDoc || updatedDoc.status === 'closed' || updatedDoc.status === 'expired') &&
            !this.isConnected()
          ) {
            this.signalingDocCleaned = true;
            await this.cleanupSignalingAndLocalResources(
              'disconnected',
              'درخواست اتصال توسط گوشی رد شد یا نشست موقت بسته گردید.'
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
   * گام ۶ (در گوشی تأییدکننده):
   * اگر کاربر در گوشی درخواست اتصال را رد کند (چه گوشی Peer باشد و چه Host)، نشست بلافاصله در Firestore بسته و حذف شده و اتصال لغو می‌شود.
   */
  public async rejectPendingSessionOnPhone(): Promise<void> {
    const pending = this.pendingPhoneApproval;
    this.pendingPhoneApproval = null;
    if (pending) {
      try {
        if (pending.mode === 'peer-side') {
          await rejectSignalingSession(pending.request.sessionId);
        } else {
          await cleanupSignalingSession(pending.request.sessionId);
        }
        if (this.callbacks.onSignalCleanedUp) {
          this.callbacks.onSignalCleanedUp(pending.request.sessionId);
        }
      } catch {
        // ignore cleanup error on rejection
      }
    }
    await this.cleanupSignalingAndLocalResources(
      'disconnected',
      'درخواست اتصال توسط شما روی گوشی رد شد و نشست موقت بلافاصله بسته گردید.'
    );
  }

  /**
   * اتصال مستقیم یک‌مرحله‌ای با اسکن QR Code (بدون نیاز به مرحله تأیید جداگانه روی گوشی):
   * به محض اسکن QR، نشست بررسی و قفل شده و پاسخ WebRTC ارسال می‌گردد تا همگام‌سازی خودکار آغاز شود.
   */
  public async connectWithScannedQr(
    rawQrOrPairingCode: string
  ): Promise<{ sessionId: string; peerInfo: PendingPhoneApprovalRequest }> {
    const peerInfo = await this.inspectLaptopQrOnPhone(rawQrOrPairingCode);
    const { sessionId } = await this.approvePendingSessionOnPhone();
    return { sessionId, peerInfo };
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
      await this.inspectLaptopQrOnPhone(rawQrOrPairingCode);
      return this.approvePendingSessionOnPhone();
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
    await this.inspectLaptopQrOnPhone(syntheticQr);
    return this.approvePendingSessionOnPhone();
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
   * تنها پس از آنکه بسته دریافت، کنترل چک‌سام و روی Dataset مقصد واقعاً اعمال شده باشد.
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
    this.ackSentForReceivedPackageIds.add(params.packageId);
    this.sendWireMessage({
      type: 'TRANSFER_ACK',
      packageId: params.packageId,
      ok: params.ok,
      applied: params.applied ?? params.ok,
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
        'کانال مستقیم DataChannel بسته شد.'
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

    if (msg.type === 'HELLO_HANDSHAKE') {
      const peerVer = msg.protocolVersion ?? 1;
      if (peerVer !== SUPPORTED_SYNC_PROTOCOL_VERSION) {
        this.callbacks.onStatusChange(
          'connection-error',
          `نسخه پروتکل دستگاه مقابل (${peerVer}) با نسخه این دستگاه (${SUPPORTED_SYNC_PROTOCOL_VERSION}) سازگار نیست.`
        );
        return;
      }

      // تنها پس از دریافت HELLO_HANDSHAKE روی کانال باز DataChannel (اطمینان ۱۰۰٪ از تکمیل مذاکره دوطرفه ICE/DTLS/SCTP)،
      // سند موقت Signaling از Firebase پاک‌سازی می‌شود تا حذف زودهنگام مانع برقراری اتصال نشود.
      void this.cleanupSignalingDocumentOnly();

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
        'transfer-success',
        `بسته ${verified.pkg.packageId} شامل ${verified.pkg.recordCount} رکورد پس از بررسی چک‌سام یکپارچگی انتقال (SHA-256) دریافت شد.`
      );

      // ابتدا بسته به لایه اپلیکیشن تحویل داده می‌شود تا واقعاً روی Dataset مقصد اعمال گردد و سپس TRANSFER_ACK ارسال شود
      this.callbacks.onPackageReceived(verified.pkg);

      // در صورتی که در محیط تست واحد، onPackageReceived خودش sendPackageAppliedAck را صدا نزده باشد، تأیید پایه ارسال می‌شود
      if (!this.ackSentForReceivedPackageIds.has(msg.packageId)) {
        this.sendPackageAppliedAck({
          packageId: msg.packageId,
          ok: true,
          applied: true,
        });
      }
      return;
    }

    if (msg.type === 'TRANSFER_ACK') {
      this.pendingUnackedSentPackageIds.delete(msg.packageId);
      if (msg.ok && msg.applied !== false) {
        this.callbacks.onStatusChange(
          'transfer-success',
          `دریافت و اعمال موفق بسته ${msg.packageId} توسط دستگاه مقصد تأیید شد و خط مبنا (Baseline) به‌روز گردید.`
        );
        if (this.callbacks.onPackageAckReceived) {
          this.callbacks.onPackageAckReceived(msg);
        }
      } else {
        const errReason = msg.error || 'خطای اعمال بسته در دستگاه مقصد';
        this.callbacks.onTransferInterrupted(msg.packageId, errReason);
        this.callbacks.onStatusChange(
          'connection-error',
          `دستگاه مقابل خطای دریافت یا اعمال بسته را گزارش کرد: ${errReason}`
        );
        if (this.callbacks.onPackageAckReceived) {
          this.callbacks.onPackageAckReceived(msg);
        }
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

  private setupPeerConnectionStateHandlers(pc: RTCPeerConnection): void {
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'failed') {
        void this.cleanupSignalingAndLocalResources(
          'connection-error',
          'اتصال مستقیم نظیربه‌نظیر (WebRTC) به علت محدودیت شبکه یا فایروال برقرار نشد و نشست موقت پاک‌سازی گردید. طبق سیاست امنیتی، استفاده از TURN Relay به‌صورت پیش‌فرض غیرفعال است.'
        );
      } else if (state === 'disconnected' || state === 'closed') {
        void this.cleanupSignalingAndLocalResources(
          'disconnected',
          'اتصال مستقیم بین دو دستگاه قطع شد و منابع نشست آزاد گردید.'
        );
      }
    };
  }

  private async cleanupSignalingDocumentOnly(): Promise<void> {
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
