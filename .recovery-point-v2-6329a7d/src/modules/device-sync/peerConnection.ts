import {
  derivePairingDigest,
  deriveSignalingSessionId,
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
  IncomingTransferBuffer,
  WireMessage,
} from './transferProtocol';
import { ConnectionUiStatus, DeviceSyncRole, SyncTransferPackage } from './types';

// فقط سرورهای STUN برای کشف آدرس شبکه؛ استفاده از TURN Relay به‌طور پیش‌فرض ممنوع است (بخش دوم - بند ۳)
const DIRECT_STUN_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

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
  private localDeviceId: string;
  private localRole: DeviceSyncRole;
  private callbacks: PeerConnectionCallbacks;
  private incomingBuffer: IncomingTransferBuffer | null = null;
  private appliedRemoteAnswer = false;
  private addedRemoteCandidateKeys = new Set<string>();
  private connectionTimeoutId: number | null = null;

  constructor(
    localDeviceId: string,
    localRole: DeviceSyncRole,
    callbacks: PeerConnectionCallbacks
  ) {
    this.localDeviceId = localDeviceId;
    this.localRole = localRole;
    this.callbacks = callbacks;
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
   * گام ۱ تا ۶ (سمت میزبان - معمولاً گوشی اندروید):
   * ایجاد جلسه، تولید Offer و انتظار برای دریافت Answer از دستگاه مقابل
   */
  public async startHostSession(pairingCode: string): Promise<{ sessionId: string }> {
    this.closeConnection(false);

    const normalizedCode = normalizePairingCode(pairingCode);
    const sessionId = deriveSignalingSessionId(normalizedCode);
    const pairingCodeDigest = derivePairingDigest(normalizedCode);
    this.activeSessionId = sessionId;

    this.callbacks.onStatusChange(
      'pairing',
      `کد جفت‌سازی ${normalizedCode} فعال شد. در انتظار وارد کردن کد در دستگاه مقابل...`
    );

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
      if (event.candidate) {
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
          } catch (err) {
            console.error('Error setting remote answer:', err);
          }
        }

        if (docData.peerCandidatesJson && this.pc.remoteDescription) {
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
            // ignore candidate parse error
          }
        }
      },
      (err) => {
        this.callbacks.onStatusChange(
          'connection-error',
          `خطا در هماهنگی اولیه اتصال: ${err.message}`
        );
      }
    );

    this.armDirectConnectionTimeout();
    return { sessionId };
  }

  /**
   * گام ۳ تا ۶ (سمت متصل‌شونده - معمولاً کامپیوتر):
   * دریافت Offer با کد جفت‌سازی، تولید Answer و برقراری کانال مستقیم
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

    this.callbacks.onStatusChange('connecting', 'در حال جست‌وجوی جلسه جفت‌سازی و مذاکره مستقیم...');

    const sessionDoc = await fetchSignalingSession(sessionId);
    if (!sessionDoc || !sessionDoc.offerSdp) {
      this.callbacks.onStatusChange(
        'connection-error',
        'جلسه فعالی با این کد جفت‌سازی یافت نشد یا منقضی شده است.'
      );
      throw new Error('جلسه فعالی با این کد جفت‌سازی یافت نشد.');
    }

    if (sessionDoc.pairingCodeDigest !== expectedDigest) {
      this.callbacks.onStatusChange('connection-error', 'عدم تطابق رمز جفت‌سازی جلسه.');
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
      if (event.candidate) {
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

    this.unsubscribeSignaling = subscribeToSignalingSession(sessionId, async (updatedDoc) => {
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
    });

    this.armDirectConnectionTimeout();
    return { sessionId };
  }

  /**
   * ارسال بسته تغییرات از طریق کانال مستقیم WebRTC DataChannel
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
      this.dataChannel.send(JSON.stringify(frames[i]));
      // مکث کوتاه در بسته‌های چندقطعه‌ای برای جلوگیری از پر شدن بافر مرورگر موبایل
      if (i % 6 === 5) {
        await new Promise((r) => setTimeout(r, 12));
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

      // ارسال معرفی نقش دستگاه در کانال مستقیم
      const hello: WireMessage = {
        type: 'HELLO_HANDSHAKE',
        deviceId: this.localDeviceId,
        deviceRole: this.localRole,
        timestampMs: Date.now(),
      };
      try {
        channel.send(JSON.stringify(hello));
      } catch {
        // ignore
      }

      // گام ۸ بخش سوم: به محض برقراری اتصال مستقیم، گوش‌دهنده Signaling متوقف و سند موقت از Firebase پاک می‌شود
      if (this.unsubscribeSignaling) {
        this.unsubscribeSignaling();
        this.unsubscribeSignaling = null;
      }
      if (this.activeSessionId) {
        const sid = this.activeSessionId;
        const cleaned = await cleanupSignalingSession(sid);
        if (cleaned && this.callbacks.onSignalCleanedUp) {
          this.callbacks.onSignalCleanedUp(sid);
        }
      }
    };

    channel.onmessage = (event) => {
      this.handleIncomingWireRaw(String(event.data || ''));
    };

    channel.onclose = () => {
      this.handleUnexpectedDisconnect('کانال مستقیم DataChannel بسته شد.');
    };

    channel.onerror = () => {
      this.handleUnexpectedDisconnect('خطا در کانال مستقیم WebRTC DataChannel.');
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
      if (this.callbacks.onPeerHandshake) {
        this.callbacks.onPeerHandshake(msg.deviceId, msg.deviceRole);
      }
      return;
    }

    if (msg.type === 'TRANSFER_START') {
      this.incomingBuffer = {
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
        `بسته ${verified.pkg.packageId} شامل ${verified.pkg.recordCount} رکورد با صحت کامل دریافت شد و آماده بررسی است.`
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
        this.clearConnectionTimeout();
        this.handleUnexpectedDisconnect(
          'اتصال مستقیم نظیربه‌نظیر (WebRTC) به علت محدودیت شبکه یا فایروال برقرار نشد. طبق سیاست امنیتی، استفاده از TURN Relay به‌صورت پیش‌فرض غیرفعال است.'
        );
      } else if (state === 'disconnected' || state === 'closed') {
        this.handleUnexpectedDisconnect('اتصال مستقیم بین دو دستگاه قطع شد.');
      }
    };
  }

  private handleUnexpectedDisconnect(reason: string): void {
    if (this.incomingBuffer) {
      const interruptedPkgId = this.incomingBuffer.packageId;
      this.incomingBuffer = null;
      this.callbacks.onTransferInterrupted(
        interruptedPkgId,
        `قطع ارتباط در حین انتقال (${reason})؛ بسته ناقص حذف شد و هیچ رکوردی ثبت نگردید.`
      );
    }
    this.callbacks.onStatusChange('disconnected', reason);
  }

  private armDirectConnectionTimeout(): void {
    this.clearConnectionTimeout();
    if (typeof window !== 'undefined') {
      this.connectionTimeoutId = window.setTimeout(() => {
        if (!this.isConnected()) {
          this.callbacks.onStatusChange(
            'connection-error',
            'مهلت برقراری اتصال مستقیم به پایان رسید. اگر هر دو دستگاه پشت فایروال محدود هستند، اتصال بدون سرور واسط (TURN) امکان‌پذیر نیست.'
          );
        }
      }, 60000);
    }
  }

  private clearConnectionTimeout(): void {
    if (this.connectionTimeoutId !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = null;
    }
  }

  public closeConnection(notify = true): void {
    this.clearConnectionTimeout();
    if (this.unsubscribeSignaling) {
      this.unsubscribeSignaling();
      this.unsubscribeSignaling = null;
    }
    if (this.activeSessionId) {
      void cleanupSignalingSession(this.activeSessionId);
      this.activeSessionId = '';
    }
    if (this.dataChannel) {
      try {
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
      this.callbacks.onStatusChange('disconnected', 'اتصال مستقیم پایان یافت و اطلاعات جلسه موقت پاک شد.');
    }
  }
}
