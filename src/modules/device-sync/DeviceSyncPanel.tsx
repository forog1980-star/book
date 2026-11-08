import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Camera,
  CheckCircle2,
  Copy,
  DatabaseBackup,
  Download,
  Laptop,
  Lock,
  QrCode,
  RotateCcw,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  Wifi,
  XCircle,
} from 'lucide-react';
import {
  FieldAuditRecord,
  LEVELS,
  ShelfCode,
  ShelfLevelCode,
  SHELVES,
  toPersianDigits,
} from '../../data/markazAsnadData';
import {
  applyConflictChoiceToItem,
  areAllConflictsResolved,
} from './conflictResolver';
import {
  LaptopInitiatedSessionCredentials,
  maskSessionIdForDisplay,
} from './pairingService';
import { DirectWebRtcSessionManager } from './peerConnection';
import {
  applyApprovedSyncReport,
  createSyncTransferPackage,
  executeDurableSyncPackageApplication,
  extractLocalEnvelopesMap,
  isStrictValidTransferAck,
  markPackageSentInBaseline,
  restoreRecordIntoDataset,
} from './syncEngine';
import {
  appendTransferHistory,
  getOrCreateLocalDeviceId,
  getSavedDeviceRole,
  hydrateSyncMetadataFromStorage,
  loadSoftDeletedArchive,
  loadTransferHistory,
  saveDeviceRole,
  SyncMetadataSnapshot,
} from './syncStorage';
import {
  ConflictResolutionChoice,
  CONNECTION_STATUS_LABELS,
  ConnectionUiStatus,
  DeviceSyncRole,
  OperationalSyncDataset,
  SYNC_COLLECTION_LABELS,
  SyncCollectionName,
  SyncConflictItem,
  SyncPreviewReport,
  SyncRecordEnvelope,
  SyncTransferPackage,
  TransferHistoryEntry,
} from './types';

export interface DeviceSyncPanelProps {
  dataset: OperationalSyncDataset;
  onApplySyncedDataset: (
    nextDataset: OperationalSyncDataset,
    summaryMessage: string,
    syncMetadata?: SyncMetadataSnapshot
  ) =>
    | Promise<
        | boolean
        | { ok: boolean; idbSaved?: boolean; metadataSavedInBatch?: boolean; error?: string }
        | void
      >
    | boolean
    | { ok: boolean; idbSaved?: boolean; metadataSavedInBatch?: boolean; error?: string }
    | void;
  onTriggerLocalBackup?: () => void;
}

function countDatasetRecords(ds: OperationalSyncDataset): {
  auditCount: number;
  totalCount: number;
} {
  const auditCount = Object.keys(ds.auditRecords || {}).length;
  const totalCount =
    auditCount +
    (ds.bookCopies?.length || 0) +
    (ds.customMartyrs?.length || 0) +
    (ds.links?.length || 0) +
    (ds.pendingReviews?.length || 0);
  return { auditCount, totalCount };
}

export interface LastSyncBreakdown {
  packageId: string;
  newCount: number;
  unchangedCount: number;
  modifiedCount: number;
  conflictCount: number;
  timestampMs: number;
}

export const DeviceSyncPanel: React.FC<DeviceSyncPanelProps> = ({
  dataset,
  onApplySyncedDataset,
  onTriggerLocalBackup,
}) => {
  const [localDeviceId] = useState<string>(() => getOrCreateLocalDeviceId());
  const [localRole, setLocalRole] = useState<DeviceSyncRole>(() => getSavedDeviceRole());
  const [status, setStatus] = useState<ConnectionUiStatus>('ready');
  const [statusMessage, setStatusMessage] = useState<string>(
    'آماده اتصال مستقیم با QR Code: هر یک از دو دستگاه (گوشی یا لپ‌تاپ) می‌تواند QR تولید کند و دستگاه دیگر با اسکن آن مستقیماً متصل شده و همگام‌سازی خودکار دوطرفه را آغاز می‌کند.'
  );

  // وضعیت نشست آغازشده در دستگاه میزبان (گوشی یا لپ‌تاپ)
  const [laptopSessionCreds, setLaptopSessionCreds] =
    useState<LaptopInitiatedSessionCredentials | null>(null);

  // وضعیت اسکن یا ورود توکن QR در دستگاه دوم
  const [scannedQrInput, setScannedQrInput] = useState<string>('');
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string>('');

  const [peerDeviceInfo, setPeerDeviceInfo] = useState<{
    deviceId: string;
    role: DeviceSyncRole;
  } | null>(null);
  const [signalingCleanedSessionId, setSignalingCleanedSessionId] = useState<string>('');

  // شمارنده‌های نشست فعلی طبق بخش ۲ و ۶ دستور اجرایی
  const [sessionSentRecordsCount, setSessionSentRecordsCount] = useState<number>(0);
  const [sessionReceivedRecordsCount, setSessionReceivedRecordsCount] = useState<number>(0);

  // شمارنده‌های قبل و بعد از همگام‌سازی برای تست واقعی دو دستگاه (بخش ۶)
  const [localPreSyncCounts, setLocalPreSyncCounts] = useState<{
    auditCount: number;
    totalCount: number;
  } | null>(null);
  const [peerPreSyncCounts, setPeerPreSyncCounts] = useState<{
    auditCount: number;
    totalCount: number;
  } | null>(null);
  const [peerPostSyncCounts, setPeerPostSyncCounts] = useState<{
    auditCount: number;
    totalCount: number;
  } | null>(null);
  const [lastSyncBreakdown, setLastSyncBreakdown] = useState<LastSyncBreakdown | null>(
    null
  );
  const [lastBaselineAckPackageId, setLastBaselineAckPackageId] = useState<string>('');

  const [selectedCollections, setSelectedCollections] = useState<SyncCollectionName[]>([
    'auditRecords',
    'bookCopies',
    'customMartyrs',
    'links',
    'pendingReviews',
  ]);
  const [filterOnlySelectedBooks, setFilterOnlySelectedBooks] = useState<boolean>(false);
  const [selectedBookKeys, setSelectedBookKeys] = useState<string[]>([]);

  const [transferProgress, setTransferProgress] = useState<{
    packageId: string;
    received: number;
    total: number;
  } | null>(null);

  // در صورت وجود تعارض واقعی، هر دو نسخه (گوشی و لپ‌تاپ) در این گزارش نگهداری می‌شوند تا کاربر هر زمان بخواهد یکی را انتخاب کند
  const [pendingPreviewReport, setPendingPreviewReport] = useState<SyncPreviewReport | null>(
    null
  );
  const [editingConflictId, setEditingConflictId] = useState<string | null>(null);
  const [manualEditDraft, setManualEditDraft] = useState<Partial<FieldAuditRecord>>({});

  const [transferHistory, setTransferHistory] = useState<TransferHistoryEntry[]>(() =>
    loadTransferHistory()
  );
  const [softDeletedArchive, setSoftDeletedArchive] = useState<
    Record<string, SyncRecordEnvelope>
  >(() => loadSoftDeletedArchive());

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const datasetRef = useRef<OperationalSyncDataset>(dataset);
  useEffect(() => {
    datasetRef.current = dataset;
  }, [dataset]);

  const roleRef = useRef<DeviceSyncRole>(localRole);
  useEffect(() => {
    roleRef.current = localRole;
  }, [localRole]);

  const selectedCollectionsRef = useRef<SyncCollectionName[]>(selectedCollections);
  useEffect(() => {
    selectedCollectionsRef.current = selectedCollections;
  }, [selectedCollections]);

  const onApplySyncedDatasetRef = useRef(onApplySyncedDataset);
  useEffect(() => {
    onApplySyncedDatasetRef.current = onApplySyncedDataset;
  }, [onApplySyncedDataset]);

  // نگهداری بسته‌های ارسال‌شده که هنوز ACK اعمال واقعی از دستگاه مقصد دریافت نکرده‌اند (بخش ۵ دستور اجرایی)
  const pendingSentPackagesRef = useRef<Map<string, SyncTransferPackage>>(new Map());

  const sessionManagerRef = useRef<DirectWebRtcSessionManager | null>(null);

  const stopCameraScanner = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (cameraStreamRef.current) {
      for (const track of cameraStreamRef.current.getTracks()) {
        track.stop();
      }
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraScannerOpen(false);
  }, []);

  // دانلود مستقیم فایل پشتیبان JSON روی دستگاه فعلی (بخش ۶ دستور اجرایی)
  const handleDownloadLocalJsonBackup = useCallback(() => {
    try {
      const currentCounts = countDatasetRecords(datasetRef.current);
      const backupPayload = {
        backupSchema: 'markaz-asnad-device-sync-backup-v1',
        exportedAtIso: new Date().toISOString(),
        deviceId: localDeviceId,
        deviceRole: roleRef.current,
        counts: currentCounts,
        dataset: datasetRef.current,
      };
      const jsonText = JSON.stringify(backupPayload, null, 2);
      const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const roleSlug = roleRef.current === 'phone-primary' ? 'phone' : 'laptop';
      const dateSlug = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `markaz-asnad-backup-${roleSlug}-${dateSlug}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (onTriggerLocalBackup) {
        onTriggerLocalBackup();
      }
    } catch {
      if (onTriggerLocalBackup) {
        onTriggerLocalBackup();
      }
    }
  }, [localDeviceId, onTriggerLocalBackup]);

  // ارسال بسته همگام‌سازی در نشست فعال (به‌صورت خودکار پس از اتصال و یا دستی)
  // طبق بخش ۵ دستور اجرایی: Baseline در این لحظه به‌روز نمی‌شود؛ بلکه فقط پس از دریافت TRANSFER_ACK اعمال واقعی به‌روز می‌گردد.
  const sendSyncPackageOverOpenChannel = useCallback(
    async (isAutoBidirectional = false) => {
      const mgr = sessionManagerRef.current;
      if (!mgr || !mgr.isConnected()) {
        if (!isAutoBidirectional) {
          setStatus('connection-error');
          setStatusMessage('ابتدا اتصال مستقیم بین گوشی و لپ‌تاپ را با QR Code برقرار نمایید.');
        }
        return;
      }

      try {
        setLocalPreSyncCounts((prev) => prev ?? countDatasetRecords(datasetRef.current));

        const pkg = createSyncTransferPackage({
          dataset: datasetRef.current,
          localDeviceId,
          localRole: roleRef.current,
          selectedCollections: selectedCollectionsRef.current,
          onlyRecordKeys:
            !isAutoBidirectional && filterOnlySelectedBooks && selectedBookKeys.length > 0
              ? selectedBookKeys
              : undefined,
        });

        pendingSentPackagesRef.current.set(pkg.packageId, pkg);
        await mgr.sendTransferPackage(pkg);
        setSessionSentRecordsCount((prev) => prev + pkg.recordCount);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus('connection-error');
        setStatusMessage(`خطا در ارسال بسته همگام‌سازی: ${msg}`);
      }
    },
    [filterOnlySelectedBooks, localDeviceId, selectedBookKeys]
  );

  useEffect(() => {
    void hydrateSyncMetadataFromStorage();
    const mgr = new DirectWebRtcSessionManager(localDeviceId, roleRef.current, {
      getLocalPreSyncCounts: () => countDatasetRecords(datasetRef.current),
      onStatusChange: (nextStatus, detail) => {
        setStatus(nextStatus);
        if (detail) {
          setStatusMessage(detail);
        }
        if (nextStatus === 'disconnected' || nextStatus === 'connection-error') {
          setTransferProgress(null);
          setLaptopSessionCreds(null);
        }
      },
      onPeerHandshake: (peerId, peerRole, peerPreCounts) => {
        setPeerDeviceInfo({ deviceId: peerId, role: peerRole });
        if (peerPreCounts) {
          setPeerPreSyncCounts((prev) => prev ?? peerPreCounts);
        }
      },
      onChannelReadyForAutoSync: () => {
        setLocalPreSyncCounts((prev) => prev ?? countDatasetRecords(datasetRef.current));
        // به محض برقراری اتصال WebRTC، همگام‌سازی خودکار دوطرفه بدون نیاز به تأیید دستی جداگانه آغاز می‌شود
        void sendSyncPackageOverOpenChannel(true);
      },
      onTransferProgress: (packageId, received, total) => {
        setTransferProgress({ packageId, received, total });
      },
      onPackageReceived: async (pkg: SyncTransferPackage) => {
        setTransferProgress(null);
        setSessionReceivedRecordsCount((prev) => prev + pkg.recordCount);
        setLocalPreSyncCounts((prev) => prev ?? countDatasetRecords(datasetRef.current));

        const buildSummaryText = (
          appliedNewCount: number,
          appliedModifiedCount: number,
          unchangedCount: number,
          conflictCount: number
        ) =>
          appliedNewCount > 0 || appliedModifiedCount > 0 || conflictCount > 0
            ? `همگام‌سازی خودکار انجام شد: ${toPersianDigits(
                appliedNewCount
              )} رکورد جدید اضافه شد، ${toPersianDigits(
                appliedModifiedCount
              )} رکورد تغییرکرده/تکمیلی ادغام شد، ${toPersianDigits(
                unchangedCount
              )} رکورد تکراری نادیده گرفته شد و ${toPersianDigits(
                conflictCount
              )} مورد تعارض ثبت گردید.`
            : `همگام‌سازی خودکار کامل شد: تمام ${toPersianDigits(
                unchangedCount
              )} رکورد مشترک یکسان بودند و هیچ رکورد تکراری ایجاد نشد.`;

        // اجرای ترتیب قطعی ۷ مرحله‌ای: تحلیل غیراخلال‌گر -> اعمال -> ذخیره پایدار در مقصد -> تأیید ذخیره -> ارسال TRANSFER_ACK
        const appResult = await executeDurableSyncPackageApplication({
          pkg,
          currentDataset: datasetRef.current,
          localDeviceId,
          localRole: roleRef.current,
          onPersistDataset: (nextDs, summary, syncMeta) =>
            onApplySyncedDatasetRef.current(nextDs, summary, syncMeta),
          buildSummaryMessage: (counts) =>
            buildSummaryText(
              counts.appliedNewCount,
              counts.appliedModifiedCount,
              counts.unchangedCount,
              counts.conflictCount
            ),
        });

        if (!appResult.ok || appResult.applied !== true) {
          const errText =
            appResult.ok === false
              ? appResult.error
              : 'خطا در ذخیره پایدار بسته در دستگاه مقصد؛ تأییدیه اعمال ارسال نشد.';
          const updatedFailedHist = appendTransferHistory({
            packageId: pkg.packageId,
            direction: 'received',
            peerRole: pkg.senderRole,
            timestampMs: Date.now(),
            status: 'failed-interrupted',
            recordsCount: pkg.recordCount,
            appliedNew: 0,
            appliedModified: 0,
            resolvedConflicts: 0,
            errorDetails: errText,
          });
          setTransferHistory(updatedFailedHist);
          setStatus('connection-error');
          setStatusMessage(errText);
          mgr.sendPackageAppliedAck({
            packageId: pkg.packageId,
            ok: false,
            applied: false,
            error: errText,
          });
          return;
        }

        const {
          report,
          nextDataset,
          appliedNewCount,
          appliedModifiedCount,
          unchangedCount,
          resolvedConflictCount,
          summaryMessage: summaryText,
          ackMessage,
        } = appResult;

        // به‌روزرسانی مرجع داده محلی تنها پس از اطمینان از ذخیره پایدار
        datasetRef.current = nextDataset;

        // مرحله ۶: ارسال تأییدیه رسمی دریافت، اعمال و ذخیره پایدار (TRANSFER_ACK با ok: true و applied: true)
        mgr.sendPackageAppliedAck(ackMessage);

        setLastSyncBreakdown({
          packageId: pkg.packageId,
          newCount: appliedNewCount,
          unchangedCount: unchangedCount,
          modifiedCount: appliedModifiedCount,
          conflictCount: report.conflicts.length,
          timestampMs: Date.now(),
        });

        const updatedHist = appendTransferHistory({
          packageId: report.packageId,
          direction: 'received',
          peerRole: report.senderRole,
          timestampMs: Date.now(),
          status: 'completed',
          recordsCount: pkg.recordCount,
          appliedNew: appliedNewCount,
          appliedModified: appliedModifiedCount,
          resolvedConflicts: resolvedConflictCount,
        });
        setTransferHistory(updatedHist);
        setSoftDeletedArchive(loadSoftDeletedArchive());

        // در صورت وجود تعارض واقعی یا هم‌عنوان مبهم، هر دو نسخه در بخش تعارض‌ها ثبت و نمایش داده می‌شوند تا هیچ داده‌ای بازنویسی کورکورانه نشود
        if (report.conflicts.length > 0) {
          setPendingPreviewReport({
            ...report,
            newItems: [],
            modifiedItems: [],
            softDeleteItems: [],
            conflicts: report.conflicts,
          });
        } else {
          setPendingPreviewReport(null);
        }

        setStatus('transfer-success');
        setStatusMessage(summaryText);
      },
      onPackageAckReceived: (ack) => {
        // اصلاح اول: شرط پذیرش ACK و به‌روزرسانی Baseline باید صراحتاً ack.ok === true && ack.applied === true باشد
        if (ack.ok === true && ack.applied === true && isStrictValidTransferAck(ack)) {
          const sentPkg = pendingSentPackagesRef.current.get(ack.packageId);
          if (sentPkg) {
            const baselineUpdated = markPackageSentInBaseline(sentPkg, ack);
            if (baselineUpdated) {
              pendingSentPackagesRef.current.delete(ack.packageId);
              setLastBaselineAckPackageId(ack.packageId);

              const updatedHist = appendTransferHistory({
                packageId: sentPkg.packageId,
                direction: 'sent',
                peerRole:
                  roleRef.current === 'phone-primary' ? 'pc-companion' : 'phone-primary',
                timestampMs: Date.now(),
                status: 'completed',
                recordsCount: sentPkg.recordCount,
                appliedNew: ack.appliedNewCount ?? 0,
                appliedModified: ack.appliedModifiedCount ?? 0,
                resolvedConflicts: 0,
              });
              setTransferHistory(updatedHist);
            }
          }
          if (
            typeof ack.receiverPostAuditCount === 'number' &&
            typeof ack.receiverPostTotalCount === 'number'
          ) {
            setPeerPostSyncCounts({
              auditCount: ack.receiverPostAuditCount,
              totalCount: ack.receiverPostTotalCount,
            });
          }
        }
      },
      onTransferInterrupted: (packageId, reason) => {
        setTransferProgress(null);
        const wasPendingSent = pendingSentPackagesRef.current.has(packageId);
        // بسته ناقص از صف انتظار حذف می‌شود بدون اینکه Baseline به‌روز شود
        pendingSentPackagesRef.current.delete(packageId);

        const updatedHist = appendTransferHistory({
          packageId,
          direction: wasPendingSent ? 'sent' : 'received',
          peerRole: roleRef.current === 'phone-primary' ? 'pc-companion' : 'phone-primary',
          timestampMs: Date.now(),
          status: 'failed-interrupted',
          recordsCount: 0,
          appliedNew: 0,
          appliedModified: 0,
          resolvedConflicts: 0,
          errorDetails: reason,
        });
        setTransferHistory(updatedHist);
      },
      onSignalCleanedUp: (cleanedSessionId) => {
        setSignalingCleanedSessionId(cleanedSessionId);
      },
    });
    sessionManagerRef.current = mgr;

    return () => {
      stopCameraScanner();
      mgr.dispose();
    };
  }, [localDeviceId, sendSyncPackageOverOpenChannel, stopCameraScanner]);

  const handleRoleChange = (nextRole: DeviceSyncRole) => {
    setLocalRole(nextRole);
    saveDeviceRole(nextRole);
    if (sessionManagerRef.current) {
      sessionManagerRef.current.setLocalRole(nextRole);
    }
  };

  // تولید QR Code در هر یک از دو دستگاه (گوشی یا لپ‌تاپ)
  const handleStartLaptopSession = async () => {
    try {
      setSignalingCleanedSessionId('');
      setSessionSentRecordsCount(0);
      setSessionReceivedRecordsCount(0);
      setLocalPreSyncCounts(countDatasetRecords(datasetRef.current));
      setPeerPreSyncCounts(null);
      setPeerPostSyncCounts(null);
      if (sessionManagerRef.current) {
        const creds = await sessionManagerRef.current.startLaptopInitiatorSession();
        setLaptopSessionCreds(creds);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus('connection-error');
      setStatusMessage(`خطا در ایجاد نشست و تولید QR Code: ${msg}`);
    }
  };

  // اسکن یا ورود QR Code در دستگاه دیگر و اتصال مستقیم بدون مرحله تأیید اضافی (بخش ۲ دستور اجرایی)
  const handleInspectScannedQrOnPhone = useCallback(
    async (rawQrText: string) => {
      const cleaned = String(rawQrText || '').trim();
      if (!cleaned) {
        setStatus('connection-error');
        setStatusMessage('لطفاً ابتدا QR Code نمایش‌داده‌شده در دستگاه دیگر را اسکن یا وارد کنید.');
        return;
      }
      try {
        stopCameraScanner();
        setSignalingCleanedSessionId('');
        setSessionSentRecordsCount(0);
        setSessionReceivedRecordsCount(0);
        setLocalPreSyncCounts(countDatasetRecords(datasetRef.current));
        setPeerPreSyncCounts(null);
        setPeerPostSyncCounts(null);
        if (sessionManagerRef.current) {
          await sessionManagerRef.current.connectWithScannedQr(cleaned);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus('connection-error');
        setStatusMessage(`خطا در اتصال با QR Code: ${msg}`);
      }
    },
    [stopCameraScanner]
  );

  // باز کردن دوربین برای اسکن مستقیم QR Code
  const handleOpenPhoneCameraScanner = async () => {
    setCameraError('');
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setCameraError(
        'دسترسی به دوربین در این مرورگر پشتیبانی نمی‌شود. می‌توانید رشته QR را در کادر پایین جای‌گذاری کنید.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setIsCameraScannerOpen(true);

      setTimeout(() => {
        if (videoRef.current && cameraStreamRef.current) {
          videoRef.current.srcObject = cameraStreamRef.current;
          void videoRef.current.play().catch(() => {});
        }
      }, 50);

      const BarcodeDetectorCtor = (
        globalThis as unknown as {
          BarcodeDetector?: new (opts: { formats: string[] }) => {
            detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
          };
        }
      ).BarcodeDetector;

      if (BarcodeDetectorCtor) {
        const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
        scanIntervalRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              const rawVal = barcodes[0].rawValue;
              setScannedQrInput(rawVal);
              await handleInspectScannedQrOnPhone(rawVal);
            }
          } catch {
            // ادامه تلاش در فریم بعدی
          }
        }, 350);
      } else {
        setCameraError(
          'مرورگر فعلی فاقد رمزگشای خودکار BarcodeDetector است؛ لطفاً از Chrome اندروید استفاده کنید یا توکن QR را در کادر زیر وارد نمایید.'
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCameraError(`خطا در باز کردن دوربین: ${msg}`);
      stopCameraScanner();
    }
  };

  const handleDisconnect = () => {
    stopCameraScanner();
    if (sessionManagerRef.current) {
      sessionManagerRef.current.closeConnection(true);
    }
    setPeerDeviceInfo(null);
    setLaptopSessionCreds(null);
  };

  const handleCancelPairing = async () => {
    stopCameraScanner();
    if (sessionManagerRef.current) {
      await sessionManagerRef.current.cancelPairing();
    }
    setPeerDeviceInfo(null);
    setLaptopSessionCreds(null);
  };

  // انتخاب تصمیم کاربر برای هر تعارض ثبت‌شده
  const handleSelectConflictResolution = (
    conflict: SyncConflictItem,
    choice: ConflictResolutionChoice
  ) => {
    if (!pendingPreviewReport) return;

    if (choice === 'manual-edit') {
      const baseData = (conflict.phoneEnvelope.data || {}) as FieldAuditRecord;
      setEditingConflictId(conflict.conflictId);
      setManualEditDraft({ ...baseData });
    } else {
      setEditingConflictId(null);
    }

    const nextConflicts = pendingPreviewReport.conflicts.map((c) =>
      c.conflictId === conflict.conflictId
        ? applyConflictChoiceToItem(c, choice, c.manualEditedData)
        : c
    );
    setPendingPreviewReport({
      ...pendingPreviewReport,
      conflicts: nextConflicts,
    });
  };

  const handleSaveManualConflictEdit = (conflict: SyncConflictItem) => {
    if (!pendingPreviewReport) return;
    const baseData = (conflict.phoneEnvelope.data || {}) as FieldAuditRecord;
    const mergedManual: FieldAuditRecord = {
      ...baseData,
      ...manualEditDraft,
      location:
        manualEditDraft.shelf && manualEditDraft.level
          ? `${manualEditDraft.shelf}-${manualEditDraft.level}`
          : baseData.location,
    };

    const nextConflicts = pendingPreviewReport.conflicts.map((c) =>
      c.conflictId === conflict.conflictId
        ? applyConflictChoiceToItem(c, 'manual-edit', mergedManual)
        : c
    );
    setPendingPreviewReport({
      ...pendingPreviewReport,
      conflicts: nextConflicts,
    });
    setEditingConflictId(null);
  };

  // اعمال تصمیم کاربر برای تعارض‌های ثبت‌شده پس از اطمینان از ذخیره پایدار و هماهنگ
  const handleConfirmAndApplyPreview = async () => {
    if (!pendingPreviewReport) return;
    if (!areAllConflictsResolved(pendingPreviewReport.conflicts)) {
      return;
    }

    const result = applyApprovedSyncReport(
      pendingPreviewReport,
      datasetRef.current,
      localDeviceId,
      localRole,
      { deferMetadataCommit: true }
    );

    const summaryText = `تصمیم شما برای ${toPersianDigits(
      result.resolvedConflictCount
    )} مورد تعارض اعمال شد.`;

    const persistRes = await onApplySyncedDataset(
      result.nextDataset,
      summaryText,
      result.pendingMetadata
    );
    if (
      persistRes === false ||
      (persistRes && typeof persistRes === 'object' && 'ok' in persistRes && persistRes.ok !== true)
    ) {
      const errText =
        persistRes && typeof persistRes === 'object' && 'error' in persistRes && persistRes.error
          ? persistRes.error
          : 'خطا در ذخیره پایدار تصمیم تعارض‌ها؛ هیچ داده‌ای تغییر نکرد.';
      setStatus('connection-error');
      setStatusMessage(errText);
      return;
    }

    const metadataSavedInBatch = Boolean(
      persistRes &&
        typeof persistRes === 'object' &&
        'metadataSavedInBatch' in persistRes &&
        (persistRes as { metadataSavedInBatch?: boolean }).metadataSavedInBatch === true
    );
    if (!metadataSavedInBatch) {
      const metaRes = await result.commitMetadata();
      if (!metaRes.ok || !metaRes.idbSaved) {
        const errText =
          metaRes.error || 'خطا در ذخیره پایدار متادیتای همگام‌سازی در IndexedDB.';
        setStatus('connection-error');
        setStatusMessage(errText);
        return;
      }
    }
    datasetRef.current = result.nextDataset;
    setPendingPreviewReport(null);
    setStatusMessage(summaryText);
  };

  const handleRejectIncomingPreview = () => {
    if (!pendingPreviewReport) return;
    setPendingPreviewReport(null);
  };

  const handleRestoreSoftDeleted = (compKey: string) => {
    const result = restoreRecordIntoDataset(
      compKey,
      dataset,
      localDeviceId,
      localRole
    );
    if (!result.restored || !result.restoredEnvelope) return;
    setSoftDeletedArchive(loadSoftDeletedArchive());

    const colLabel = SYNC_COLLECTION_LABELS[result.restoredEnvelope.meta.collection];
    onApplySyncedDataset(
      result.nextDataset,
      `رکورد «${result.restoredEnvelope.titleSummary}» (${colLabel}) با موفقیت از بایگانی حذف نرم به مجموعه اصلی بازیابی شد.`
    );
  };

  const currentLocalCounts = useMemo(() => countDatasetRecords(dataset), [dataset]);

  const localEnvelopesCount = useMemo(() => {
    return extractLocalEnvelopesMap(
      dataset,
      localDeviceId,
      localRole,
      selectedCollections
    ).size;
  }, [dataset, localDeviceId, localRole, selectedCollections]);

  const auditEntriesList = useMemo(() => {
    return Object.values(dataset.auditRecords || {});
  }, [dataset.auditRecords]);

  const activeConflictsCount = useMemo(() => {
    if (!pendingPreviewReport) return 0;
    return pendingPreviewReport.conflicts.length;
  }, [pendingPreviewReport]);

  const toggleCollectionSelection = (col: SyncCollectionName) => {
    setSelectedCollections((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const statusBadgeStyle: Record<ConnectionUiStatus, string> = {
    ready: 'bg-slate-100 text-slate-800 border-slate-300',
    pairing: 'bg-amber-100 text-amber-950 border-amber-400',
    connecting: 'bg-amber-100 text-amber-950 border-amber-400',
    connected: 'bg-emerald-100 text-emerald-950 border-emerald-400',
    transferring: 'bg-blue-100 text-blue-950 border-blue-400',
    'transfer-success': 'bg-emerald-100 text-emerald-950 border-emerald-500',
    'connection-error': 'bg-rose-100 text-rose-950 border-rose-400',
    disconnected: 'bg-slate-200 text-slate-800 border-slate-400',
  };

  return (
    <section
      aria-label="ارتباط گوشی و لپ‌تاپ"
      className="bg-white rounded-2xl border-2 border-[#D9C2A7] shadow-xs p-4 sm:p-6 space-y-5"
    >
      {/* هدر بخش مستقل ارتباط گوشی و لپ‌تاپ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[#E6D5C1]">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <ArrowLeftRight className="w-5 h-5 text-[#8C3B2B] shrink-0" />
            <h2 className="font-titr text-base sm:text-lg font-bold text-[#332218]">
              همگام‌سازی مستقیم گوشی و لپ‌تاپ با QR Code (WebRTC DataChannel بدون ذخیره در ابر)
            </h2>
          </div>
          <p className="text-xs text-[#6E5849] leading-relaxed">
            هر یک از دو دستگاه (گوشی یا لپ‌تاپ) می‌تواند QR Code تولید کند و دستگاه دیگر با اسکن آن مستقیماً متصل می‌شود. به محض اتصال، همگام‌سازی دوطرفه به‌طور خودکار انجام می‌شود: رکوردهای جدید اضافه می‌شوند، تغییرات تکمیلی ادغام می‌گردند، هیچ رکوردی حذف نمی‌شود و در صورت وجود تعارض واقعی هر دو نسخه برای انتخاب شما حفظ می‌شوند.
          </p>
        </div>

        {/* نشانگر وضعیت اتصال */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            data-testid="device-sync-status-badge"
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 ${statusBadgeStyle[status]}`}
          >
            <Wifi className="w-3.5 h-3.5 shrink-0" />
            <span>وضعیت: {CONNECTION_STATUS_LABELS[status]}</span>
          </span>
        </div>
      </div>

      {/* پیام وضعیت فعلی و تأیید پاک‌سازی Signaling و ACK */}
      <div className="rounded-xl bg-[#FDF8F2] border border-[#E6D5C1] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#4A3525]">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#2E6F40] shrink-0" />
          <span className="font-medium leading-relaxed">{statusMessage}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {lastBaselineAckPackageId && (
            <span
              data-testid="baseline-ack-badge"
              className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-300 text-blue-900 font-bold text-[11px]"
            >
              تأیید اعمال بسته ({lastBaselineAckPackageId}) دریافت و Baseline به‌روز شد
            </span>
          )}
          {signalingCleanedSessionId && (
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold text-[11px]">
              نشست موقت Signaling ({maskSessionIdForDisplay(signalingCleanedSessionId)}) پاک‌سازی شد
            </span>
          )}
        </div>
      </div>

      {/* خلاصه آماری وضعیت انتقال در نشست فعلی (بخش ۲ دستور اجرایی) */}
      <div
        data-testid="sync-session-metrics"
        className="grid grid-cols-2 sm:grid-cols-4 gap-2.5"
      >
        <div className="p-3 rounded-xl bg-[#FAF3EA] border border-[#E6D5C1]">
          <div className="text-[11px] text-[#6E5849]">وضعیت اتصال</div>
          <div className="text-xs sm:text-sm font-extrabold text-[#332218] mt-0.5">
            {CONNECTION_STATUS_LABELS[status]}
          </div>
        </div>
        <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
          <div className="text-[11px] text-emerald-900">تعداد رکوردهای ارسال‌شده</div>
          <div
            data-testid="session-sent-count"
            className="text-sm sm:text-base font-extrabold text-emerald-950 mt-0.5"
          >
            {toPersianDigits(sessionSentRecordsCount)} رکورد
          </div>
        </div>
        <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200">
          <div className="text-[11px] text-blue-900">تعداد رکوردهای دریافت‌شده</div>
          <div
            data-testid="session-received-count"
            className="text-sm sm:text-base font-extrabold text-blue-950 mt-0.5"
          >
            {toPersianDigits(sessionReceivedRecordsCount)} رکورد
          </div>
        </div>
        <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-300">
          <div className="text-[11px] text-amber-900">تعداد تعارض‌ها</div>
          <div
            data-testid="session-review-count"
            className="text-sm sm:text-base font-extrabold text-amber-950 mt-0.5"
          >
            {toPersianDigits(activeConflictsCount)} مورد
          </div>
        </div>
      </div>

      {/* پنل آماده‌سازی و پایش تست واقعی دو دستگاه (بخش ۶ دستور اجرایی) */}
      <div
        data-testid="two-device-test-readiness-box"
        className="rounded-2xl border-2 border-[#D9C2A7] bg-[#FAF3EA]/70 p-4 space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-[#E6D5C1]">
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-[#332218] flex items-center gap-1.5">
              <DatabaseBackup className="w-4 h-4 text-[#8C3B2B]" />
              <span>وضعیت موجودی قبل و بعد از همگام‌سازی و پشتیبان‌گیری JSON (ویژه تست واقعی دو دستگاه)</span>
            </h3>
            <p className="text-[11px] text-[#6E5849] mt-0.5">
              شمارش زنده رکوردها بر اساس داده‌های واقعی موجود در حافظه هر دستگاه (بدون عدد ثابت فرضی). پیش از شروع تست واقعی، نسخه پشتیبان JSON هر دو دستگاه را دانلود کنید.
            </p>
          </div>
          <button
            type="button"
            data-testid="download-json-backup-btn"
            onClick={handleDownloadLocalJsonBackup}
            className="px-3.5 py-2 rounded-xl bg-[#2E6F40] hover:bg-[#235732] text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>دانلود پشتیبان JSON این دستگاه</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {/* موجودی این دستگاه قبل و بعد از Sync */}
          <div className="p-3 rounded-xl bg-white border border-[#E6D5C1] space-y-1.5">
            <div className="font-bold text-[#332218]">
              ۱. موجودی این دستگاه ({localRole === 'phone-primary' ? 'گوشی اصلی' : 'لپ‌تاپ همراه'}):
            </div>
            <div className="flex items-center justify-between text-[11px] text-[#6E5849]">
              <span>قبل از شروع همگام‌سازی:</span>
              <strong data-testid="local-pre-sync-count" className="text-[#332218]">
                {toPersianDigits(
                  (localPreSyncCounts ?? currentLocalCounts).auditCount
                )}{' '}
                کتاب قفسه ({toPersianDigits((localPreSyncCounts ?? currentLocalCounts).totalCount)} کل رکوردها)
              </strong>
            </div>
            <div className="flex items-center justify-between text-[11px] text-[#2E6F40]">
              <span>وضعیت فعلی / پس از همگام‌سازی:</span>
              <strong data-testid="local-post-sync-count" className="text-[#2E6F40]">
                {toPersianDigits(currentLocalCounts.auditCount)} کتاب قفسه (
                {toPersianDigits(currentLocalCounts.totalCount)} کل رکوردها)
              </strong>
            </div>
          </div>

          {/* موجودی دستگاه مقابل قبل و بعد از Sync */}
          <div className="p-3 rounded-xl bg-white border border-[#E6D5C1] space-y-1.5">
            <div className="font-bold text-[#332218]">
              ۲. موجودی دستگاه مقابل ({localRole === 'phone-primary' ? 'لپ‌تاپ همراه' : 'گوشی اصلی'}):
            </div>
            <div className="flex items-center justify-between text-[11px] text-[#6E5849]">
              <span>قبل از شروع همگام‌سازی:</span>
              <strong data-testid="peer-pre-sync-count" className="text-[#332218]">
                {peerPreSyncCounts
                  ? `${toPersianDigits(peerPreSyncCounts.auditCount)} کتاب قفسه (${toPersianDigits(
                      peerPreSyncCounts.totalCount
                    )} کل رکوردها)`
                  : 'پس از اتصال نمایش داده می‌شود'}
              </strong>
            </div>
            <div className="flex items-center justify-between text-[11px] text-[#2E6F40]">
              <span>پس از اعمال همگام‌سازی (ACK):</span>
              <strong data-testid="peer-post-sync-count" className="text-[#2E6F40]">
                {peerPostSyncCounts
                  ? `${toPersianDigits(peerPostSyncCounts.auditCount)} کتاب قفسه (${toPersianDigits(
                      peerPostSyncCounts.totalCount
                    )} کل رکوردها)`
                  : peerPreSyncCounts
                  ? `${toPersianDigits(peerPreSyncCounts.auditCount)} کتاب قفسه`
                  : '—'}
              </strong>
            </div>
          </div>

          {/* تفکیک دقیق نتیجه آخرین همگام‌سازی (جدید، تکراری، تغییرکرده، دارای تعارض) */}
          <div className="p-3 rounded-xl bg-white border border-[#E6D5C1] space-y-1.5">
            <div className="font-bold text-[#332218]">
              ۳. تفکیک رکوردهای آخرین بسته دریافتی:
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <div className="px-2 py-1 rounded bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                <span className="text-emerald-900">جدید:</span>
                <strong data-testid="breakdown-new-count" className="text-emerald-950">
                  {toPersianDigits(lastSyncBreakdown?.newCount ?? 0)}
                </strong>
              </div>
              <div className="px-2 py-1 rounded bg-slate-50 border border-slate-200 flex items-center justify-between">
                <span className="text-slate-700">تکراری (مشترک):</span>
                <strong data-testid="breakdown-unchanged-count" className="text-slate-900">
                  {toPersianDigits(lastSyncBreakdown?.unchangedCount ?? 0)}
                </strong>
              </div>
              <div className="px-2 py-1 rounded bg-blue-50 border border-blue-200 flex items-center justify-between">
                <span className="text-blue-900">تغییرکرده (ادغام):</span>
                <strong data-testid="breakdown-modified-count" className="text-blue-950">
                  {toPersianDigits(lastSyncBreakdown?.modifiedCount ?? 0)}
                </strong>
              </div>
              <div className="px-2 py-1 rounded bg-amber-50 border border-amber-200 flex items-center justify-between">
                <span className="text-amber-900">دارای تعارض:</span>
                <strong data-testid="breakdown-conflict-count" className="text-amber-950">
                  {toPersianDigits(lastSyncBreakdown?.conflictCount ?? 0)}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* انتخاب نقش دستگاه فعلی */}
      <div className="rounded-xl border border-[#E6D5C1] bg-[#FAF3EA]/60 p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-[#332218]">نقش این دستگاه در ارتباط:</span>
          <span className="text-[11px] font-mono text-[#6E5849] bg-white px-2 py-0.5 rounded border border-[#E6D5C1]">
            {localDeviceId}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleRoleChange('phone-primary')}
            className={`p-2.5 rounded-xl border text-right transition-colors cursor-pointer flex items-start gap-2 ${
              localRole === 'phone-primary'
                ? 'bg-[#8C3B2B] text-white border-[#702D20] shadow-xs'
                : 'bg-white text-[#332218] border-[#D9C2A7] hover:bg-amber-50/60'
            }`}
          >
            <Smartphone className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold">گوشی اندروید (مرجع اصلی اطلاعات کتابخانه)</div>
              <div
                className={`text-[10px] mt-0.5 leading-snug ${
                  localRole === 'phone-primary' ? 'text-amber-100' : 'text-[#6E5849]'
                }`}
              >
                نگهدارنده اصلی داده‌های کتابخانه با قابلیت تولید یا اسکن QR Code
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleRoleChange('pc-companion')}
            className={`p-2.5 rounded-xl border text-right transition-colors cursor-pointer flex items-start gap-2 ${
              localRole === 'pc-companion'
                ? 'bg-[#8C3B2B] text-white border-[#702D20] shadow-xs'
                : 'bg-white text-[#332218] border-[#D9C2A7] hover:bg-amber-50/60'
            }`}
          >
            <Laptop className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold">لپ‌تاپ (دستگاه همراه و مکمل کاری)</div>
              <div
                className={`text-[10px] mt-0.5 leading-snug ${
                  localRole === 'pc-companion' ? 'text-amber-100' : 'text-[#6E5849]'
                }`}
              >
                محیط مکمل برای جست‌وجو، ورود و ویرایش اطلاعات با قابلیت تولید یا اسکن QR Code
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* اتصال ساده دوطرفه با QR Code (بخش ۲ دستور اجرایی) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* کارت ۱: تولید QR Code در این دستگاه (گوشی یا لپ‌تاپ) */}
        <div className="rounded-2xl border-2 border-[#E6D5C1] bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs sm:text-sm font-bold text-[#332218] flex items-center gap-1.5">
              <QrCode className="w-4 h-4 text-[#8C3B2B]" />
              <span>۱. تولید QR Code در این دستگاه (گوشی یا لپ‌تاپ)</span>
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#FDF8F2] border border-[#E6D5C1] text-[#8C3B2B] font-bold">
              نمایش QR
            </span>
          </div>

          <p className="text-xs text-[#6E5849] leading-relaxed">
            با زدن دکمه زیر، QR Code اتصال در این دستگاه ساخته می‌شود. کافی است آن را با دستگاه دیگر اسکن کنید تا اتصال و همگام‌سازی خودکار دوطرفه بلافاصله انجام شود.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="laptop-start-session-btn"
              onClick={() => void handleStartLaptopSession()}
              className="px-3.5 py-2 rounded-xl bg-[#8C3B2B] hover:bg-[#702D20] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>تولید QR Code برای اتصال</span>
            </button>

            {(status === 'pairing' || status === 'connecting') && laptopSessionCreds && (
              <button
                type="button"
                onClick={() => void handleCancelPairing()}
                className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>لغو و بستن QR</span>
              </button>
            )}
          </div>

          {laptopSessionCreds && (
            <div
              data-testid="laptop-qr-session-box"
              className="rounded-xl bg-[#FDF8F2] border-2 border-[#D9C2A7] p-3.5 space-y-3"
            >
              <div className="flex flex-col items-center justify-center p-3 bg-white rounded-xl border border-[#E6D5C1] gap-2">
                <QRCodeSVG
                  value={laptopSessionCreds.qrValue}
                  size={168}
                  level="M"
                />
                <span className="text-[11px] font-bold text-[#332218]">
                  این QR Code را با دستگاه دیگر اسکن کنید تا همگام‌سازی خودکار آغاز شود
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded-lg bg-white border border-[#E6D5C1]">
                  <span className="text-[#6E5849] block">کد کوتاه نشست:</span>
                  <strong
                    data-testid="generated-pairing-code"
                    dir="ltr"
                    className="font-mono text-xs text-[#332218] select-all"
                  >
                    {laptopSessionCreds.pairingCode}
                  </strong>
                </div>
                <div className="p-2 rounded-lg bg-white border border-[#E6D5C1]">
                  <span className="text-[#6E5849] block">شناسه تصادفی نشست:</span>
                  <strong
                    dir="ltr"
                    className="font-mono text-xs text-[#332218]"
                  >
                    {maskSessionIdForDisplay(laptopSessionCreds.sessionId)}
                  </strong>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[10px] text-[#6E5849]">
                  یک‌بارمصرف و زمان‌دار (۱۰ دقیقه) · اتصال و همگام‌سازی فوری به محض اسکن
                </span>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      void navigator.clipboard.writeText(laptopSessionCreds.qrValue);
                    } catch {
                      // ignore
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white border border-[#D9C2A7] text-[11px] font-bold text-[#8C3B2B] inline-flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>کپی توکن QR</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* کارت ۲: اسکن QR Code دستگاه دیگر و اتصال مستقیم */}
        <div className="rounded-2xl border-2 border-[#E6D5C1] bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs sm:text-sm font-bold text-[#332218] flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-[#2E6F40]" />
              <span>۲. اسکن QR Code دستگاه دیگر و اتصال مستقیم</span>
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[#2E6F40] font-bold">
              اسکن و اتصال فوری
            </span>
          </div>

          <p className="text-xs text-[#6E5849] leading-relaxed">
            QR Code نمایش‌داده‌شده در دستگاه دیگر را با دوربین اسکن کنید یا توکن آن را در کادر زیر قرار دهید. اسکن QR به‌منزله مجوز اتصال است و همگام‌سازی دوطرفه بلافاصله آغاز می‌شود.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {!isCameraScannerOpen ? (
              <button
                type="button"
                data-testid="phone-open-qr-scanner-btn"
                onClick={() => void handleOpenPhoneCameraScanner()}
                className="px-3.5 py-2 rounded-xl bg-[#2E6F40] hover:bg-[#235732] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>اسکن QR Code با دوربین</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={stopCameraScanner}
                className="px-3.5 py-2 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-900 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>بستن دوربین اسکنر</span>
              </button>
            )}
          </div>

          {isCameraScannerOpen && (
            <div className="rounded-xl bg-slate-900 p-2.5 space-y-2 text-center">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full max-h-52 rounded-lg object-cover bg-black mx-auto"
              />
              <p className="text-[11px] text-amber-100">
                دوربین را مقابل QR Code نمایش‌داده‌شده در دستگاه دیگر قرار دهید...
              </p>
            </div>
          )}

          {cameraError && (
            <div className="rounded-xl bg-amber-50 border border-amber-300 p-2.5 text-[11px] text-amber-950">
              {cameraError}
            </div>
          )}

          {/* ورودی جایگزین توکن QR برای محیط‌های بدون دوربین */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
            <input
              type="text"
              dir="ltr"
              data-testid="phone-qr-input"
              value={scannedQrInput}
              onChange={(e) => setScannedQrInput(e.target.value)}
              placeholder="GOLZAR_P2P_V2:SESS_..."
              aria-label="ورود یا جای‌گذاری توکن QR نشست"
              className="flex-1 px-3 py-2 rounded-xl border border-[#D9C2A7] bg-[#FDF8F2] font-mono text-xs font-bold text-center text-[#332218] focus:outline-none focus:border-[#8C3B2B]"
            />
            <button
              type="button"
              data-testid="phone-inspect-qr-btn"
              onClick={() => void handleInspectScannedQrOnPhone(scannedQrInput)}
              className="px-3.5 py-2 rounded-xl bg-[#2E6F40] hover:bg-[#235732] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>اتصال مستقیم و شروع همگام‌سازی</span>
            </button>
          </div>

          {status === 'connected' || status === 'transfer-success' ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-300 p-3 flex items-center justify-between gap-2">
              <div className="text-xs text-emerald-950 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  کانال مستقیم WebRTC برقرار است
                  {peerDeviceInfo
                    ? ` (${
                        peerDeviceInfo.role === 'phone-primary'
                          ? 'گوشی اندروید - مرجع اصلی'
                          : 'لپ‌تاپ - مکمل کاری'
                      } · ${peerDeviceInfo.deviceId})`
                    : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={handleDisconnect}
                className="px-2.5 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-900 text-[11px] font-bold cursor-pointer"
              >
                قطع اتصال
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* گام سوم: همگام‌سازی مجدد در همان نشست و انتخاب مجموعه‌ها */}
      <div className="rounded-2xl border border-[#D9C2A7] bg-[#FDF8F2] p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-[#332218]">
              ۳. همگام‌سازی خودکار دوطرفه در نشست فعال (RTCDataChannel)
            </h3>
            <p className="text-[11px] text-[#6E5849]">
              به محض برقراری اتصال، تبادل و ادغام دوطرفه به‌طور خودکار انجام می‌شود. در صورت ثبت تغییرات جدید در حین اتصال یا پس از اتصال مجدد، می‌توانید با دکمه روبه‌رو مجدداً همگام‌سازی را اجرا کنید.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void sendSyncPackageOverOpenChannel(false)}
            disabled={status !== 'connected' && status !== 'transfer-success'}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors ${
              status === 'connected' || status === 'transfer-success'
                ? 'bg-[#8C3B2B] hover:bg-[#702D20] text-white cursor-pointer shadow-xs'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>
              همگام‌سازی مجدد در نشست فعال ({toPersianDigits(localEnvelopesCount)} رکورد)
            </span>
          </button>
        </div>

        {/* چک‌باکس انتخاب مجموعه‌های عملیاتی */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {(Object.keys(SYNC_COLLECTION_LABELS) as SyncCollectionName[]).map((col) => {
            const checked = selectedCollections.includes(col);
            return (
              <label
                key={col}
                className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer select-none ${
                  checked
                    ? 'bg-white border-[#8C3B2B] text-[#332218] font-bold'
                    : 'bg-white/60 border-[#E6D5C1] text-[#6E5849]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleCollectionSelection(col)}
                  className="accent-[#8C3B2B]"
                />
                <span>{SYNC_COLLECTION_LABELS[col]}</span>
              </label>
            );
          })}
        </div>

        {/* قابلیت انتخاب کتاب‌های خاص از بین کتاب‌های ثبت‌شده در قفسه */}
        {auditEntriesList.length > 0 && (
          <div className="pt-2 border-t border-[#E6D5C1] space-y-2">
            <label className="inline-flex items-center gap-2 text-xs font-bold text-[#5D4636] cursor-pointer">
              <input
                type="checkbox"
                checked={filterOnlySelectedBooks}
                onChange={(e) => setFilterOnlySelectedBooks(e.target.checked)}
                className="accent-[#8C3B2B]"
              />
              <span>
                انتخاب دستی کتاب‌های خاص برای ارسال دستی (به‌جای ارسال هر{' '}
                {toPersianDigits(auditEntriesList.length)} کتاب ثبت‌شده)
              </span>
            </label>

            {filterOnlySelectedBooks && (
              <div className="max-h-40 overflow-y-auto bg-white rounded-xl border border-[#E6D5C1] p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {auditEntriesList.map((rec) => {
                  const isSel = selectedBookKeys.includes(rec.key);
                  return (
                    <label
                      key={rec.key}
                      className="flex items-center gap-2 text-xs p-1.5 rounded-lg hover:bg-[#FDF8F2] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() =>
                          setSelectedBookKeys((prev) =>
                            prev.includes(rec.key)
                              ? prev.filter((k) => k !== rec.key)
                              : [...prev, rec.key]
                          )
                        }
                        className="accent-[#8C3B2B]"
                      />
                      <span className="truncate font-medium text-[#332218]">
                        {rec.title} ({rec.location || 'بدون کد قفسه'})
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {transferProgress && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 p-2.5 text-xs text-blue-950 font-bold flex items-center justify-between">
            <span>در حال انتقال قطعات بسته ({transferProgress.packageId})...</span>
            <span>
              قطعه {toPersianDigits(transferProgress.received)} از{' '}
              {toPersianDigits(transferProgress.total)}
            </span>
          </div>
        )}
      </div>

      {/* بخش مدیریت تعارض‌های ثبت‌شده (فقط زمانی نمایش داده می‌شود که یک رکورد در هر دو دستگاه به شکل متناقض ویرایش شده باشد) */}
      {pendingPreviewReport && pendingPreviewReport.conflicts.length > 0 && (
        <div
          data-testid="sync-preview-modal"
          className="rounded-2xl border-2 border-[#8C3B2B] bg-white p-4 sm:p-5 shadow-md space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E6D5C1]">
            <div className="space-y-0.5">
              <h3 className="font-titr text-sm sm:text-base font-bold text-[#8C3B2B] flex items-center gap-1.5">
                <ShieldCheck className="w-5 h-5 shrink-0" />
                <span>
                  رکوردهای دارای تعارض در بسته ({pendingPreviewReport.packageId}) — حفظ هر دو نسخه برای انتخاب شما
                </span>
              </h3>
              <p className="text-xs text-[#5D4636]">
                سایر رکوردهای جدید و تکمیلی به‌طور خودکار اعمال شدند. برای{' '}
                {toPersianDigits(pendingPreviewReport.conflicts.length)} مورد زیر که در هر دو دستگاه مقادیر متفاوتی داشتند، هیچ نسخه‌ای حذف نشده است و می‌توانید نسخه نهایی را انتخاب کنید:
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRejectIncomingPreview}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>بستن موقت</span>
              </button>
              <button
                type="button"
                data-testid="confirm-apply-sync-btn"
                onClick={handleConfirmAndApplyPreview}
                disabled={!areAllConflictsResolved(pendingPreviewReport.conflicts)}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 ${
                  areAllConflictsResolved(pendingPreviewReport.conflicts)
                    ? 'bg-[#2E6F40] hover:bg-[#235732] text-white cursor-pointer shadow-xs'
                    : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>ثبت تصمیم تعارض‌ها در حافظه دستگاه</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {pendingPreviewReport.conflicts.map((conflict) => {
              const phoneData = (conflict.phoneEnvelope.data || {}) as Record<string, unknown>;
              const pcData = (conflict.pcEnvelope.data || {}) as Record<string, unknown>;

              return (
                <div
                  key={conflict.conflictId}
                  data-testid={`conflict-card-${conflict.recordId}`}
                  className="rounded-xl border-2 border-amber-300 bg-amber-50/40 p-3.5 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm font-bold text-[#332218]">
                      {conflict.titleSummary}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-200 text-amber-950">
                      {conflict.selectedChoice === 'keep-phone'
                        ? 'انتخاب شما: حفظ نسخه گوشی'
                        : conflict.selectedChoice === 'accept-pc'
                        ? 'انتخاب شما: پذیرش نسخه لپ‌تاپ'
                        : conflict.selectedChoice === 'manual-edit'
                        ? 'انتخاب شما: اصلاح دستی'
                        : 'در انتظار تصمیم شما (هر دو نسخه محفوظ است)'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div className="p-2.5 rounded-lg bg-white border border-[#E6D5C1] space-y-1">
                      <div className="font-bold text-[#8C3B2B]">نسخه موجود در گوشی (مرجع اصلی):</div>
                      <div>عنوان: {String(phoneData.title || conflict.phoneEnvelope.titleSummary)}</div>
                      <div>
                        مکان قفسه: <strong>{String(phoneData.location || '—')}</strong> · تعداد نسخه:{' '}
                        <strong>{toPersianDigits(String(phoneData.countedCopies ?? '—'))}</strong>
                      </div>
                      {phoneData.notes ? <div>یادداشت: {String(phoneData.notes)}</div> : null}
                    </div>

                    <div className="p-2.5 rounded-lg bg-white border border-[#E6D5C1] space-y-1">
                      <div className="font-bold text-[#2E6F40]">نسخه موجود در لپ‌تاپ (مکمل کاری):</div>
                      <div>عنوان: {String(pcData.title || conflict.pcEnvelope.titleSummary)}</div>
                      <div>
                        مکان قفسه: <strong>{String(pcData.location || '—')}</strong> · تعداد نسخه:{' '}
                        <strong>{toPersianDigits(String(pcData.countedCopies ?? '—'))}</strong>
                      </div>
                      {pcData.notes ? <div>یادداشت: {String(pcData.notes)}</div> : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectConflictResolution(conflict, 'keep-phone')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border ${
                        conflict.selectedChoice === 'keep-phone'
                          ? 'bg-[#8C3B2B] text-white border-[#702D20]'
                          : 'bg-white text-[#332218] border-[#D9C2A7]'
                      }`}
                    >
                      ۱. حفظ نسخه گوشی
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectConflictResolution(conflict, 'accept-pc')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border ${
                        conflict.selectedChoice === 'accept-pc'
                          ? 'bg-[#2E6F40] text-white border-emerald-900'
                          : 'bg-white text-[#332218] border-[#D9C2A7]'
                      }`}
                    >
                      ۲. پذیرش نسخه لپ‌تاپ
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectConflictResolution(conflict, 'manual-edit')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border ${
                        conflict.selectedChoice === 'manual-edit'
                          ? 'bg-amber-800 text-white border-amber-950'
                          : 'bg-white text-[#332218] border-[#D9C2A7]'
                      }`}
                    >
                      ۳. بررسی و اصلاح دستی
                    </button>
                  </div>

                  {editingConflictId === conflict.conflictId && (
                    <div className="p-3 rounded-xl bg-white border border-amber-400 space-y-2.5 text-xs">
                      <div className="font-bold text-[#332218]">
                        ویرایش دستی مقادیر نهایی برای ثبت:
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] text-[#6E5849] mb-1">عنوان کتاب:</label>
                          <input
                            type="text"
                            value={manualEditDraft.title || ''}
                            onChange={(e) =>
                              setManualEditDraft((p) => ({ ...p, title: e.target.value }))
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg border border-[#D9C2A7]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#6E5849] mb-1">قفسه:</label>
                          <select
                            value={manualEditDraft.shelf || 'SH-01'}
                            onChange={(e) =>
                              setManualEditDraft((p) => ({
                                ...p,
                                shelf: e.target.value as ShelfCode,
                              }))
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg border border-[#D9C2A7]"
                          >
                            {SHELVES.map((s) => (
                              <option key={s.code} value={s.code}>
                                {s.title}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#6E5849] mb-1">طبقه:</label>
                          <select
                            value={manualEditDraft.level || 'T01'}
                            onChange={(e) =>
                              setManualEditDraft((p) => ({
                                ...p,
                                level: e.target.value as ShelfLevelCode,
                              }))
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg border border-[#D9C2A7]"
                          >
                            {LEVELS.map((l) => (
                              <option key={l.code} value={l.code}>
                                {l.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleSaveManualConflictEdit(conflict)}
                          className="px-3 py-1.5 rounded-lg bg-[#2E6F40] text-white font-bold cursor-pointer"
                        >
                          ثبت مقدار اصلاح‌شده دستی
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* بایگانی حذف نرم قابل بازیابی و تاریخچه بسته‌های انتقالی */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-[#E6D5C1]">
        {/* بایگانی حذف نرم */}
        <div className="rounded-xl border border-[#E6D5C1] bg-[#FAF3EA]/50 p-3 space-y-2">
          <div className="text-xs font-bold text-[#332218] flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5 text-[#8C3B2B]" />
              <span>بایگانی رکوردهای حذف‌شده نرم (قابل بازیابی)</span>
            </span>
            <span className="text-[11px] text-[#6E5849]">
              {toPersianDigits(Object.keys(softDeletedArchive).length)} مورد
            </span>
          </div>

          {Object.keys(softDeletedArchive).length === 0 ? (
            <p className="text-[11px] text-[#6E5849]">
              هیچ رکوردی در بایگانی حذف نرم وجود ندارد. (حذف خودکار رکوردها در همگام‌سازی ممنوع است.)
            </p>
          ) : (
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {Object.entries(softDeletedArchive).map(([compKey, env]) => (
                <div
                  key={compKey}
                  className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-[#E6D5C1] text-xs"
                >
                  <span className="truncate text-[#332218]">{env.titleSummary}</span>
                  <button
                    type="button"
                    onClick={() => handleRestoreSoftDeleted(compKey)}
                    className="px-2 py-1 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-[11px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>بازیابی</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* تاریخچه بسته‌های انتقالی */}
        <div className="rounded-xl border border-[#E6D5C1] bg-[#FAF3EA]/50 p-3 space-y-2">
          <div className="text-xs font-bold text-[#332218] flex items-center justify-between">
            <span>تاریخچه بسته‌های انتقالی اخیر (ثبت وضعیت و تأییدیه ACK)</span>
            <span className="text-[11px] text-[#6E5849]">
              {toPersianDigits(transferHistory.length)} بسته
            </span>
          </div>

          {transferHistory.length === 0 ? (
            <p className="text-[11px] text-[#6E5849]">
              هنوز بسته انتقالی در این دستگاه ثبت نشده است.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {transferHistory.slice(0, 8).map((item) => (
                <div
                  key={`${item.packageId}-${item.direction}-${item.timestampMs}`}
                  className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-[#E6D5C1] text-[11px]"
                >
                  <div className="min-w-0 truncate">
                    <span className="font-mono font-bold text-[#332218]">{item.packageId}</span>
                    <span className="mx-1 text-[#8C7A6B]">·</span>
                    <span>
                      {item.direction === 'sent' ? 'ارسالی (تأییدشده)' : 'دریافتی (اعمال‌شده)'} (
                      {toPersianDigits(item.recordsCount)} رکورد)
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded font-bold shrink-0 ${
                      item.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-900'
                        : item.status === 'failed-interrupted'
                        ? 'bg-rose-100 text-rose-900'
                        : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {item.status === 'completed'
                      ? 'موفق'
                      : item.status === 'failed-interrupted'
                      ? 'ناقص / قطع ارتباط'
                      : 'ردشده'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

