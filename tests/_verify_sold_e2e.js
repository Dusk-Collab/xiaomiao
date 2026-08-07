// 验证商家端「月售」字段可自由编辑，并同步到顾客端展示
const puppeteer = require('puppeteer-core');
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8934';
const EXE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ok -', m); } else { fail++; console.log('  FAIL -', m); } }

(async () => {
  const browser = await puppeteer.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] });
  const errs = [];

  // ---- 商家端 ----
  const a = await browser.newPage();
  a.on('pageerror', e => errs.push('admin:' + e.message));
  await a.goto(BASE + '/admin.html', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 800));
  // 默认页是订单页，切到商品管理页才会渲染商品表
  await a.evaluate(() => { if (typeof go === 'function') go('products'); });
  await new Promise(r => setTimeout(r, 500));

  // 表头含「月售」
  ok(await a.evaluate(() => document.body.innerHTML.includes('月售')), 'admin 表头含「月售」列');

  // 找到月售输入框（onchange 含 'sold'）并改成 2026
  const edited = await a.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[onchange]'));
    const inp = inputs.find(el => /'sold'/.test(el.getAttribute('onchange') || ''));
    if (!inp) return false;
    inp.value = '2026';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  ok(edited, '找到月售输入框并触发修改');
  await new Promise(r => setTimeout(r, 400));

  const soldVal = await a.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[onchange]'));
    const inp = inputs.find(el => /'sold'/.test(el.getAttribute('onchange') || ''));
    return inp ? +inp.value : null;
  });
  ok(soldVal === 2026, '编辑后输入框值为 2026 (got ' + soldVal + ')');

  const stored = await a.evaluate(() => window.D ? D.products[0].sold : null);
  ok(stored === 2026, 'D.products[0].sold 已持久为 2026 (got ' + stored + ')');

  // 改回 0 也允许（自由修改，含清零）
  const cleared = await a.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[onchange]'));
    const inp = inputs.find(el => /'sold'/.test(el.getAttribute('onchange') || ''));
    inp.value = '0';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return +inp.value;
  });
  ok(cleared === 0, '可清空为 0 (got ' + cleared + ')');

  // ---- 顾客端同步展示 ----
  const c = await browser.newPage();
  c.on('pageerror', e => errs.push('cust:' + e.message));
  await c.goto(BASE + '/customer.html', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 800));
  const customerSold = await c.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.item-sold'));
    return els.map(e => e.textContent).filter(t => /月售/.test(t));
  });
  ok(customerSold.length > 0, '顾客端存在「月售」展示文本');

  ok(errs.length === 0, '无 JS 运行时错误' + (errs.length ? ' -> ' + errs.join(' | ') : ''));

  await browser.close();
  console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('运行异常:', e); process.exit(2); });
