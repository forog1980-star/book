import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DB_FILE_PATH = path.resolve(__dirname, 'central-server-db.json');

export interface CentralServerPayload {
  updatedAt: number;
  auditRecords: Record<string, Record<string, unknown>>;
  bookCopies: Array<Record<string, unknown>>;
  customMartyrs: Array<Record<string, unknown>>;
  smartSuggestions: Array<Record<string, unknown>>;
  multiMartyrGroups: Array<Record<string, unknown>>;
  extractedItems: Array<Record<string, unknown>>;
  links: Array<Record<string, unknown>>;
  pendingReviews: Array<Record<string, unknown>>;
  auditLog: Array<Record<string, unknown>>;
  rejectedSuggestionsArchive: Array<Record<string, unknown>>;
  deletedTombstones: Record<string, number>;
}

const DEFAULT_STATE: CentralServerPayload = {
  updatedAt: 0,
  auditRecords: {},
  bookCopies: [],
  customMartyrs: [],
  smartSuggestions: [],
  multiMartyrGroups: [],
  extractedItems: [],
  links: [],
  pendingReviews: [],
  auditLog: [],
  rejectedSuggestionsArchive: [],
  deletedTombstones: {},
};

function readCentralDb(): CentralServerPayload {
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<CentralServerPayload>;
      return {
        ...DEFAULT_STATE,
        ...parsed,
        auditRecords: parsed.auditRecords || {},
        bookCopies: Array.isArray(parsed.bookCopies) ? parsed.bookCopies : [],
        customMartyrs: Array.isArray(parsed.customMartyrs) ? parsed.customMartyrs : [],
        smartSuggestions: Array.isArray(parsed.smartSuggestions) ? parsed.smartSuggestions : [],
        multiMartyrGroups: Array.isArray(parsed.multiMartyrGroups) ? parsed.multiMartyrGroups : [],
        extractedItems: Array.isArray(parsed.extractedItems) ? parsed.extractedItems : [],
        links: Array.isArray(parsed.links) ? parsed.links : [],
        pendingReviews: Array.isArray(parsed.pendingReviews) ? parsed.pendingReviews : [],
        auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : [],
        rejectedSuggestionsArchive: Array.isArray(parsed.rejectedSuggestionsArchive)
          ? parsed.rejectedSuggestionsArchive
          : [],
        deletedTombstones: parsed.deletedTombstones || {},
      };
    }
  } catch (err) {
    console.error('Error reading central-server-db.json:', err);
  }
  return { ...DEFAULT_STATE };
}

function writeCentralDb(state: CentralServerPayload): void {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing central-server-db.json:', err);
  }
}

function scoreAuditRecordCompleteness(rec: Record<string, unknown>): number {
  let score = 0;
  if (rec.shelf) score += 3;
  if (rec.level) score += 3;
  if (rec.location) score += 2;
  if (Number(rec.copyCount || 0) > 0) score += 2;
  if (rec.isPeerVerified) score += 4;
  if (rec.notes) score += 1;
  if (rec.author) score += 1;
  if (rec.publisher) score += 1;
  return score;
}

function mergeAuditRecords(
  serverMap: Record<string, Record<string, unknown>>,
  clientMap: Record<string, Record<string, unknown>>,
  tombstones: Record<string, number>
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  const allKeys = new Set([...Object.keys(serverMap || {}), ...Object.keys(clientMap || {})]);

  for (const key of allKeys) {
    const sRec = serverMap?.[key];
    const cRec = clientMap?.[key];
    const sTs = Number(sRec?._updatedAt || 1);
    const cTs = Number(cRec?._updatedAt || 1);
    const maxTs = Math.max(sTs, cTs);
    const deletedAt = tombstones[`audit:${key}`] || tombstones[key] || 0;

    if (deletedAt > maxTs) {
      continue;
    }

    if (sRec && !cRec) {
      result[key] = sRec;
    } else if (cRec && !sRec) {
      result[key] = { ...cRec, _updatedAt: cTs > 1 ? cTs : Date.now() };
    } else if (sRec && cRec) {
      if (cTs > sTs) {
        result[key] = cRec;
      } else if (sTs > cTs) {
        result[key] = sRec;
      } else {
        const cScore = scoreAuditRecordCompleteness(cRec);
        const sScore = scoreAuditRecordCompleteness(sRec);
        result[key] = cScore >= sScore ? cRec : sRec;
      }
    }
  }

  return result;
}

function mergeArrayByKey(
  serverArr: Array<Record<string, unknown>>,
  clientArr: Array<Record<string, unknown>>,
  idField: string,
  tombstonePrefix: string,
  tombstones: Record<string, number>,
  maxItems?: number
): Array<Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();

  for (const item of serverArr || []) {
    const id = String(item?.[idField] || '');
    if (!id) continue;
    const itemTs = Number(item?._updatedAt || 1);
    const delTs = tombstones[`${tombstonePrefix}:${id}`] || tombstones[id] || 0;
    if (delTs > itemTs) continue;
    map.set(id, item);
  }

  for (const item of clientArr || []) {
    const id = String(item?.[idField] || '');
    if (!id) continue;
    const itemTs = Number(item?._updatedAt || 1);
    const delTs = tombstones[`${tombstonePrefix}:${id}`] || tombstones[id] || 0;
    if (delTs > itemTs) continue;

    const existing = map.get(id);
    if (!existing) {
      map.set(id, item);
    } else {
      const existingTs = Number(existing?._updatedAt || 1);
      if (itemTs >= existingTs) {
        map.set(id, item);
      }
    }
  }

  const merged = Array.from(map.values());
  if (maxItems && merged.length > maxItems) {
    return merged.slice(0, maxItems);
  }
  return merged;
}

function mergeCentralPayload(
  serverState: CentralServerPayload,
  clientState: Partial<CentralServerPayload>
): CentralServerPayload {
  const mergedTombstones: Record<string, number> = {
    ...(serverState.deletedTombstones || {}),
  };
  for (const [k, ts] of Object.entries(clientState.deletedTombstones || {})) {
    const numTs = Number(ts) || 0;
    if (numTs > (mergedTombstones[k] || 0)) {
      mergedTombstones[k] = numTs;
    }
  }

  const mergedAuditRecords = mergeAuditRecords(
    serverState.auditRecords || {},
    clientState.auditRecords || {},
    mergedTombstones
  );

  const mergedBookCopies = mergeArrayByKey(
    serverState.bookCopies || [],
    clientState.bookCopies || [],
    'copyId',
    'copy',
    mergedTombstones
  );

  const mergedCustomMartyrs = mergeArrayByKey(
    serverState.customMartyrs || [],
    clientState.customMartyrs || [],
    'id',
    'martyr',
    mergedTombstones
  );

  const mergedSmartSuggestions = mergeArrayByKey(
    serverState.smartSuggestions || [],
    clientState.smartSuggestions || [],
    'id',
    'suggestion',
    mergedTombstones
  );

  const mergedMultiMartyrGroups = mergeArrayByKey(
    serverState.multiMartyrGroups || [],
    clientState.multiMartyrGroups || [],
    'id',
    'group',
    mergedTombstones
  );

  const mergedExtractedItems = mergeArrayByKey(
    serverState.extractedItems || [],
    clientState.extractedItems || [],
    'id',
    'extracted',
    mergedTombstones
  );

  const mergedLinks = mergeArrayByKey(
    serverState.links || [],
    clientState.links || [],
    'id',
    'link',
    mergedTombstones
  );

  const mergedPendingReviews = mergeArrayByKey(
    serverState.pendingReviews || [],
    clientState.pendingReviews || [],
    'id',
    'pending',
    mergedTombstones
  );

  const mergedAuditLog = mergeArrayByKey(
    serverState.auditLog || [],
    clientState.auditLog || [],
    'id',
    'log',
    mergedTombstones,
    400
  );

  const mergedRejected = mergeArrayByKey(
    serverState.rejectedSuggestionsArchive || [],
    clientState.rejectedSuggestionsArchive || [],
    'id',
    'rejected',
    mergedTombstones
  );

  return {
    updatedAt: Date.now(),
    auditRecords: mergedAuditRecords,
    bookCopies: mergedBookCopies,
    customMartyrs: mergedCustomMartyrs,
    smartSuggestions: mergedSmartSuggestions,
    multiMartyrGroups: mergedMultiMartyrGroups,
    extractedItems: mergedExtractedItems,
    links: mergedLinks,
    pendingReviews: mergedPendingReviews,
    auditLog: mergedAuditLog,
    rejectedSuggestionsArchive: mergedRejected,
    deletedTombstones: mergedTombstones,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // دریافت آخرین وضعیت سرور مرکزی
  app.get('/api/central-sync', (_req, res) => {
    const state = readCentralDb();
    res.json({
      ok: true,
      serverTime: Date.now(),
      totalAuditRecords: Object.keys(state.auditRecords || {}).length,
      state,
    });
  });

  // همگام‌سازی دوطرفه (ارسال تغییرات گوشی/کامپیوتر و دریافت بانک تجمیعی سرور مرکزی)
  app.post('/api/central-sync', (req, res) => {
    try {
      const incoming = (req.body || {}) as Partial<CentralServerPayload>;
      const currentServerState = readCentralDb();
      const mergedState = mergeCentralPayload(currentServerState, incoming);
      writeCentralDb(mergedState);

      res.json({
        ok: true,
        serverTime: mergedState.updatedAt,
        totalAuditRecords: Object.keys(mergedState.auditRecords || {}).length,
        state: mergedState,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Central Library Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
