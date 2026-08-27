/* 轻量二维码生成器 —— Byte Mode / EC Level M / Version 1-10
 * 无外部依赖，离线可用。用法： QR.render(canvas, text, size)
 */
(function (global) {
  'use strict';

  /* ---------- 伽罗华域 GF(256) ---------- */
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();
  function gmul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  function rsGenPoly(n) {
    var poly = [1];
    for (var i = 0; i < n; i++) {
      var next = new Array(poly.length + 1).fill(0);
      for (var j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gmul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecLen) {
    var gen = rsGenPoly(ecLen);
    var res = data.concat(new Array(ecLen).fill(0));
    for (var i = 0; i < data.length; i++) {
      var c = res[i];
      if (c !== 0) for (var j = 0; j < gen.length; j++) res[i + j] ^= gmul(gen[j], c);
    }
    return res.slice(data.length);
  }

  /* ---------- 版本参数（EC Level M） ---------- */
  // [总码字, 每块纠错码字, [[块数, 每块数据码字], ...]]
  var VER = {
    1:  [26,  10, [[1, 16]]],
    2:  [44,  16, [[1, 28]]],
    3:  [70,  26, [[1, 44]]],
    4:  [100, 18, [[2, 32]]],
    5:  [134, 24, [[2, 43]]],
    6:  [172, 16, [[4, 27]]],
    7:  [196, 18, [[4, 31]]],
    8:  [242, 22, [[2, 38], [2, 39]]],
    9:  [292, 22, [[3, 36], [2, 37]]],
    10: [346, 26, [[4, 43], [1, 44]]]
  };
  var BYTE_CAP = { 1: 14, 2: 26, 3: 42, 4: 62, 5: 84, 6: 106, 7: 122, 8: 152, 9: 180, 10: 213 };
  var ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
  };
  var FORMAT_M = [0x5412, 0x5125, 0x5E7C, 0x5B4B, 0x45F9, 0x40CE, 0x4F97, 0x4AA0];
  var VERSION_BITS = { 7: 0x07C94, 8: 0x085BC, 9: 0x09A99, 10: 0x0A4D3 };
  var REMAINDER = { 1: 0, 2: 7, 3: 7, 4: 7, 5: 7, 6: 7, 7: 0, 8: 0, 9: 0, 10: 0 };

  /* ---------- UTF-8 编码 ---------- */
  function toBytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xC0 | (c >> 6), 0x80 | (c & 63)); }
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c & 0x3FF) << 10) + (c2 & 0x3FF);
        out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else { out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    }
    return out;
  }

  /* ---------- 比特流 ---------- */
  function BitBuf() { this.bits = []; }
  BitBuf.prototype.put = function (val, len) {
    for (var i = len - 1; i >= 0; i--) this.bits.push((val >>> i) & 1);
  };

  /* ---------- 主流程 ---------- */
  function encode(text) {
    var bytes = toBytes(text);
    var ver = 0;
    for (var v = 1; v <= 10; v++) { if (bytes.length <= BYTE_CAP[v]) { ver = v; break; } }
    if (!ver) throw new Error('内容过长，超出二维码容量');

    var spec = VER[ver], totalCw = spec[0], ecLen = spec[1], groups = spec[2];
    var dataCwCount = 0;
    groups.forEach(function (g) { dataCwCount += g[0] * g[1]; });

    var bb = new BitBuf();
    bb.put(4, 4);                                  // Byte mode
    bb.put(bytes.length, ver <= 9 ? 8 : 16);       // 字符计数
    for (var i = 0; i < bytes.length; i++) bb.put(bytes[i], 8);

    var cap = dataCwCount * 8;
    var term = Math.min(4, cap - bb.bits.length);
    bb.put(0, term);
    while (bb.bits.length % 8 !== 0) bb.bits.push(0);

    var dataCw = [];
    for (var k = 0; k < bb.bits.length; k += 8) {
      var byte = 0;
      for (var m = 0; m < 8; m++) byte = (byte << 1) | bb.bits[k + m];
      dataCw.push(byte);
    }
    var pad = [0xEC, 0x11], pi = 0;
    while (dataCw.length < dataCwCount) dataCw.push(pad[pi++ % 2]);

    // 分块
    var blocks = [], ecBlocks = [], offset = 0;
    groups.forEach(function (g) {
      for (var b = 0; b < g[0]; b++) {
        var chunk = dataCw.slice(offset, offset + g[1]);
        offset += g[1];
        blocks.push(chunk);
        ecBlocks.push(rsEncode(chunk, ecLen));
      }
    });

    // 交错
    var final = [], maxLen = Math.max.apply(null, blocks.map(function (b) { return b.length; }));
    for (var c = 0; c < maxLen; c++) {
      for (var bi = 0; bi < blocks.length; bi++) if (c < blocks[bi].length) final.push(blocks[bi][c]);
    }
    for (var e = 0; e < ecLen; e++) {
      for (var bj = 0; bj < ecBlocks.length; bj++) final.push(ecBlocks[bj][e]);
    }

    return { version: ver, codewords: final, remainder: REMAINDER[ver] };
  }

  /* ---------- 矩阵构建 ---------- */
  function buildMatrix(ver, codewords, remainder) {
    var size = 17 + 4 * ver;
    var mat = [], reserved = [];
    for (var i = 0; i < size; i++) {
      mat.push(new Array(size).fill(0));
      reserved.push(new Array(size).fill(false));
    }

    function setFinder(r, c) {
      for (var dr = -1; dr <= 7; dr++) for (var dc = -1; dc <= 7; dc++) {
        var rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        var on = (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) &&
          (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        mat[rr][cc] = on ? 1 : 0;
        reserved[rr][cc] = true;
      }
    }
    setFinder(0, 0); setFinder(0, size - 7); setFinder(size - 7, 0);

    // 定位图案
    for (var t = 8; t < size - 8; t++) {
      var val = (t % 2 === 0) ? 1 : 0;
      mat[6][t] = val; reserved[6][t] = true;
      mat[t][6] = val; reserved[t][6] = true;
    }

    // 校正图案
    var ap = ALIGN[ver];
    for (var a = 0; a < ap.length; a++) for (var b = 0; b < ap.length; b++) {
      var ar = ap[a], ac = ap[b];
      if ((ar <= 8 && ac <= 8) || (ar <= 8 && ac >= size - 9) || (ar >= size - 9 && ac <= 8)) continue;
      for (var dr2 = -2; dr2 <= 2; dr2++) for (var dc2 = -2; dc2 <= 2; dc2++) {
        var on2 = Math.max(Math.abs(dr2), Math.abs(dc2)) !== 1;
        mat[ar + dr2][ac + dc2] = on2 ? 1 : 0;
        reserved[ar + dr2][ac + dc2] = true;
      }
    }

    // 保留格式信息区
    for (var f = 0; f < 9; f++) {
      if (!reserved[8][f]) { reserved[8][f] = true; mat[8][f] = 0; }
      if (!reserved[f][8]) { reserved[f][8] = true; mat[f][8] = 0; }
    }
    for (var f2 = 0; f2 < 8; f2++) {
      reserved[8][size - 1 - f2] = true;
      reserved[size - 1 - f2][8] = true;
    }
    mat[size - 8][8] = 1; reserved[size - 8][8] = true; // dark module

    // 版本信息区
    if (ver >= 7) {
      for (var vi = 0; vi < 6; vi++) for (var vj = 0; vj < 3; vj++) {
        reserved[size - 11 + vj][vi] = true;
        reserved[vi][size - 11 + vj] = true;
      }
    }

    // 数据比特流
    var bits = [];
    codewords.forEach(function (cw) { for (var z = 7; z >= 0; z--) bits.push((cw >> z) & 1); });
    for (var r0 = 0; r0 < remainder; r0++) bits.push(0);

    var idx = 0, up = true;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (var n = 0; n < size; n++) {
        var row = up ? size - 1 - n : n;
        for (var s = 0; s < 2; s++) {
          var cc2 = col - s;
          if (reserved[row][cc2]) continue;
          mat[row][cc2] = idx < bits.length ? bits[idx] : 0;
          idx++;
        }
      }
      up = !up;
    }

    return { mat: mat, reserved: reserved, size: size };
  }

  function maskFn(i, r, c) {
    switch (i) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    }
  }

  function penalty(m, size) {
    var score = 0, i, j, run, dark = 0;
    // 规则1：同色连续
    for (i = 0; i < size; i++) {
      run = 1;
      for (j = 1; j < size; j++) {
        if (m[i][j] === m[i][j - 1]) run++; else { if (run >= 5) score += run - 2; run = 1; }
      }
      if (run >= 5) score += run - 2;
      run = 1;
      for (j = 1; j < size; j++) {
        if (m[j][i] === m[j - 1][i]) run++; else { if (run >= 5) score += run - 2; run = 1; }
      }
      if (run >= 5) score += run - 2;
    }
    // 规则2：2x2 同色块
    for (i = 0; i < size - 1; i++) for (j = 0; j < size - 1; j++) {
      var v = m[i][j];
      if (v === m[i][j + 1] && v === m[i + 1][j] && v === m[i + 1][j + 1]) score += 3;
    }
    // 规则3：1:1:3:1:1 模式
    var pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    function match(arr, p) {
      for (var q = 0; q < 11; q++) if (arr[q] !== p[q]) return false;
      return true;
    }
    for (i = 0; i < size; i++) for (j = 0; j <= size - 11; j++) {
      var rowArr = [], colArr = [];
      for (var k2 = 0; k2 < 11; k2++) { rowArr.push(m[i][j + k2]); colArr.push(m[j + k2][i]); }
      if (match(rowArr, pat1) || match(rowArr, pat2)) score += 40;
      if (match(colArr, pat1) || match(colArr, pat2)) score += 40;
    }
    // 规则4：黑白比例
    for (i = 0; i < size; i++) for (j = 0; j < size; j++) if (m[i][j]) dark++;
    var pct = dark * 100 / (size * size);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return score;
  }

  function generate(text) {
    var enc = encode(text);
    var built = buildMatrix(enc.version, enc.codewords, enc.remainder);
    var size = built.size, reserved = built.reserved;
    var best = null, bestScore = Infinity, bestMask = 0;

    for (var mk = 0; mk < 8; mk++) {
      var cand = built.mat.map(function (row) { return row.slice(); });
      for (var r = 0; r < size; r++) for (var c = 0; c < size; c++) {
        if (!reserved[r][c] && maskFn(mk, r, c)) cand[r][c] ^= 1;
      }
      applyFormat(cand, size, mk);
      if (enc.version >= 7) applyVersion(cand, size, enc.version);
      var sc = penalty(cand, size);
      if (sc < bestScore) { bestScore = sc; best = cand; bestMask = mk; }
    }
    return { modules: best, size: size };
  }

  function applyFormat(m, size, mask) {
    var fmt = FORMAT_M[mask];
    for (var i = 0; i < 15; i++) {
      var bit = (fmt >> (14 - i)) & 1;
      // 左上
      if (i < 6) m[8][i] = bit;
      else if (i === 6) m[8][7] = bit;
      else if (i === 7) m[8][8] = bit;
      else if (i === 8) m[7][8] = bit;
      else m[14 - i][8] = bit;
      // 右下 + 右上
      if (i < 8) m[size - 1 - i][8] = bit;
      else m[8][size - 15 + i] = bit;
    }
    m[size - 8][8] = 1;
  }

  function applyVersion(m, size, ver) {
    var bits = VERSION_BITS[ver];
    for (var i = 0; i < 18; i++) {
      var bit = (bits >> i) & 1;
      var r = Math.floor(i / 3), c = i % 3;
      m[size - 11 + c][r] = bit;
      m[r][size - 11 + c] = bit;
    }
  }

  /* ---------- 渲染 ---------- */
  function render(canvas, text, pxSize, opts) {
    opts = opts || {};
    var dark = opts.dark || '#1a1a1a', light = opts.light || '#ffffff';
    var qr = generate(text);
    var quiet = 4;
    var total = qr.size + quiet * 2;
    var dpr = global.devicePixelRatio || 1;
    var scale = Math.floor((pxSize * dpr) / total) || 1;
    var px = total * scale;

    canvas.width = px; canvas.height = px;
    canvas.style.width = pxSize + 'px';
    canvas.style.height = pxSize + 'px';

    var ctx = canvas.getContext('2d');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = dark;
    for (var r = 0; r < qr.size; r++) {
      for (var c = 0; c < qr.size; c++) {
        if (qr.modules[r][c]) {
          ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
        }
      }
    }
    return canvas;
  }

  global.QR = { generate: generate, render: render };
})(window);
