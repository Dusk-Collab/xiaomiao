// 验证「下载的二维码」现在是带店铺名/底部说明的卡片 PNG
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8934';
const EXE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ok -', m); } else { fail++; console.log('  FAIL -', m); } }

(async () => {
  const browser = await puppeteer.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] });
  const pg = await browser.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));

  // 拦截下载，把 DataURL 取回来
  const dataUrls = [];
  await pg._client().send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: process.env.TEMP || 'C:\\Users\\Administrator\\AppData\\Local\\Temp' });
  // 同时拦截 anchor click 拿 dataURL（更稳）
  pg.on('console', m => { /* noop */ });

  await pg.goto(BASE + '/admin.html', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 600));
  await pg.evaluate(() => { if (typeof go === 'function') go('qrcode'); });
  await new Promise(r => setTimeout(r, 500));

  ok(await pg.evaluate(() => typeof buildQRCardCanvas === 'function'), 'buildQRCardCanvas 函数已挂载');

  // 直接调用函数合成 PNG
  const result = await pg.evaluate(() => {
    var src = document.getElementById('qrCanvas');
    var cv = buildQRCardCanvas(src, '小淼餐厅', '');
    var png = cv.toDataURL('image/png');
    // 顶部采样像素（应该是橙 #E8841C）
    var topPx = cv.getContext('2d').getImageData(160, 30, 1, 1).data;
    // 中心采样像素（QR 区，应该是白或黑）
    var midPx = cv.getContext('2d').getImageData(160, 230, 1, 1).data;
    // 底部采样像素（应该是白底）
    var botPx = cv.getContext('2d').getImageData(160, 420, 1, 1).data;
    return {
      png: png,
      len: png.length,
      W: cv.width, H: cv.height,
      top: [topPx[0], topPx[1], topPx[2]],
      mid: [midPx[0], midPx[1], midPx[2]],
      bot: [botPx[0], botPx[1], botPx[2]]
    };
  });

  ok(result.W === 320 && result.H === 460, '合成 canvas 尺寸 320x460 (got ' + result.W + 'x' + result.H + ')');
  ok(result.top[0] > 200 && result.top[1] > 100 && result.top[2] < 60, '顶部像素为橙色 #E8841C (' + result.top.join(',') + ')');
  ok(result.bot[0] > 230 && result.bot[1] > 230 && result.bot[2] > 230, '底部像素接近白色 (' + result.bot.join(',') + ')');
  ok(result.png.length > 8000, 'PNG dataURL 长度合理 (>8KB) = ' + result.len);

  // 写盘肉眼验证
  var b64 = result.png.split(',')[1];
  var bin = Buffer.from(b64, 'base64');
  fs.writeFileSync(process.env.TEMP + '/_qr_card_general.png', bin);

  // 桌号场景
  const table = await pg.evaluate(() => {
    var ti = document.getElementById('tableInput'); if (ti) ti.value = 'A3';
    var src = document.getElementById('qrCanvas');
    var cv = buildQRCardCanvas(src, '小淼餐厅', 'A3');
    var png = cv.toDataURL('image/png');
    return png;
  });
  fs.writeFileSync(process.env.TEMP + '/_qr_card_tableA3.png', Buffer.from(table.split(',')[1], 'base64'));

  ok(errs.length === 0, '无 JS 运行时错误' + (errs.length ? ' -> ' + errs.join(' | ') : ''));

  await browser.close();
  console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('运行异常:', e); process.exit(2); });