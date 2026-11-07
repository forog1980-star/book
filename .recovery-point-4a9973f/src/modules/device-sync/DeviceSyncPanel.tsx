import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Copy,
  DatabaseBackup,
  Laptop,
  Lock,
   QrCode,
  RefreshCw,
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
  buildPairingQrValue,
  generateSecurePairingCode,
  maskSessionIdForDisplay,
  normalizePairingCode,
} from './pairingService';
import { DirectWebRtcSessionManager } from './peerConnection';
import {
  analyzeIncomingPackage,
  applyApprovedSyncReport,
  createSyncTransferPackage,
  extractLocalEnvelopesMap,
  markPackageSentInBaseline,
  restoreRecordIntoDataset,
} from './syncEngine';
import {
  appendTransferHistory,
  getOrCreateLocalDeviceId,
  getSavedDeviceRole,
  loadSoftDeletedArchive,
  loadTransferHistory,
  saveDeviceRole,
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
    summaryMessage: string
  ) => void;
  onTriggerLocalBackup?: () => void;
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
    'آماده برقراری ارتباط مستقیم نظیربه‌نظیر (WebRTC DataChannel) بدون ذخیره محتوای کتابخانه در فضای ابری.'
  );

  const [generatedPairingCode, setGeneratedPairingCode] = useState<string>('');
  const [enteredPairingCode, setEnteredPairingCode] = useState<string>('');
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [peerDeviceInfo, setPeerDeviceInfo] = useState<{
    deviceId: string;
    role: DeviceSyncRole;
  } | null>(null);
  const [signalingCleanedSessionId, setSignalingCleanedSessionId] = useState<string>('');

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

  const datasetRef = useRef<OperationalSyncDataset>(dataset);
  useEffect(() => {
    datasetRef.current = dataset;
  }, [dataset]);

  const roleRef = useRef<DeviceSyncRole>(localRole);
  useEffect(() => {
    roleRef.current = localRole;
  }, [localRole]);

  const sessionManagerRef = useRef<DirectWebRtcSessionManager | null>(null);

  useEffect(() => {
    const mgr = new DirectWebRtcSessionManager(localDeviceId, roleRef.current, {
      onStatusChange: (nextStatus, detail) => {
        setStatus(nextStatus);
        if (detail) {
          setStatusMessage(detail);
        }
        if (nextStatus === 'disconnected' || nextStatus === 'connection-error') {
          setTransferProgress(null);
        }
      },
      onPeerHandshake: (peerId, peerRole) => {
        setPeerDeviceInfo({ deviceId: peerId, role: peerRole });
      },
      onTransferProgress: (packageId, received, total) => {
        setTransferProgress({ packageId, received, total });
      },
      onPackageReceived: (pkg: SyncTransferPackage) => {
        setTransferProgress(null);
        const report = analyzeIncomingPackage(
          pkg,
          datasetRef.current,
          localDeviceId,
          roleRef.current
        );
        setPendingPreviewReport(report);
      },
      onTransferInterrupted: (packageId, reason) => {
        setTransferProgress(null);
        const updatedHist = appendTransferHistory({
          packageId,
          direction: 'received',
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
      mgr.dispose();
    };
  }, [localDeviceId]);

  const handleRoleChange = (nextRole: DeviceSyncRole) => {
    setLocalRole(nextRole);
    saveDeviceRole(nextRole);
    if (sessionManagerRef.current) {
      sessionManagerRef.current.setLocalRole(nextRole);
    }
  };

  // تولید کد جفت‌سازی موقت و شروع جلسه میزبان (معمولاً روی گوشی)
  const handleStartHostPairing = async () => {
    try {
      const newCode = generateSecurePairingCode();
      setGeneratedPairingCode(newCode);
      setSignalingCleanedSessionId('');
      if (sessionManagerRef.current) {
        await sessionManagerRef.current.startHostSession(newCode);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus('connection-error');
      setStatusMessage(`خطا در ایجاد جلسه جفت‌سازی: ${msg}`);
    }
  };

  // اتصال با کد جفت‌سازی (معمولاً روی کامپیوتر)
  const handleJoinWithPairingCode = async () => {
    const norm = normalizePairingCode(enteredPairingCode);
    if (!norm) {
      setStatus('connection-error');
      setStatusMessage(
        'لطفاً کد جفت‌سازی ۱۲ کاراکتری (مثلاً ABCD-EFGH-JKLM) را به‌طور کامل وارد نمایید.'
      );
      return;
    }
    try {
      setSignalingCleanedSessionId('');
      if (sessionManagerRef.current) {
        await sessionManagerRef.current.joinSessionWithCode(norm);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus('connection-error');
      setStatusMessage(`خطا در اتصال به جلسه: ${msg}`);
    }
  };

  const handleDisconnect = () => {
    if (sessionManagerRef.current) {
      sessionManagerRef.current.closeConnection(true);
    }
    setPeerDeviceInfo(null);
    setGeneratedPairingCode('');
  };

  const handleCancelPairing = async () => {
    if (sessionManagerRef.current) {
      await sessionManagerRef.current.cancelPairing();
    }
    setPeerDeviceInfo(null);
    setGeneratedPairingCode('');
    setShowQrModal(false);
  };

  // ارسال بسته اطلاعات از طریق کانال مستقیم WebRTC
  const handleSendDirectPackage = async () => {
    if (!sessionManagerRef.current || !sessionManagerRef.current.isConnected()) {
      setStatus('connection-error');
      setStatusMessage('ابتدا اتصال مستقیم بین گوشی و کامپیوتر را برقرار نمایید.');
      return;
    }

    try {
      const pkg = createSyncTransferPackage({
        dataset,
        localDeviceId,
        localRole,
        selectedCollections,
        onlyRecordKeys:
          filterOnlySelectedBooks && selectedBookKeys.length > 0
            ? selectedBookKeys
            : undefined,
      });

      await sessionManagerRef.current.sendTransferPackage(pkg);
      markPackageSentInBaseline(pkg);

      const updatedHist = appendTransferHistory({
        packageId: pkg.packageId,
        direction: 'sent',
        peerRole: peerDeviceInfo?.role || (localRole === 'phone-primary' ? 'pc-companion' : 'phone-primary'),
        timestampMs: Date.now(),
        status: 'completed',
        recordsCount: pkg.recordCount,
        appliedNew: 0,
        appliedModified: 0,
        resolvedConflicts: 0,
      });
      setTransferHistory(updatedHist);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus('connection-error');
      setStatusMessage(`خطا در ارسال بسته: ${msg}`);
    }
  };

  // انتخاب تصمیم کاربر برای هر تعارض
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

  // تأیید نهایی کاربر و اعمال بسته دریافتی در حافظه دستگاه
  const handleConfirmAndApplyPreview = () => {
    if (!pendingPreviewReport) return;
    if (!areAllConflictsResolved(pendingPreviewReport.conflicts)) {
      return;
    }

    const result = applyApprovedSyncReport(
      pendingPreviewReport,
      dataset,
      localDeviceId,
      localRole
    );

    const updatedHist = appendTransferHistory({
      packageId: pendingPreviewReport.packageId,
      direction: 'received',
      peerRole: pendingPreviewReport.senderRole,
      timestampMs: Date.now(),
      status: 'completed',
      recordsCount:
        result.appliedNewCount +
        result.appliedModifiedCount +
        result.appliedSoftDeleteCount +
        result.resolvedConflictCount,
      appliedNew: result.appliedNewCount,
      appliedModified: result.appliedModifiedCount,
      resolvedConflicts: result.resolvedConflictCount,
    });
    setTransferHistory(updatedHist);
    setSoftDeletedArchive(loadSoftDeletedArchive());

    const summaryText = `همگام‌سازی مستقیم با تأیید شما اعمال شد: ${toPersianDigits(
      result.appliedNewCount
    )} رکورد جدید، ${toPersianDigits(result.appliedModifiedCount)} ویرایش و ${toPersianDigits(
      result.resolvedConflictCount
    )} تعارض تعیین‌تکلیف‌شده.`;

    setPendingPreviewReport(null);
    onApplySyncedDataset(result.nextDataset, summaryText);
  };

  const handleRejectIncomingPreview = () => {
    if (!pendingPreviewReport) return;
    const updatedHist = appendTransferHistory({
      packageId: pendingPreviewReport.packageId,
      direction: 'received',
      peerRole: pendingPreviewReport.senderRole,
      timestampMs: Date.now(),
      status: 'rejected-by-user',
      recordsCount: 0,
      appliedNew: 0,
      appliedModified: 0,
      resolvedConflicts: 0,
      errorDetails: 'رد بسته دریافتی توسط کاربر پیش از اعمال',
    });
    setTransferHistory(updatedHist);
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
      aria-label="ارتباط گوشی و کامپیوتر"
      className="bg-white rounded-2xl border-2 border-[#D9C2A7] shadow-xs p-4 sm:p-6 space-y-5"
    >
      {/* هدر بخش مستقل ارتباط گوشی و کامپیوتر */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[#E6D5C1]">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <ArrowLeftRight className="w-5 h-5 text-[#8C3B2B] shrink-0" />
            <h2 className="font-titr text-base sm:text-lg font-bold text-[#332218]">
              ارتباط گوشی و کامپیوتر (انتقال مستقیم WebRTC بدون ذخیره در ابر)
            </h2>
          </div>
          <p className="text-xs text-[#6E5849] leading-relaxed">
            گوشی اندروید مرجع اصلی نگهداری اطلاعات کتابخانه است و کامپیوتر محیط مکمل کاری است. تمام محتوای کتاب‌ها و شهدا صرفاً در حافظه محلی دستگاه‌ها باقی می‌ماند و از مسیر مستقیم و رمزنگاری‌شده WebRTC DataChannel منتقل می‌شود.
          </p>
        </div>

        {/* نشانگر وضعیت اتصال (۸ وضعیت استاندارد بخش سوم) */}
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

      {/* پیام وضعیت فعلی و تأیید پاک‌سازی Signaling */}
      <div className="rounded-xl bg-[#FDF8F2] border border-[#E6D5C1] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#4A3525]">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#2E6F40] shrink-0" />
          <span className="font-medium leading-relaxed">{statusMessage}</span>
        </div>
        {signalingCleanedSessionId && (
          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold text-[11px] shrink-0">
            پیام‌های موقت Signaling نشست ({maskSessionIdForDisplay(signalingCleanedSessionId)}) از Firebase پاک شد
          </span>
        )}
      </div>

      {/* گام اول: انتخاب نقش دستگاه فعلی و آمار حافظه محلی */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                <div className="text-xs font-bold">گوشی اندروید (مرجع اصلی)</div>
                <div
                  className={`text-[10px] mt-0.5 leading-snug ${
                    localRole === 'phone-primary' ? 'text-amber-100' : 'text-[#6E5849]'
                  }`}
                >
                  نگهدارنده اصلی اطلاعات؛ تغییرات کامپیوتر فقط با تأیید شما اعمال می‌شود
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
                <div className="text-xs font-bold">کامپیوتر (محیط مکمل کاری)</div>
                <div
                  className={`text-[10px] mt-0.5 leading-snug ${
                    localRole === 'pc-companion' ? 'text-amber-100' : 'text-[#6E5849]'
                  }`}
                >
                  نسخه کاری برای تایپ، ویرایش، جست‌وجو و ارسال تغییرات به گوشی
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* وضعیت موجودی محلی این دستگاه و تهیه پشتیبان ایمن */}
        <div className="rounded-xl border border-[#E6D5C1] bg-[#FAF3EA]/60 p-3.5 flex flex-col justify-between gap-3">
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-[#332218] flex items-center justify-between">
              <span>موجودی فعلی حافظه محلی این دستگاه:</span>
              <span className="text-[#2E6F40] font-bold">
                {toPersianDigits(auditEntriesList.length)} کتاب تعیین‌تکلیف‌شده در قفسه
              </span>
            </div>
            <p className="text-[11px] text-[#6E5849] leading-relaxed">
              تعداد کل رکوردهای عملیاتی آماده بررسی/ارسال در مجموعه‌های انتخابی:{' '}
              <strong className="text-[#332218]">{toPersianDigits(localEnvelopesCount)}</strong> رکورد
              (بدون هیچ‌گونه تغییر یا حذف خودکار).
            </p>
          </div>

          {onTriggerLocalBackup && (
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E6D5C1]">
              <span className="text-[11px] text-[#6E5849]">
                توصیه ایمنی: پیش از تبادل اطلاعات، یک نسخه پشتیبان محلی روی دستگاه ذخیره کنید.
              </span>
              <button
                type="button"
                onClick={onTriggerLocalBackup}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-amber-50 text-[#8C3B2B] border border-[#D9C2A7] text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <DatabaseBackup className="w-3.5 h-3.5" />
                <span>پشتیبان محلی فوری</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* گام دوم: پنل جفت‌سازی (اتصال به کامپیوتر در گوشی / اتصال به گوشی در کامپیوتر) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* کارت ۱: شروع اتصال از گوشی (تولید کد جفت‌سازی و QR) */}
        <div className="rounded-2xl border-2 border-[#E6D5C1] bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs sm:text-sm font-bold text-[#332218] flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-[#8C3B2B]" />
              <span>۱. در گوشی: «اتصال به کامپیوتر» (تولید کد جفت‌سازی)</span>
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#FDF8F2] border border-[#E6D5C1] text-[#8C3B2B] font-bold">
              میزبان جلسه
            </span>
          </div>

          <p className="text-xs text-[#6E5849] leading-relaxed">
            روی گوشی دکمه زیر را بزنید تا یک کد جفت‌سازی موقت و امن (با اعتبار ۱۰ دقیقه) تولید شود؛ سپس این کد را در کامپیوتر وارد نمایید.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleStartHostPairing()}
              className="px-3.5 py-2 rounded-xl bg-[#8C3B2B] hover:bg-[#702D20] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>اتصال به کامپیوتر (تولید کد جفت‌سازی)</span>
            </button>

            {generatedPairingCode && (
              <button
                type="button"
                onClick={() => setShowQrModal((prev) => !prev)}
                className="px-3 py-2 rounded-xl bg-[#FDF8F2] hover:bg-amber-100/70 text-[#8C3B2B] border border-[#D9C2A7] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>{showQrModal ? 'بستن QR Code' : 'نمایش QR Code'}</span>
              </button>
            )}

            {(status === 'pairing' || status === 'connecting') && (
              <button
                type="button"
                onClick={() => void handleCancelPairing()}
                className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>انصراف از جفت‌سازی و پاک‌سازی نشست</span>
              </button>
            )}
          </div>

          {generatedPairingCode && (
            <div className="rounded-xl bg-[#FDF8F2] border-2 border-[#D9C2A7] p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#5D4636]">کد جفت‌سازی موقت شما:</span>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      void navigator.clipboard.writeText(generatedPairingCode);
                    } catch {
                      // ignore
                    }
                  }}
                  className="px-2 py-1 rounded-lg bg-white border border-[#D9C2A7] text-[11px] font-bold text-[#8C3B2B] inline-flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>کپی کد</span>
                </button>
              </div>

              <div
                data-testid="generated-pairing-code"
                dir="ltr"
                className="text-center font-mono text-base sm:text-lg font-extrabold tracking-widest py-2 px-3 rounded-lg bg-white border border-[#E6D5C1] text-[#332218] select-all"
              >
                {generatedPairingCode}
              </div>

              {showQrModal && (
                <div className="flex flex-col items-center justify-center p-3 bg-white rounded-xl border border-[#E6D5C1] gap-2">
                  <QRCodeSVG
                    value={buildPairingQrValue(generatedPairingCode)}
                    size={148}
                    level="M"
                  />
                  <span className="text-[11px] text-[#6E5849]">
                    اسکن با دوربین یا وارد کردن کد ۱۲ کاراکتری در دستگاه مقابل
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* کارت ۲: اتصال از کامپیوتر به گوشی با وارد کردن کد جفت‌سازی */}
        <div className="rounded-2xl border-2 border-[#E6D5C1] bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs sm:text-sm font-bold text-[#332218] flex items-center gap-1.5">
              <Laptop className="w-4 h-4 text-[#2E6F40]" />
              <span>۲. در کامپیوتر: «اتصال به گوشی» (ورود کد جفت‌سازی)</span>
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[#2E6F40] font-bold">
              متصل‌شونده
            </span>
          </div>

          <p className="text-xs text-[#6E5849] leading-relaxed">
            کد ۱۲ کاراکتری نمایش‌داده‌شده روی گوشی را در کادر زیر وارد کنید و دکمه «اتصال به گوشی» را بزنید تا کانال مستقیم WebRTC برقرار شود.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              dir="ltr"
              value={enteredPairingCode}
              onChange={(e) => setEnteredPairingCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX"
              aria-label="کد جفت‌سازی ۱۲ کاراکتری"
              className="flex-1 px-3 py-2 rounded-xl border border-[#D9C2A7] bg-[#FDF8F2] font-mono text-sm font-bold text-center tracking-wider text-[#332218] focus:outline-none focus:border-[#8C3B2B]"
            />
            <button
              type="button"
              onClick={() => void handleJoinWithPairingCode()}
              className="px-4 py-2 rounded-xl bg-[#2E6F40] hover:bg-[#235732] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
            >
              <Wifi className="w-3.5 h-3.5" />
              <span>اتصال به گوشی</span>
            </button>
          </div>

          {status === 'connected' || status === 'transfer-success' ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-300 p-3 flex items-center justify-between gap-2">
              <div className="text-xs text-emerald-950 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  متصل به دستگاه مقابل
                  {peerDeviceInfo
                    ? ` (${
                        peerDeviceInfo.role === 'phone-primary'
                          ? 'گوشی اندروید - مرجع اصلی'
                          : 'کامپیوتر - مکمل کاری'
                      })`
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

      {/* گام سوم: انتخاب مجموعه‌ها و ارسال بسته مستقیم در کانال WebRTC DataChannel */}
      <div className="rounded-2xl border border-[#D9C2A7] bg-[#FDF8F2] p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-[#332218]">
              ۳. انتخاب اطلاعات و ارسال مستقیم به دستگاه مقابل (DataChannel)
            </h3>
            <p className="text-[11px] text-[#6E5849]">
              مشخص کنید کدام بخش‌های اطلاعاتی در بسته انتقالی قرار بگیرند. در دستگاه مقصد، قبل از اعمال هرگونه تغییر، خلاصه بسته و تعارض‌ها به کاربر نمایش داده می‌شود.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleSendDirectPackage()}
            disabled={status !== 'connected' && status !== 'transfer-success'}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors ${
              status === 'connected' || status === 'transfer-success'
                ? 'bg-[#8C3B2B] hover:bg-[#702D20] text-white cursor-pointer shadow-xs'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>
              {localRole === 'phone-primary'
                ? `ارسال مستقیم اطلاعات گوشی به کامپیوتر (${toPersianDigits(localEnvelopesCount)} رکورد)`
                : `ارسال تغییرات کاری کامپیوتر به گوشی جهت تأیید (${toPersianDigits(localEnvelopesCount)} رکورد)`}
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
                انتخاب دستی کتاب‌های خاص برای ارسال (به‌جای ارسال یکجای هر{' '}
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

      {/* گام چهارم: پنجره پیش‌نمایش بسته دریافتی، حل صریح تعارض‌ها و تأیید نهایی کاربر */}
      {pendingPreviewReport && (
        <div
          data-testid="sync-preview-modal"
          className="rounded-2xl border-2 border-[#8C3B2B] bg-white p-4 sm:p-5 shadow-md space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E6D5C1]">
            <div className="space-y-0.5">
              <h3 className="font-titr text-sm sm:text-base font-bold text-[#8C3B2B] flex items-center gap-1.5">
                <ShieldCheck className="w-5 h-5 shrink-0" />
                <span>
                  پیش‌نمایش بسته دریافتی ({pendingPreviewReport.packageId}) — نیازمند بررسی و تأیید شما
                </span>
              </h3>
              <p className="text-xs text-[#5D4636]">
                فرستنده:{' '}
                <strong>
                  {pendingPreviewReport.senderRole === 'phone-primary'
                    ? 'گوشی اندروید (مرجع اصلی)'
                    : 'کامپیوتر (دستگاه مکمل کاری)'}
                </strong>{' '}
                · هیچ تغییری بدون تأیید صریح شما روی داده‌های این دستگاه اعمال نمی‌شود.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRejectIncomingPreview}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>انصراف و رد بسته</span>
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
                <span>تأیید و اعمال تغییرات در حافظه دستگاه</span>
              </button>
            </div>
          </div>

          {pendingPreviewReport.isReplayPackage && (
            <div className="rounded-xl bg-amber-100 border border-amber-400 px-3 py-2 text-xs font-bold text-amber-950 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                توجه (جلوگیری از Replay): بسته با شناسه {pendingPreviewReport.packageId} قبلاً در این دستگاه بررسی و اعمال شده است؛ رکوردهای تکراری در بخش «یکسان و بدون تغییر» قرار گرفته‌اند و هیچ رکورد تکراری ایجاد نخواهد شد.
              </span>
            </div>
          )}

          {/* خلاصه آماری تغییرات بسته */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="text-sm font-extrabold text-emerald-900">
                {toPersianDigits(pendingPreviewReport.newItems.length)}
              </div>
              <div className="text-[11px] font-bold text-emerald-800">رکورد جدید</div>
            </div>
            <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200">
              <div className="text-sm font-extrabold text-blue-900">
                {toPersianDigits(pendingPreviewReport.modifiedItems.length)}
              </div>
              <div className="text-[11px] font-bold text-blue-800">ویرایش بدون تعارض</div>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300">
              <div className="text-sm font-extrabold text-amber-950">
                {toPersianDigits(pendingPreviewReport.conflicts.length)}
              </div>
              <div className="text-[11px] font-bold text-amber-900">تعارض نیازمند تصمیم</div>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
              <div className="text-sm font-extrabold text-rose-900">
                {toPersianDigits(pendingPreviewReport.softDeleteItems.length)}
              </div>
              <div className="text-[11px] font-bold text-rose-800">حذف نرم (قابل بازیابی)</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-sm font-extrabold text-slate-800">
                {toPersianDigits(pendingPreviewReport.unchangedItems.length)}
              </div>
              <div className="text-[11px] font-bold text-slate-600">یکسان و بدون تغییر</div>
            </div>
          </div>

          {/* فهرست رکوردهای جدید و ویرایش‌شده */}
          {(pendingPreviewReport.newItems.length > 0 ||
            pendingPreviewReport.modifiedItems.length > 0) && (
            <div className="rounded-xl bg-[#FDF8F2] border border-[#E6D5C1] p-3 space-y-2 max-h-48 overflow-y-auto">
              <div className="text-xs font-bold text-[#332218]">
                جزئیات رکوردهای جدید و ویرایش‌شده:
              </div>
              {pendingPreviewReport.newItems.map((item) => (
                <div
                  key={`${item.collection}:${item.recordId}`}
                  className="text-xs flex items-center justify-between gap-2 py-1 border-b border-[#E6D5C1]/60 last:border-none"
                >
                  <span className="font-medium text-[#332218]">{item.titleSummary}</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold text-[10px]">
                    رکورد جدید ({SYNC_COLLECTION_LABELS[item.collection]})
                  </span>
                </div>
              ))}
              {pendingPreviewReport.modifiedItems.map((item) => (
                <div
                  key={`${item.collection}:${item.recordId}`}
                  className="text-xs flex items-center justify-between gap-2 py-1 border-b border-[#E6D5C1]/60 last:border-none"
                >
                  <span className="font-medium text-[#332218]">{item.titleSummary}</span>
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 font-bold text-[10px]">
                    ویرایش‌شده ({SYNC_COLLECTION_LABELS[item.collection]})
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* بخش حل تعارض صریح توسط کاربر (بند ۸، ۹ و ۱۰ بخش چهارم) */}
          {pendingPreviewReport.conflicts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-950 bg-amber-100 border border-amber-300 px-3 py-2 rounded-xl">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  توجه: در {toPersianDigits(pendingPreviewReport.conflicts.length)} رکورد زیر، هم روی گوشی و هم روی کامپیوتر تغییرات متفاوتی ثبت شده است. هیچ تعارضی به‌صورت خودکار بازنویسی نمی‌شود؛ لطفاً برای هر مورد یکی از ۳ گزینه را انتخاب کنید:
                </span>
              </div>

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
                          ? 'انتخاب شما: پذیرش نسخه کامپیوتر'
                          : conflict.selectedChoice === 'manual-edit'
                          ? 'انتخاب شما: اصلاح دستی'
                          : 'در انتظار تصمیم شما'}
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
                        <div className="font-bold text-[#2E6F40]">نسخه موجود در کامپیوتر (مکمل کاری):</div>
                        <div>عنوان: {String(pcData.title || conflict.pcEnvelope.titleSummary)}</div>
                        <div>
                          مکان قفسه: <strong>{String(pcData.location || '—')}</strong> · تعداد نسخه:{' '}
                          <strong>{toPersianDigits(String(pcData.countedCopies ?? '—'))}</strong>
                        </div>
                        {pcData.notes ? <div>یادداشت: {String(pcData.notes)}</div> : null}
                      </div>
                    </div>

                    {/* ۳ گزینه الزامی بخش چهارم بند ۱۰ */}
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
                        ۲. پذیرش نسخه کامپیوتر
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

                    {/* فرم اصلاح دستی در صورت انتخاب گزینه ۳ */}
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
          )}
        </div>
      )}

      {/* بایگانی حذف نرم قابل بازیابی و تاریخچه بسته‌های انتقالی */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-[#E6D5C1]">
        {/* بایگانی حذف نرم (بند ۱۲ بخش چهارم) */}
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
              هیچ رکوردی در بایگانی حذف نرم وجود ندارد. (حذف فیزیکی خودکار در همگام‌سازی ممنوع است.)
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

        {/* تاریخچه بسته‌های انتقالی (بند ۱۳ بخش چهارم) */}
        <div className="rounded-xl border border-[#E6D5C1] bg-[#FAF3EA]/50 p-3 space-y-2">
          <div className="text-xs font-bold text-[#332218] flex items-center justify-between">
            <span>تاریخچه بسته‌های انتقالی اخیر (ثبت وضعیت و شناسه بسته)</span>
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
                  key={item.packageId}
                  className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-[#E6D5C1] text-[11px]"
                >
                  <div className="min-w-0 truncate">
                    <span className="font-mono font-bold text-[#332218]">{item.packageId}</span>
                    <span className="mx-1 text-[#8C7A6B]">·</span>
                    <span>
                      {item.direction === 'sent' ? 'ارسالی' : 'دریافتی'} (
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
