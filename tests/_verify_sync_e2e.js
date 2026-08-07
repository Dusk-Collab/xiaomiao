/* 跨设备同步校验：启动两个独立 Chrome 配置（各自独立的 localStorage，等价于两台物理设备），
 * 手机端下单，断言电脑端后台在「不刷新」的情况下实时收到订单；再反向验证电脑打烊同步到手机。
 * 这是用户实际场景（手机扫码点单 → 电脑后台弹出新订单）的真实模拟。
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8931';
const LOG = __dirname + '/_sync_e2e_log.txt';
try { fs.unlinkSync(LOG); } catch (e) {}
function say(s) { fs.appendFileSync(LOG, s + '\n'); console.log(s); }
let pass = 0, fail = 0;
const errors = [];
function ok(name, cond, extra) {
  if (cond) { say('  PASS  ' + name); pass++; }
  else { say('  FAIL  ' + name + (extra ? '  → ' + extra : '')); fail++; }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'om_sync_'));
const phoneDir = path.join(tmp, 'phone');
const pcDir = path.join(tmp, 'pc');
fs.mkdirSync(phoneDir, { recursive: true });
fs.mkdirSync(pcDir, { recursive: true });

async function launch(dir) {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    userDataDir: dir,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required']
  });
}

async function waitOnline(page, who) {
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(() => window.__SYNC__ || '');
    if (s === 'online') return true;
    await sleep(500);
  }
  return false;
}

(async () => {
  const phone = await launch(phoneDir);
  const pc = await launch(pcDir);
  const phonePage = await phone.newPage();
  const pcPage = await pc.newPage();
  for (const [who, pg] of [['phone', phonePage], ['pc', pcPage]]) {
    pg.on('pageerror', e => errors.push(`[${who}] pageerror: ${e.message}`));
    pg.on('console', m => { if (m.type() === 'error') errors.push(`[${who}] console.error: ${m.text()}`); });
    pg.on('requestfailed', r => errors.push(`[${who}] 资源加载失败: ${r.url()}`));
    pg.on('dialog', async d => { await d.accept(); });
  }

  /* 手机端进入点餐页 */
  await phonePage.goto(BASE + '/customer.html', { waitUntil: 'networkidle0' });
  await phonePage.evaluate(() => { try { localStorage.removeItem('om_my_order'); } catch (e) {} });
  await phonePage.reload({ waitUntil: 'networkidle0' });
  await sleep(400);
  await phonePage.evaluate(() => { const m = document.getElementById('noticeMask'); if (m) m.classList.remove('show'); });

  /* 电脑端进入商家后台 */
  await pcPage.goto(BASE + '/admin.html', { waitUntil: 'networkidle0' });
  await sleep(400);

  const phoneOnline = await waitOnline(phonePage, 'phone');
  const pcOnline = await waitOnline(pcPage, 'pc');
  ok('手机端连上云端同步', phoneOnline);
  ok('电脑端连上云端同步', pcOnline);

  if (!phoneOnline || !pcOnline) {
    say('  跳过下单同步断言（未连上云端）');
  } else {
    /* 手机端下单（走真实 write→广播 路径） */
    const code = await phonePage.evaluate(() => {
      const o = window.Store.createOrder({
        items: [{ name: '冰鲜柠檬水', price: 4, qty: 2 }],
        goodsTotal: 8, deliveryFee: 0, discount: 0, total: 8,
        mode: 'pickup', phone: '', remark: '跨设备同步测试'
      });
      return o.code;
    });
    ok('手机端生成取餐码', !!code, String(code));

    /* 电脑端「不刷新」实时收到订单 */
    let got = null;
    for (let i = 0; i < 30; i++) {
      got = await pcPage.evaluate((c) => {
        const o = window.Store.read().orders.find(x => x.code === c);
        return o ? { code: o.code, total: o.total, exists: true } : null;
      }, code);
      if (got) break;
      await sleep(500);
    }
    ok('电脑后台实时收到手机订单（无需刷新）', !!got, JSON.stringify(got));
    if (got) ok('订单金额同步正确 ¥8.00', got.total === 8, String(got.total));

    /* 反向：电脑打烊，手机应看到打烊遮罩 */
    await pcPage.evaluate(() => window.Store.update(d => { d.shop.manualClose = true; }));
    let closed = false;
    for (let i = 0; i < 30; i++) {
      closed = await phonePage.evaluate(() => {
        const m = document.getElementById('closedMask');
        return !!(m && m.classList.contains('show'));
      });
      if (closed) break;
      await sleep(500);
    }
    ok('电脑打烊实时同步到手机（显示打烊遮罩）', closed);
    /* 恢复营业，避免影响后续 */
    await pcPage.evaluate(() => window.Store.update(d => { d.shop.manualClose = false; }));
  }

  await phone.close();
  await pc.close();

  say('');
  if (errors.length) {
    say('运行时错误 / 警告：');
    [...new Set(errors)].forEach(e => say('  ! ' + e));
    fail += errors.length;
  } else {
    say('运行时错误：无 ✓');
  }
  console.log(`\n跨设备同步校验：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => {
  fs.writeFileSync(__dirname + '/_sync_e2e_error.txt', String(e && e.stack || e));
  console.log('\n>>> 测试异常：' + (e && e.message || e));
  console.log('>>> 已收集的页面错误：\n' + [...new Set(errors)].map(x => '    ' + x).join('\n'));
  setTimeout(() => process.exit(1), 100);
});
