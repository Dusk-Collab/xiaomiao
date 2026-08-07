/* 校验自研二维码生成器：生成 -> 转成像素 -> 用 jsQR 解码 -> 比对原文 */
const fs = require('fs');
const path = require('path');
const jsQR = require('jsqr');

// 加载 qrcode.js（它挂在 window 上）
global.window = { devicePixelRatio: 1 };
const src = fs.readFileSync(path.join(__dirname, 'assets', 'qrcode.js'), 'utf8');
eval(src);
const QR = global.window.QR;

const cases = [
  'https://example.com/customer.html',
  'https://abc-1234567.cloudstudio.work/customer.html?t=A3',
  'http://localhost:8080/customer.html',
  'https://very-long-sandbox-domain-name-example.cloudstudio.work/demo/customer.html?t=%E5%A4%A7%E5%8E%852%E5%8F%B7%E6%A1%8C',
  '甜时光茶饮·人民路店 扫码点餐'
];

let pass = 0, fail = 0;
for (const text of cases) {
  try {
    const qr = QR.generate(text);
    const quiet = 4, scale = 4;
    const size = qr.size, total = (size + quiet * 2) * scale;
    const data = new Uint8ClampedArray(total * total * 4).fill(255);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!qr.modules[r][c]) continue;
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
          const y = (r + quiet) * scale + dy, x = (c + quiet) * scale + dx;
          const i = (y * total + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
    const res = jsQR(data, total, total);
    if (res && res.data === text) {
      console.log(`  PASS  v${(size - 17) / 4} ${size}x${size}  "${text.slice(0, 46)}${text.length > 46 ? '…' : ''}"`);
      pass++;
    } else {
      console.log(`  FAIL  解码结果=${res ? JSON.stringify(res.data) : 'null'}  原文="${text}"`);
      fail++;
    }
  } catch (e) {
    console.log(`  ERROR "${text}" -> ${e.message}`);
    fail++;
  }
}
console.log(`\n二维码校验：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
