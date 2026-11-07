import {
  derivePairingDigest,
  deriveSignalingSessionId,
  maskSessionIdForDisplay,
  normalizePairingCode,
} from './pairingService';
import {
  cleanupSignalingSession,
  createSignalingOfferSession,
  fetchSignalingSession,
  submitSignalingAnswer,
  subscribeToSignalingSession,
  updateSignalingCandidates,
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

export interface PeerConnectionCallbacks {
  onStatusChange: (status: ConnectionUiStatus, detailMessage?: string) => void;
  onPeerHandshake?: (peerDeviceId: string, peerRole: DeviceSyncRole) => void;
  onTransferProgress?: (packageId: string, receivedChunks: number, totalChunks: number) => void;
  onPackageReceived: (pkg: SyncTransferPackage) => void;
  onTransferInterrupted: (packageId: string, reason: string) => void;
  onSignalCleanedUp?: (sessionId: string) => void;
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
  private incomingBuffer: IncomingTransferBuffer | null = null;
  private appliedRemoteAnswer = false;
  private addedRemoteCandidateKeys = new Set<string>();
  private connectionTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private connectionTimeoutMs: number;
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
    await this.cleanupSignalingAndLocalResources(
      'ready',
      'فرآیند جفت‌سازی توسط کاربر لغو شد و نشست موقت پاک‌سازی گردید.'
    );
  }

  /**
   * گام ۱ تا ۶ (سمت میزبان - معمولاً گوشی اندروید):
   * ایجاد جلسه با شناسه مشتق‌شده SHA-256، تولید Offer و انتظار برای دریافت Answer
   */
  public async startHostSession(pairingCode: string): Promise<{ sessionId: string }> {
    this.closeConnection(false);

    const normalizedCode = normalizePairingCode(pairingCode);
    if (!normalizedCode) {
      this.callbacks.onStatusChange(
        'connection-error',
        'کد جفت‌سازی نامعتبر است. کد باید ۱۲ کاراکتر از الفبای مجاز باشد.'
      );
      throw new Error('کد جفت‌سازی نامعتبر است.');
    }

    const sessionId = deriveSignalingSessionId(normalizedCode);
    const pairingCodeDigest = derivePairingDigest(normalizedCode);
    this.activeSessionId = sessionId;
    this.signalingDocCleaned = false;

    this.callbacks.onStatusChange(
      'pairing',
      `نشست جفت‌سازی (${maskSessionIdForDisplay(sessionId)}) فعال شد. در انتظار وارد کردن کد در دستگاه مقابل...`
    );

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
          void updateSignalingCandidates({
            sessionId,
            isHost: true,
            candidates: localCandidates,
          });
        }
      };

      this.setupPeerConnectionStateHandlers(pc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await createSignalingOfferSession({
        sessionId,
        pairingCodeDigest,
        hostDeviceRole: this.localRole,
        offerSdp: offer.sdp || '',
        hostCandidates: localCandidates,
      });

      this.unsubscribeSignaling = subscribeToSignalingSession(
        sessionId,
        async (docData) => {
          if (!docData || !this.pc) return;

          if (docData.answerSdp && !this.appliedRemoteAnswer) {
            this.appliedRemoteAnswer = true;
            this.callbacks.onStatusChange(
              'connecting',
              'پاسخ دستگاه مقابل دریافت شد؛ در حال برقراری کانال مستقیم WebRTC...'
            );
            try {
              await this.pc.setRemoteDescription(
                new RTCSessionDescription({
                  type: 'answer',
                  sdp: docData.answerSdp,
                })
              );
            } catch {
              await this.cleanupSignalingAndLocalResources(
                'connection-error',
                'خطا در اعمال پاسخ شبکه (SDP Answer) دستگاه مقابل؛ نشست موقت پاک‌سازی شد.'
              );
              return;
            }
          }

          if (docData.peerCandidatesJson && this.pc && this.pc.remoteDescription) {
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
        },
        (err) => {
          void this.cleanupSignalingAndLocalResources(
            'connection-error',
            `خطا در هماهنگی اولیه اتصال: ${err.message}`
          );
        }
      );

      this.armDirectConnectionTimeout();
      return { sessionId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.cleanupSignalingAndLocalResources(
        'connection-error',
        `شکست در راه‌اندازی نشست Signaling: ${msg}`
      );
      throw err;
    }
  }

  /**
   * گام ۳ تا ۶ (سمت متصل‌شونده - معمولاً کامپیوتر):
   * دریافت Offer با کد جفت‌سازی، اعتبارسنجی Digest با SHA-256، تولید Answer و برقراری کانال مستقیم
   */
  public async joinSessionWithCode(rawPairingCode: string): Promise<{ sessionId: string }> {
    this.closeConnection(false);

    const normalizedCode = normalizePairingCode(rawPairingCode);
    if (!normalizedCode) {
      this.callbacks.onStatusChange(
        'connection-error',
        'کد جفت‌سازی واردشده معتبر نیست. لطفاً کد ۱۲ کاراکتری را کامل وارد کنید.'
      );
      throw new Error('کد جفت‌سازی نامعتبر است.');
    }

    const sessionId = deriveSignalingSessionId(normalizedCode);
    const expectedDigest = derivePairingDigest(normalizedCode);
    this.activeSessionId = sessionId;
    this.signalingDocCleaned = false;

    this.callbacks.onStatusChange('connecting', 'در حال جست‌وجوی نشست جفت‌سازی و مذاکره مستقیم...');

    try {
      const sessionDoc = await fetchSignalingSession(sessionId);
      if (!sessionDoc || !sessionDoc.offerSdp) {
        await this.cleanupSignalingAndLocalResources(
          'connection-error',
          'نشست فعالی با این کد جفت‌سازی یافت نشد یا منقضی شده است.'
        );
        throw new Error('نشست فعالی با این کد جفت‌سازی یافت نشد.');
      }

      if (sessionDoc.pairingCodeDigest !== expectedDigest) {
        await this.cleanupSignalingAndLocalResources(
          'connection-error',
          'عدم تطابق هش امنیتی SHA-256 کد جفت‌سازی.'
        );
        throw new Error('عدم تطابق رمز جفت‌سازی.');
      }

      const pc = new RTCPeerConnection({
        iceServers: DIRECT_STUN_ICE_SERVERS,
      });
      this.pc = pc;

      const peerCandidates: RTCIceCandidateInit[] = [];
      pc.ondatachannel = (event) => {
        this.setupDataChannel(event.channel);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && !this.signalingDocCleaned && this.activeSessionId === sessionId) {
          peerCandidates.push(event.candidate.toJSON());
          void updateSignalingCandidates({
            sessionId,
            isHost: false,
            candidates: peerCandidates,
          });
        }
      };

      this.setupPeerConnectionStateHandlers(pc);

      await pc.setRemoteDescription(
        new RTCSessionDescription({
          type: 'offer',
          sdp: sessionDoc.offerSdp,
        })
      );

      if (sessionDoc.hostCandidatesJson) {
        try {
          const hostCands = JSON.parse(sessionDoc.hostCandidatesJson) as RTCIceCandidateInit[];
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

      await submitSignalingAnswer({
        sessionId,
        answerSdp: answer.sdp || '',
        peerCandidates,
      });

      this.unsubscribeSignaling = subscribeToSignalingSession(
        sessionId,
        async (updatedDoc) => {
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
   * ارسال بسته تغییرات از طریق کانال مستقیم WebRTC DataChannel با کنترل بافر (Backpressure)
   */
  public async sendTransferPackage(pkg: SyncTransferPackage): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      this.callbacks.onStatusChange(
        'connection-error',
        'کانال مستقیم WebRTC باز نیست؛ ارسال بسته متوقف شد.'
      );
      throw new Error('کانال مستقیم WebRTC متصل نیست.');
    }

    this.callbacks.onStatusChange(
      'transferring',
      `در حال ارسال مستقیم بسته ${pkg.packageId} شامل ${pkg.recordCount} رکورد...`
    );

    const frames = buildTransferWireFrames(pkg);
    for (let i = 0; i < frames.length; i++) {
      if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
        this.callbacks.onTransferInterrupted(
          pkg.packageId,
          'قطع ارتباط در حین ارسال قطعات بسته؛ انتقال ناتمام ماند.'
        );
        throw new Error('ارتباط در حین ارسال بسته قطع شد.');
      }

      // کنترل بافر DataChannel برای جلوگیری از سرریز در بسته‌های بزرگ
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

  private setupDataChannel(channel: RTCDataChannel): void {
    this.dataChannel = channel;

    channel.onopen = async () => {
      this.clearConnectionTimeout();
      this.callbacks.onStatusChange(
        'connected',
        'اتصال مستقیم و رمزنگاری‌شده WebRTC برقرار شد. در حال پاک‌سازی اطلاعات موقت جفت‌سازی...'
      );

      // ارسال معرفی نقش دستگاه و نسخه پروتکل در کانال مستقیم
      const hello: WireMessage = {
        type: 'HELLO_HANDSHAKE',
        protocolVersion: SUPPORTED_SYNC_PROTOCOL_VERSION,
        deviceId: this.localDeviceId,
        deviceRole: this.localRole,
        timestampMs: Date.now(),
      };
      try {
        channel.send(JSON.stringify(hello));
      } catch {
        // ignore
      }

      // به محض برقراری اتصال مستقیم، گوش‌دهنده Signaling متوقف و سند موقت از Firebase پاک می‌شود
      await this.cleanupSignalingDocumentOnly();
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
      if (this.callbacks.onPeerHandshake) {
        this.callbacks.onPeerHandshake(msg.deviceId, msg.deviceRole);
      }
      return;
    }

    if (msg.type === 'TRANSFER_START') {
      const validation = validateTransferStartFrame(msg);
      if (!validation.ok) {
        const errText = (validation as { ok: false; error: string }).error;
        this.incomingBuffer = null;
        this.callbacks.onTransferInterrupted(msg.packageId || 'UNKNOWN_PKG', errText);
        this.callbacks.onStatusChange('connection-error', errText);
        this.sendWireMessage({
          type: 'TRANSFER_ACK',
          packageId: msg.packageId || 'UNKNOWN_PKG',
          ok: false,
          error: errText,
        });
        return;
      }

      this.incomingBuffer = {
        protocolVersion: msg.protocolVersion ?? SUPPORTED_SYNC_PROTOCOL_VERSION,
        packageId: msg.packageId,
        senderRole: msg.senderRole,
        totalChunks: msg.totalChunks,
        totalChars: msg.totalChars,
        recordCount: msg.recordCount,
        expectedChecksum: msg.payloadChecksum,
        receivedChunks: new Map<number, string>(),
        startedAtMs: Date.now(),
      };
      this.callbacks.onStatusChange(
        'transferring',
        `در حال دریافت بسته ${msg.packageId} (${msg.recordCount} رکورد)...`
      );
      return;
    }

    if (msg.type === 'TRANSFER_CHUNK') {
      if (!this.incomingBuffer || this.incomingBuffer.packageId !== msg.packageId) {
        return;
      }
      if (
        !Number.isInteger(msg.chunkIndex) ||
        msg.chunkIndex < 0 ||
        msg.chunkIndex >= this.incomingBuffer.totalChunks ||
        typeof msg.chunkData !== 'string' ||
        msg.chunkData.length > CHUNK_SIZE_CHARS * 2
      ) {
        const badChunkPkgId = this.incomingBuffer.packageId;
        this.incomingBuffer = null;
        const errMsg = 'قطعه دریافتی خارج از محدوده مجاز پروتکل است؛ انتقال متوقف شد.';
        this.callbacks.onTransferInterrupted(badChunkPkgId, errMsg);
        this.callbacks.onStatusChange('connection-error', errMsg);
        return;
      }

      this.incomingBuffer.receivedChunks.set(msg.chunkIndex, msg.chunkData);
      if (this.callbacks.onTransferProgress) {
        this.callbacks.onTransferProgress(
          msg.packageId,
          this.incomingBuffer.receivedChunks.size,
          this.incomingBuffer.totalChunks
        );
      }
      return;
    }

    if (msg.type === 'TRANSFER_END') {
      if (!this.incomingBuffer || this.incomingBuffer.packageId !== msg.packageId) {
        return;
      }
      const bufferToAssemble = this.incomingBuffer;
      this.incomingBuffer = null;

      const verified = assembleAndVerifyTransferBuffer(bufferToAssemble);
      if (!verified.ok) {
        const errMsg = (verified as { ok: false; error: string }).error;
        this.callbacks.onTransferInterrupted(msg.packageId, errMsg);
        this.callbacks.onStatusChange('connection-error', errMsg);
        this.sendWireMessage({
          type: 'TRANSFER_ACK',
          packageId: msg.packageId,
          ok: false,
          error: errMsg,
        });
        return;
      }

      this.sendWireMessage({
        type: 'TRANSFER_ACK',
        packageId: msg.packageId,
        ok: true,
      });

      this.callbacks.onStatusChange(
        'transfer-success',
        `بسته ${verified.pkg.packageId} شامل ${verified.pkg.recordCount} رکورد با صحت کامل (SHA-256) دریافت شد و آماده بررسی است.`
      );
      this.callbacks.onPackageReceived(verified.pkg);
      return;
    }

    if (msg.type === 'TRANSFER_ACK') {
      if (msg.ok) {
        this.callbacks.onStatusChange(
          'transfer-success',
          `تحویل کامل و بی‌نقص بسته ${msg.packageId} توسط دستگاه مقابل تأیید شد.`
        );
      } else {
        this.callbacks.onStatusChange(
          'connection-error',
          `دستگاه مقابل خطای یکپارچگی بسته را گزارش کرد: ${msg.error || 'نامشخص'}`
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

    if (this.incomingBuffer) {
      const interruptedPkgId = this.incomingBuffer.packageId;
      this.incomingBuffer = null;
      this.callbacks.onTransferInterrupted(
        interruptedPkgId,
        `قطع ارتباط در حین انتقال (${reasonMessage})؛ بسته ناقص حذف شد و هیچ رکوردی ثبت نگردید.`
      );
    }

    await this.cleanupSignalingDocumentOnly();
    this.activeSessionId = '';

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
    this.addedRemoteCandidateKeys.clear();
    if (this.incomingBuffer) {
      const pkgId = this.incomingBuffer.packageId;
      this.incomingBuffer = null;
      this.callbacks.onTransferInterrupted(pkgId, 'بسته شدن دستی اتصال پیش از اتمام انتقال.');
    }
    if (notify) {
      this.callbacks.onStatusChange(
        'disconnected',
        'اتصال مستقیم پایان یافت و اطلاعات جلسه موقت پاک‌سازی شد.'
      );
    }
  }
}
