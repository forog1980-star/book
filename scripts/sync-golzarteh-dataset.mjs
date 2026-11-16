import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

const ROOT = process.cwd();
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function normalizePersian(raw) {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/[يىئ]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[ؤ]/g, 'و')
    .replace(/[إأآ]/g, 'ا')
    .replace(/الله/g, 'اله')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[()«»"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactName(raw) {
  return normalizePersian(raw)
    .replace(/^(شهید|سردار شهید|امیر شهید|سید الشهدا)\s+/g, '')
    .replace(/\bشهید گمنام\b/g, '')
    .replace(/\bمزار یادبود\b/g, '')
    .replace(/\s+/g, '');
}

function normGrave(raw) {
  const s = normalizePersian(raw);
  if (!s || s === '?' || s === '-' || s === '—') return '';
  return s.replace(/^0+/, '') || s;
}

function stripHtmlToText(html) {
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

const MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

function formatApiDate(day, month, year) {
  const d = day ? String(day) : '';
  const mNum = Number(month);
  const m = Number.isInteger(mNum) && mNum >= 1 && mNum <= 12 ? MONTHS[mNum - 1] : (month ? String(month) : '');
  const y = year ? String(year) : '';
  return [d, m, y].filter(Boolean).join(' ');
}

function scoreMatch(local, official) {
  const lFirst = compactName(local.firstName);
  const lLast = compactName(local.lastName);
  const lFull = compactName(`${local.firstName} ${local.lastName}`);
  const oFirst = compactName(official.firstName);
  const oLast = compactName(official.lastName);
  const oFull = compactName(`${official.firstName} ${official.lastName}`);

  if (!lFull || !oFull) return null;

  let nameScore = 0;
  if (lFirst === oFirst && lLast === oLast) nameScore = 45;
  else if (lFull === oFull) nameScore = 43;
  else if (
    lLast && oLast && lFirst && oFirst &&
    (lLast === oLast || lLast.includes(oLast) || oLast.includes(lLast)) &&
    (lFirst.includes(oFirst) || oFirst.includes(lFirst))
  ) {
    nameScore = 32;
  } else {
    return null;
  }

  const lFather = compactName(local.fatherName);
  const oFather = compactName(official.fatherName);
  let fatherExact = false;
  let fatherScore = 0;
  let fatherConflict = false;
  if (lFather && oFather) {
    if (lFather === oFather) {
      fatherScore = 30;
      fatherExact = true;
    } else if (lFather.includes(oFather) || oFather.includes(lFather)) {
      fatherScore = 20;
    } else {
      fatherConflict = true;
      fatherScore = -25;
    }
  }

  const lp = normGrave(local.piece);
  const lr = normGrave(local.row);
  const ln = normGrave(local.number);
  const op = normGrave(official.tombInfo?.section);
  const orw = normGrave(official.tombInfo?.row);
  const on = normGrave(official.tombInfo?.number);

  const sameTomb = Boolean(lp && op && lp === op && (!lr || !orw || lr === orw) && (!ln || !on || ln === on));
  const tombMismatch = Boolean(lp && op && !sameTomb);
  const tombScore = sameTomb ? 25 : 0;

  if (fatherConflict && !sameTomb) return null;

  const score = Math.max(0, Math.min(100, nameScore + fatherScore + tombScore));
  if (score < 42) return null;

  let basis = 'normalized_name_father';
  if (nameScore >= 43 && fatherExact && sameTomb) basis = 'exact_name_father_tomb';
  else if (nameScore >= 43 && fatherExact && tombMismatch) basis = 'exact_name_father_tomb_diff';
  else if (nameScore >= 43 && sameTomb) basis = 'exact_name_tomb';
  else if (nameScore >= 43 && fatherExact) basis = 'exact_name_father_only';

  return { score, basis, tombMismatch };
}

async function run() {
  const rawSummary = JSON.parse(fs.readFileSync('/tmp/golzarteh_raw_summary.json', 'utf8'));
  const slugMap = fs.existsSync('/tmp/golzarteh_slugs.json')
    ? JSON.parse(fs.readFileSync('/tmp/golzarteh_slugs.json', 'utf8'))
    : {};

  // Build hash buckets by compact fullName & compact lastName for fast O(1) lookup
  const byFullName = new Map();
  const byLastName = new Map();

  for (const item of rawSummary) {
    const fullKey = compactName(`${item.firstName || ''} ${item.lastName || ''}`);
    const lastKey = compactName(item.lastName || '');
    if (fullKey) {
      if (!byFullName.has(fullKey)) byFullName.set(fullKey, []);
      byFullName.get(fullKey).push(item);
    }
    if (lastKey) {
      if (!byLastName.has(lastKey)) byLastName.set(lastKey, []);
      byLastName.get(lastKey).push(item);
    }
  }

  // Read local 28,368 martyrs from golzar_martyrs.xlsx
  const wb = XLSX.readFile(path.join(ROOT, 'public/data/golzar_martyrs.xlsx'));
  const golzarRows = XLSX.utils.sheet_to_json(wb.Sheets['golzar_martyrs'], { defval: '' });
  const outsideRows = XLSX.utils.sheet_to_json(wb.Sheets['outside_golzar_martyrs'], { defval: '' });

  const localMartyrs = [];
  golzarRows.forEach((r, i) => {
    const first = normalizePersian(r['نام']);
    const last = normalizePersian(r['نام خانوادگی']);
    if (`${first} ${last}`.includes('اموات') || first === 'شهید گمنام' || /شهید\s*گمنام/.test(`${first} ${last}`)) {
      return;
    }
    localMartyrs.push({
      localKey: `golzar:${i + 2}`,
      firstName: first,
      lastName: last,
      fatherName: normalizePersian(r['نام پدر']),
      piece: normalizePersian(r['قطعه مزار']),
      row: normalizePersian(r['ردیف مزار']),
      number: normalizePersian(r['شماره مزار'])
    });
  });

  outsideRows.forEach((r, i) => {
    const first = normalizePersian(r['نام']);
    const last = normalizePersian(r['نام خانوادگی']);
    if (`${first} ${last}`.includes('اموات') || /شهید\s*گمنام/.test(`${first} ${last}`)) {
      return;
    }
    localMartyrs.push({
      localKey: `outside:${i + 2}`,
      firstName: first,
      lastName: last,
      fatherName: normalizePersian(r['نام پدر']),
      piece: normalizePersian(r['قطعه مزار']),
      row: normalizePersian(r['ردیف مزار']),
      number: normalizePersian(r['شماره مزار'])
    });
  });

  const indexRows = [];
  let tombMismatchCount = 0;
  const matchedByName = new Map();

  for (const lm of localMartyrs) {
    const fullKey = compactName(`${lm.firstName} ${lm.lastName}`);
    const lastKey = compactName(lm.lastName);
    let candidates = byFullName.get(fullKey) || [];
    if (candidates.length === 0 && lastKey) {
      candidates = byLastName.get(lastKey) || [];
    }
    let bestCandidate = null;
    let bestScoreObj = null;

    for (const c of candidates) {
      const s = scoreMatch(lm, c);
      if (!s) continue;
      if (!bestScoreObj || s.score > bestScoreObj.score) {
        bestScoreObj = s;
        bestCandidate = c;
      }
    }

    if (bestCandidate && bestScoreObj) {
      if (bestScoreObj.tombMismatch) tombMismatchCount++;
      const ti = bestCandidate.tombInfo || {};
      const slug = slugMap[String(bestCandidate.id)] || '';
      const tombPhoto0 = Array.isArray(ti.tombPhotos) && ti.tombPhotos.length > 0 ? String(ti.tombPhotos[0]) : '';
      indexRows.push([
        lm.localKey,
        Number(bestCandidate.id),
        slug,
        String(bestCandidate.firstName || ''),
        String(bestCandidate.lastName || ''),
        String(bestCandidate.fatherName || ''),
        bestCandidate.golzarInfoCode ?? null,
        String(bestCandidate.uniqueCode || ''),
        String(ti.section || ''),
        String(ti.row || ''),
        String(ti.number || ''),
        String(bestCandidate.mainPhoto || ''),
        String(bestCandidate.thumbnailKey || ''),
        tombPhoto0,
        ti.latitude ? String(ti.latitude) : null,
        ti.longitude ? String(ti.longitude) : null,
        bestScoreObj.score,
        bestScoreObj.basis,
        bestScoreObj.tombMismatch ? 1 : 0
      ]);
      matchedByName.set(fullKey, Number(bestCandidate.id));
      const officialFullKey = compactName(`${bestCandidate.firstName || ''} ${bestCandidate.lastName || ''}`);
      if (officialFullKey) matchedByName.set(officialFullKey, Number(bestCandidate.id));
    }
  }

  const indexPayload = {
    schemaVersion: 'golzarteh-index-v1.0',
    generatedAt: new Date().toISOString(),
    sourceTotalOnGolzarteh: rawSummary.length,
    localTotalMartyrs: localMartyrs.length,
    matchedCount: indexRows.length,
    tombMismatchCount,
    columns: [
      'localKey', 'gid', 'slug', 'firstName', 'lastName', 'fatherName',
      'golzarInfoCode', 'uniqueCode', 'section', 'row', 'number',
      'mainPhoto', 'thumbnailKey', 'tombPhoto0', 'lat', 'lng',
      'matchScore', 'matchBasis', 'tombMismatch'
    ],
    rows: indexRows
  };

  fs.writeFileSync(
    path.join(ROOT, 'public/data/golzarteh_index.json'),
    JSON.stringify(indexPayload)
  );
  console.log(
    `Generated golzarteh_index.json: matched ${indexRows.length}/${localMartyrs.length} local martyrs (${tombMismatchCount} with tomb mismatch flagged), size=${(fs.statSync(path.join(ROOT, 'public/data/golzarteh_index.json')).size / 1024 / 1024).toFixed(2)} MB`
  );

  // Collect all unique martyr names linked to library books so we pre-enrich their full bio + wills + full photos
  const linkedGids = new Set([66, 19494, 33326, 6012, 6809]);
  const extractNamesFromText = (text) => {
    for (const m of text.matchAll(/martyrNameRaw\s*:\s*['"]([^'"]+)['"]/g)) {
      const k = compactName(m[1]);
      if (matchedByName.has(k)) linkedGids.add(matchedByName.get(k));
    }
  };
  for (const relPath of ['src/data/markazAsnadData.ts', 'src/data/soorehMehrResearch.ts']) {
    const p = path.join(ROOT, relPath);
    if (fs.existsSync(p)) extractNamesFromText(fs.readFileSync(p, 'utf8'));
  }

  // Also parse sooreh_mehr_book_martyr_research.json Data matrix (Cells[4].Value is column E: martyr name)
  const smPath = path.join(ROOT, 'public/data/sooreh_mehr_book_martyr_research.json');
  if (fs.existsSync(smPath)) {
    const sm = JSON.parse(fs.readFileSync(smPath, 'utf8'));
    const sheets = Array.isArray(sm?.Sheets) ? sm.Sheets : Object.values(sm?.Sheets || {});
    for (const sheet of sheets) {
      const dataRows = sheet?.Data || [];
      for (const row of dataRows.slice(1)) {
        const mn = Array.isArray(row)
          ? row[4]
          : row?.Cells?.[4]?.Value || row?.Cells?.[4]?.DisplayText || '';
        if (mn && mn !== '*') {
          const k = compactName(mn);
          if (k && matchedByName.has(k)) linkedGids.add(matchedByName.get(k));
        }
      }
    }
  }

  // Also add library_book_martyr_relations_source.xlsx if present
  const relXlsx = path.join(ROOT, 'docs/data/library_book_martyr_relations_source.xlsx');
  if (fs.existsSync(relXlsx)) {
    const rwb = XLSX.readFile(relXlsx);
    for (const sname of rwb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(rwb.Sheets[sname], { defval: '' });
      for (const r of rows) {
        const mn = r['نام و نام خانوادگی شهید'] || r['نام شهید'] || '';
        const k = compactName(mn);
        if (k && matchedByName.has(k)) linkedGids.add(matchedByName.get(k));
      }
    }
  }

  const profilesOutPath = path.join(ROOT, 'public/data/golzarteh_profiles.json');
  const profilesByGid = fs.existsSync(profilesOutPath)
    ? (JSON.parse(fs.readFileSync(profilesOutPath, 'utf8')).profilesByGid || {})
    : {};

  const targetGids = Array.from(linkedGids).filter((gid) => !profilesByGid[String(gid)]);
  console.log(`Fetching full official details (bio, will, gallery) for ${targetGids.length} newly linked martyrs (already cached: ${Object.keys(profilesByGid).length})...`);

  let fetchedCount = Object.keys(profilesByGid).length;

  // Throttle safely (< 180 req/min -> batch of 3 every 950ms) to avoid 429
  for (let i = 0; i < targetGids.length; i += 3) {
    const batch = targetGids.slice(i, i + 3);
    await Promise.all(
      batch.map(async (gid) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch(`https://api.golzarteh.ir/api/v1/martyr/detail/${gid}`, {
              headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (res.status === 429) {
              await new Promise((r) => setTimeout(r, 8000));
              continue;
            }
            if (!res.ok) break;
            const json = await res.json();
            const d = json?.data;
            if (!d) break;

            const bioArr = Array.isArray(d.biographies) ? d.biographies : [];
            const bioTexts = bioArr
              .map((b) => stripHtmlToText(b?.text || ''))
              .filter(Boolean);
            if (d.biography && typeof d.biography === 'string') {
              const singleBio = stripHtmlToText(d.biography);
              if (singleBio && !bioTexts.includes(singleBio)) bioTexts.unshift(singleBio);
            }

            const willsArr = Array.isArray(d.wills) ? d.wills : [];
            const cleanWills = willsArr
              .map((w) => ({
                id: w.id,
                title: w.title || undefined,
                text: stripHtmlToText(w.text || '')
              }))
              .filter((w) => w.text.length > 0);

            const ti = d.tombInfo || {};
            const slug = slugMap[String(gid)] || `${String(d.firstName || '').trim()}-${String(d.lastName || '').trim()}-${gid}`.replace(/\s+/g, '-');

            profilesByGid[String(gid)] = {
              gid: Number(gid),
              slug,
              officialUrl: `https://golzarteh.ir/martyr/${encodeURIComponent(slug)}`,
              firstName: String(d.firstName || ''),
              lastName: String(d.lastName || ''),
              fatherName: String(d.fatherName || ''),
              birthDateDisplay: formatApiDate(d.birthDay, d.birthMonth, d.birthYear),
              birthYear: d.birthYear ? String(d.birthYear) : '',
              birthPlace: String(d.birthPlace || ''),
              martyrdomDateDisplay: formatApiDate(d.martyrdomDay, d.martyrdomMonth, d.martyrdomYear),
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
            fetchedCount++;
            break;
          } catch {
            // retry once
          }
        }
      })
    );
    await new Promise((r) => setTimeout(r, 950));
  }

  const profilesPayload = {
    schemaVersion: 'golzarteh-profiles-v1.0',
    generatedAt: new Date().toISOString(),
    profileCount: Object.keys(profilesByGid).length,
    profilesByGid
  };

  fs.writeFileSync(
    path.join(ROOT, 'public/data/golzarteh_profiles.json'),
    JSON.stringify(profilesPayload)
  );
  console.log(
    `Generated golzarteh_profiles.json: ${fetchedCount} full profiles enriched, size=${(fs.statSync(path.join(ROOT, 'public/data/golzarteh_profiles.json')).size / 1024).toFixed(1)} KB`
  );
}

run();
