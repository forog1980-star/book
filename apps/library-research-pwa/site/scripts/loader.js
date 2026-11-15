const root = new URL('../', import.meta.url);

async function readGzip(path) {
  const response = await fetch(new URL(path, root));
  if (!response.ok) throw new Error('بارگذاری بخش برنامه ناموفق بود: ' + path + ' (' + response.status + ')');
  if (!('DecompressionStream' in window)) throw new Error('مرورگر این دستگاه فشرده‌گشایی لازم برای اجرای آفلاین را پشتیبانی نمی‌کند.');
  return await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).text();
}

function objectUrl(source, type) {
  return URL.createObjectURL(new Blob([source], { type }));
}

async function loadLocalPersianFont() {
  try {
    const response = await fetch(new URL('fonts/Vazirmatn-variable.woff2.b64', root));
    if (!response.ok) throw new Error('فونت فارسی محلی در دسترس نیست.');
    const encoded = (await response.text()).trim();
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const fontUrl = URL.createObjectURL(new Blob([bytes], { type: 'font/woff2' }));
    const fontStyle = document.createElement('style');
    fontStyle.textContent = "@font-face{font-family:'Vazirmatn';src:url('" + fontUrl + "') format('woff2');font-style:normal;font-weight:100 900;font-display:swap;}";
    document.head.appendChild(fontStyle);
  } catch (error) {
    console.warn('فونت محلی بارگذاری نشد؛ از فونت فارسی نصب‌شده روی دستگاه استفاده می‌شود.', error);
  }
}

async function start() {
  await loadLocalPersianFont();
  const css = await readGzip('styles.css.gz');
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = objectUrl(css, 'text/css');
  document.head.appendChild(stylesheet);

  // The local theme loads after the base stylesheet and is part of the PWA shell.
  const theme = document.createElement('link');
  theme.rel = 'stylesheet';
  theme.href = new URL('theme.css', root).href;
  const themeReady = new Promise((resolve, reject) => {
    theme.onload = resolve;
    theme.onerror = () => reject(new Error('بارگذاری پوسته رنگی برنامه ناموفق بود.'));
  });
  document.head.appendChild(theme);
  await themeReady;

  const domainUrl = objectUrl(await readGzip('dist/domain.js.gz'), 'text/javascript');
  const dbSource = (await readGzip('dist/db.js.gz')).replaceAll("'./domain.js'", JSON.stringify(domainUrl));
  const dbUrl = objectUrl(dbSource, 'text/javascript');

  const backupSource = (await readGzip('dist/backup.js.gz'))
    .replaceAll("'./db.js'", JSON.stringify(dbUrl))
    .replaceAll("'./domain.js'", JSON.stringify(domainUrl));
  const backupUrl = objectUrl(backupSource, 'text/javascript');

  const relationsUrl = objectUrl(await readGzip('dist/relations.js.gz'), 'text/javascript');
  const xlsxUrl = objectUrl(await readGzip('dist/xlsx.js.gz'), 'text/javascript');
  const appSource = (await readGzip('dist/app.js.gz'))
    .replaceAll("'./db.js'", JSON.stringify(dbUrl))
    .replaceAll("'./domain.js'", JSON.stringify(domainUrl))
    .replaceAll("'./backup.js'", JSON.stringify(backupUrl))
    .replaceAll("'./relations.js'", JSON.stringify(relationsUrl))
    .replaceAll("'./xlsx.js'", JSON.stringify(xlsxUrl));
  await import(objectUrl(appSource, 'text/javascript'));
}

start().catch((error) => {
  const rootNode = document.querySelector('#app');
  if (rootNode) {
    const panel = document.createElement('section');
    panel.className = 'boot-screen';
    const heading = document.createElement('h1');
    heading.textContent = 'برنامه اجرا نشد';
    const message = document.createElement('p');
    message.textContent = String(error && error.message || error);
    const hint = document.createElement('p');
    hint.textContent = 'برای بارگذاری اولیه، اتصال امن و فایل‌های برنامه را بررسی کنید.';
    panel.append(heading, message, hint);
    rootNode.replaceChildren(panel);
  }
  console.error(error);
});
