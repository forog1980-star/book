#!/usr/bin/env node
/**
 * اسکریپت مستقل دریافت بسته الحاقی آفلاین شهدا و تصاویر از سایت رسمی golzarteh.ir
 * کاربرد:
 *   node download-golzarteh-addon-pack.mjs
 * گزینه‌های اختیاری:
 *   --profiles-only   دریافت متن زندگینامه، وصیت‌نامه و مشخصات بدون عکس (حجم سبک ~۴۰ مگابایت)
 *   --chunk-size=500  تعداد شهید در هر فایل خروجی (پیش‌فرض ۵۰۰ شهید برای نصب روان روی گوشی)
 *   --limit=2000      محدود کردن تعداد شهدا جهت دریافت آزمایشی یا مرحله‌ای
 *   --out-dir=./golzarteh_addon_pack
 */

import fs from 'node:fs';
import path from 'node:path';

const API_BASE = 'https://api.golzarteh.ir/api/v1';
const MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const getArgVal = (prefix, fallback) => {
  const hit = args.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
};

const profilesOnly = hasFlag('--profiles-only');
const chunkSize = Math.max(50, Number(getArgVal('--chunk-size=', '500')) || 500);
const limitCount = Number(getArgVal('--limit=', '0')) || 0;
const outDir = path.resolve(process.cwd(), getArgVal('--out-dir=', './golzarteh_addon_pack'));

function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&zwnj;/gi, '\u200C')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatDate(d, m, y) {
  const mNum = Number(m);
  const mTxt = Number.isInteger(mNum) && mNum >= 1 && mNum <= 12 ? MONTHS[mNum - 1] : (m ? String(m) : '');
  return [d ? String(d) : '', mTxt, y ? String(y) : ''].filter(Boolean).join(' ');
}

async function fetchJsonSafe(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'MarkazAsnadAddonFetcher/1.0' } });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 8000));
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return null;
}

async function fetchImageAsDataUrl(uuid, retries = 2) {
  if (!uuid) return null;
  const url = `${API_BASE}/files/download/${encodeURIComponent(uuid)}`;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'MarkazAsnadAddonFetcher/1.0' } });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 6000));
        continue;
      }
      if (!res.ok) return null;
      const mime = res.headers.get('content-type') || 'image/jpeg';
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) return null;
      return `data:${mime.split(';')[0]};base64,${buf.toString('base64')}`;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return null;
}

async function resolveTargetGids() {
  const candidateIndexPaths = [
    path.join(process.cwd(), 'golzarteh_index.json'),
    path.join(process.cwd(), 'public/data/golzarteh_index.json'),
    path.join(process.cwd(), 'docs/data/golzarteh_index.json')
  ];
  for (const p of candidateIndexPaths) {
    if (fs.existsSync(p)) {
      const json = JSON.parse(fs.readFileSync(p, 'utf8'));
      const rows = Array.isArray(json?.rows) ? json.rows : [];
      const gids = Array.from(new Set(rows.map((r) => Number(r[1])).filter(Boolean)));
      if (gids.length > 0) {
        console.log(`فهرست تطبیق محلی یافت شد (${gids.length} شهید): ${p}`);
        return gids;
      }
    }
  }

  console.log('در حال دریافت فهرست کامل شهدا از پایگاه رسمی golzarteh.ir...');
  const gids = [];
  let page = 1;
  while (true) {
    const json = await fetchJsonSafe(`${API_BASE}/martyr/summary?page=${page}&limit=200`);
    const list = json?.data?.items || json?.data || [];
    if (!Array.isArray(list) || list.length === 0) break;
    for (const item of list) {
      if (item?.id) gids.push(Number(item.id));
    }
    if (limitCount > 0 && gids.length >= limitCount) break;
    if (list.length < 200) break;
    page++;
    await new Promise((r) => setTimeout(r, 400));
  }
  return Array.from(new Set(gids));
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const statePath = path.join(outDir, 'download_progress.json');
  const prevDone = fs.existsSync(statePath)
    ? new Set(JSON.parse(fs.readFileSync(statePath, 'utf8')).completedGids || [])
    : new Set();

  let allGids = await resolveTargetGids();
  if (limitCount > 0) allGids = allGids.slice(0, limitCount);
  const pendingGids = allGids.filter((g) => !prevDone.has(g));

  console.log(
    `آغاز دریافت بسته الحاقی (${profilesOnly ? 'فقط اطلاعات متنی بدون عکس' : 'اطلاعات کامل + عکس پرسنلی و مزار'}): ${pendingGids.length} شهید باقی‌مانده از مجموع ${allGids.length}`
  );

  let partNumber = 1;
  while (fs.existsSync(path.join(outDir, `golzarteh_addon_pack_part${partNumber}.json`))) {
    partNumber++;
  }

  let chunkProfiles = {};
  let chunkPhotos = {};
  let chunkCount = 0;

  const flushChunk = () => {
    if (chunkCount === 0) return;
    const filePath = path.join(outDir, `golzarteh_addon_pack_part${partNumber}.json`);
    const payload = {
      schemaVersion: 'golzarteh-addon-pack-v1.0',
      generatedAt: new Date().toISOString(),
      partNumber,
      profileCount: chunkCount,
      photoCount: Object.keys(chunkPhotos).length,
      profilesByGid: chunkProfiles,
      embeddedPhotos: chunkPhotos
    };
    fs.writeFileSync(filePath, JSON.stringify(payload));
    fs.writeFileSync(
      statePath,
      JSON.stringify({ updatedAt: new Date().toISOString(), completedGids: Array.from(prevDone) })
    );
    const mb = (fs.statSync(filePath).size / 1024 / 1024).toFixed(2);
    console.log(`✔ بخش ${partNumber} ذخیره شد: ${chunkCount} شهید (${mb} مگابایت) -> ${path.basename(filePath)}`);
    partNumber++;
    chunkProfiles = {};
    chunkPhotos = {};
    chunkCount = 0;
  };

  for (let i = 0; i < pendingGids.length; i += 4) {
    const batch = pendingGids.slice(i, i + 4);
    await Promise.all(
      batch.map(async (gid) => {
        const res = await fetchJsonSafe(`${API_BASE}/martyr/detail/${gid}`);
        const d = res?.data;
        if (!d) return;

        const bioArr = Array.isArray(d.biographies) ? d.biographies : [];
        const bioTexts = bioArr.map((b) => stripHtml(b?.text || '')).filter(Boolean);
        if (d.biography && typeof d.biography === 'string') {
          const single = stripHtml(d.biography);
          if (single && !bioTexts.includes(single)) bioTexts.unshift(single);
        }
        const willsArr = Array.isArray(d.wills) ? d.wills : [];
        const cleanWills = willsArr
          .map((w) => ({ id: w.id, title: w.title || undefined, text: stripHtml(w.text || '') }))
          .filter((w) => w.text.length > 0);
        const ti = d.tombInfo || {};
        const slug = `${String(d.firstName || '').trim()}-${String(d.lastName || '').trim()}-${gid}`.replace(/\s+/g, '-');

        const profile = {
          gid: Number(gid),
          slug,
          officialUrl: `https://golzarteh.ir/martyr/${encodeURIComponent(slug)}`,
          firstName: String(d.firstName || ''),
          lastName: String(d.lastName || ''),
          fatherName: String(d.fatherName || ''),
          birthDateDisplay: formatDate(d.birthDay, d.birthMonth, d.birthYear),
          birthYear: d.birthYear ? String(d.birthYear) : '',
          birthPlace: String(d.birthPlace || ''),
          martyrdomDateDisplay: formatDate(d.martyrdomDay, d.martyrdomMonth, d.martyrdomYear),
          martyrdomYear: d.martyrdomYear ? String(d.martyrdomYear) : '',
          martyrdomPlace: String(d.martyrdomPlace || ''),
          age: d.age ?? null,
          operation: String(d.operation || ''),
          education: String(d.educationDetail || d.education || ''),
          job: String(d.job || ''),
          militaryResponsibility: String(d.militaryResponsibility || ''),
          deploymentCategory: String(d.deploymentCategory || ''),
          section: String(ti.section || ''),
          row: String(ti.row || ''),
          number: String(ti.number || ''),
          latitude: ti.latitude ? String(ti.latitude) : null,
          longitude: ti.longitude ? String(ti.longitude) : null,
          biography: bioTexts.join('\n\n'),
          wills: cleanWills,
          mainPhoto: String(d.mainPhoto || ''),
          thumbnailKey: String(d.thumbnailKey || ''),
          martyrPhotos: Array.isArray(d.martyrPhotos) ? d.martyrPhotos.filter(Boolean).map(String) : [],
          tombPhotos: Array.isArray(ti.tombPhotos) ? ti.tombPhotos.filter(Boolean).map(String) : [],
          syncedAt: new Date().toISOString()
        };

        if (!profilesOnly) {
          const photoIds = Array.from(
            new Set([profile.mainPhoto, profile.tombPhotos[0], ...(profile.martyrPhotos || []).slice(0, 2)].filter(Boolean))
          );
          for (const uuid of photoIds) {
            const url = `${API_BASE}/files/download/${encodeURIComponent(uuid)}`;
            if (!chunkPhotos[url]) {
              const dataUrl = await fetchImageAsDataUrl(uuid);
              if (dataUrl) chunkPhotos[url] = dataUrl;
            }
          }
        }

        chunkProfiles[String(gid)] = profile;
        prevDone.add(gid);
        chunkCount++;
      })
    );

    if (chunkCount >= chunkSize) {
      flushChunk();
    }

    if ((i + 4) % 40 === 0 || i + 4 >= pendingGids.length) {
      process.stdout.write(`\rپیشرفت: ${Math.min(i + 4, pendingGids.length)} / ${pendingGids.length} شهید`);
    }
    await new Promise((r) => setTimeout(r, 1050));
  }

  flushChunk();
  console.log('\n✅ دریافت بسته الحاقی کامل شد. فایل‌های JSON داخل پوشه زیر آماده نصب در بخش «شهدا» نرم‌افزار هستند:\n' + outDir);
}

main().catch((err) => {
  console.error('خطا در دریافت بسته الحاقی:', err);
  process.exit(1);
});
