/* 江南味道 · 在线格式 / 背景编辑器
 * 仅在 URL 带 ?edit=1 时激活，不影响正式访问。
 * 右侧独立抽屉式编辑界面：左半为实时预览，右半为控件。
 * 拖动滑块/选颜色/填背景图实时预览，点「导出CSS」复制文本后发给开发者即可落盘。
 */
(function () {
  function enabled() {
    return /[?&]edit(=1)?\b/.test(location.search) || localStorage.getItem('jn_designer') === '1';
  }
  if (!enabled()) return;

  function cleanUrl(u) {
    u = (u || '').trim();
    u = u.replace(/^['"]+|['"]+$/g, '');
    return u;
  }

  var CONTROLS = [
    // ===== 配色（主题色）=====
    { g: '配色', t: 'color', id: 'ink',      label: '主文字色',   v: '--ink',      def: '#23201B' },
    { g: '配色', t: 'color', id: 'tea',      label: '茶绿主题',   v: '--tea',      def: '#6E7F63' },
    { g: '配色', t: 'color', id: 'gold',     label: '金/加号',    v: '--gold',     def: '#b3a080' },
    { g: '配色', t: 'color', id: 'brown',    label: '价格棕',     v: '--brown',    def: '#804242' },
    { g: '配色', t: 'color', id: 'cinnabar', label: '朱砂强调',   v: '--cinnabar', def: '#802b23' },

    // ===== 背景·各区域单独换图（留空则不换） =====
    { g: '背景', t: 'text',  id: 'appBg',    label: '整体画布背景图', def: 'jn_assets/courtyard.jpg',
      hint: '统一底，仓库内填 jn_assets/xxx.jpg；外链填 https://…',
      gen: function (v) { return '#app{background-image:url("' + cleanUrl(v) + '")!important}'; } },
    { g: '背景', t: 'text',  id: 'brandBg',  label: '品牌区背景图', def: 'jn_assets/courtyard.jpg',
      hint: '仓库内填 jn_assets/xxx.jpg；外链填 https://…',
      gen: function (v) { return '.brand{background-image:url("' + cleanUrl(v) + '")!important}'; } },
    { g: '背景', t: 'text',  id: 'cdBg',     label: '菜品区背景图', def: 'jn_assets/courtyard.jpg',
      hint: '仓库内填 jn_assets/xxx.jpg；外链填 https://…',
      gen: function (v) { return '.cd-wrap{background-image:url("' + cleanUrl(v) + '")!important}'; } },
    { g: '背景', t: 'text',  id: 'bannerBg', label: 'Banner背景图(可选)', def: '',
      hint: '留空=保持米色卡片；填 jn_assets/xxx.jpg 或 https://… 即换成图',
      gen: function (v) { return v ? '.banner{background-image:url("' + cleanUrl(v) + '")!important}' : ''; } },
    { g: '背景', t: 'range', id: 'bgPosY',   label: '背景纵向位置', min: 0, max: 100, step: 1, def: 55, unit: '%',
      gen: function (v) { return '#app,.brand,.cd-wrap,.banner{background-position:center ' + v + '% !important}'; } },
    { g: '背景', t: 'range', id: 'bgShade',  label: '品牌区遮罩深浅', min: 0, max: 70, step: 1, def: 0, unit: '%',
      gen: function (v) { var a = (v / 100).toFixed(3); return '.brand::before{background:linear-gradient(180deg, rgba(20,18,14,' + a + ') 0%, rgba(20,18,14,0) 35%, rgba(20,18,14,0) 65%, rgba(20,18,14,' + a + ') 100%)!important}'; } },
    { g: '背景', t: 'color', id: 'paper2',   label: '卡片宣纸底', v: '--paper-2', def: '#FCFAF4' },
    { g: '背景', t: 'color', id: 'yard',     label: '庭院底色',   sel: '#app', prop: 'background-color', def: '#2A2622' },

    // ===== 间距（各模块/各图之间的空隙）=====
    { g: '间距', t: 'range', id: 'gapV',     label: '模块垂直间距', min: 0, max: 40, step: 1, def: 8, unit: 'px',
      gen: function (v) { return '.banner{margin-top:' + v + 'px!important;margin-bottom:' + v + 'px!important}\n.cd-wrap{margin-top:' + v + 'px!important}'; } },
    { g: '间距', t: 'range', id: 'sidePad',  label: '左右缩进',     min: 0, max: 40, step: 1, def: 14, unit: 'px',
      gen: function (v) { return '.banner{margin-left:' + v + 'px!important;margin-right:' + v + 'px!important}\n.cd-wrap{margin-left:' + v + 'px!important;margin-right:' + v + 'px!important}'; } },

    // ===== 品牌区 =====
    { g: '品牌区', t: 'range', id: 'brandH',    label: '品牌区高度',   sel: '.brand',           prop: 'min-height',   min: 120, max: 340, step: 2,  def: 180, unit: 'px' },
    { g: '品牌区', t: 'range', id: 'brandSize', label: '江南味道字号', sel: '.brand-name-txt',  prop: 'font-size',    min: 28,  max: 88,  step: 1,  def: 42,  unit: 'px' },
    { g: '品牌区', t: 'range', id: 'sealSize',  label: '印章大小',     sel: '.brand-seal',       prop: 'width',        min: 14,  max: 40,  step: 1,  def: 22,  unit: 'px', also: [['.brand-seal','height']] },
    { g: '品牌区', t: 'range', id: 'subSize',   label: '副标题字号',   sel: '.brand-sub',        prop: 'font-size',    min: 10,  max: 24,  step: 1,  def: 13,  unit: 'px' },

    // ===== Banner =====
    { g: 'Banner', t: 'range', id: 'bannerH',   label: 'Banner高度',   sel: '.banner',           prop: 'min-height',   min: 90,  max: 260, step: 2,  def: 150, unit: 'px', also: [['.banner-slide','height']] },
    { g: 'Banner', t: 'range', id: 'bannerT1',  label: 'Banner标题字号', sel: '.banner-t1',      prop: 'font-size',    min: 12,  max: 30,  step: 1,  def: 17,  unit: 'px' },
    { g: 'Banner', t: 'range', id: 'bannerW',   label: 'Banner文案区宽', sel: '.banner-slide-txt', prop: 'width',     min: 35,  max: 85,  step: 1,  def: 55,  unit: '%' },

    // ===== 菜品区 =====
    { g: '菜品区', t: 'range', id: 'catsW',     label: '分类栏宽度',   sel: '.cats',             prop: 'width',        min: 60,  max: 150, step: 2,  def: 86,  unit: 'px', also: [['.cats','flex-basis']] },
    { g: '菜品区', t: 'range', id: 'dishPic',   label: '菜品图尺寸',   sel: '.dish-pic',         prop: 'width',        min: 60,  max: 150, step: 2,  def: 88,  unit: 'px', also: [['.dish-pic','flex-basis']] },
    { g: '菜品区', t: 'range', id: 'dishRadius',label: '菜品卡圆角',   sel: '.dish',             prop: 'border-radius',min: 0,   max: 22,  step: 1,  def: 12,  unit: 'px' },
    { g: '菜品区', t: 'range', id: 'dishGap',   label: '菜品卡间距',   sel: '.dish',             prop: 'margin-bottom',min: 2,   max: 22,  step: 1,  def: 9,   unit: 'px' },

    // ===== 整体 =====
    { g: '整体', t: 'range', id: 'appW',       label: '画布最大宽度', sel: '#app',              prop: 'max-width',    min: 320, max: 560, step: 10, def: 480, unit: 'px' }
  ];

  function rgb2hex(s) {
    s = (s || '').trim();
    if (s.charAt(0) === '#') return s;
    var m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var p = m[1].split(',').map(function (x) { return parseInt(x, 10); });
    function h(n) { var x = (n || 0).toString(16); return x.length === 1 ? '0' + x : x; }
    return '#' + h(p[0]) + h(p[1]) + h(p[2]);
  }
  function curVal(c) {
    if (c.v) {
      var x = getComputedStyle(document.documentElement).getPropertyValue(c.v);
      if (x && x.trim()) return x.trim();
    }
    if (c.sel) {
      var el = document.querySelector(c.sel);
      if (el) {
        var y = getComputedStyle(el).getPropertyValue(c.prop);
        if (y && y.trim()) {
          if (c.t === 'color') { var hx = rgb2hex(y); if (hx) return hx; }
          else return y.trim();
        }
      }
    }
    return c.def;
  }

  var state = {};
  CONTROLS.forEach(function (c) {
    if (c.t === 'color') state[c.id] = curVal(c);
    else if (c.t === 'text') state[c.id] = c.def;
    else state[c.id] = parseFloat(curVal(c));
  });

  var live = document.createElement('style');
  live.id = '__jn_live';
  document.head.appendChild(live);

  function buildCSS() {
    var root = [], rules = [];
    CONTROLS.forEach(function (c) {
      var val = state[c.id];
      if (c.gen) { rules.push(c.gen(val)); return; }
      if (c.v) {
        root.push(c.v + ':' + val);
      } else {
        rules.push(c.sel + '{' + c.prop + ':' + val + (c.unit || '') + '!important}');
        (c.also || []).forEach(function (a) {
          rules.push(a[0] + '{' + a[1] + ':' + val + (c.unit || '') + '!important}');
        });
      }
    });
    live.textContent = (root.length ? (':root{' + root.join(';') + '}') : '') + rules.join('\n');
    return live.textContent;
  }
  buildCSS();

  // ===== 右侧独立抽屉式编辑界面 =====
  var panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:0;right:0;width:360px;max-width:100vw;height:100vh;z-index:99999;'
    + 'background:#1f1c18;color:#f3ede0;font:12px/1.4 -apple-system,system-ui,"PingFang SC",sans-serif;'
    + 'box-shadow:-8px 0 30px rgba(0,0,0,.45);border-left:1px solid rgba(255,255,255,.08);'
    + 'display:flex;flex-direction:column';

  var groups = {};
  CONTROLS.forEach(function (c) { (groups[c.g] = groups[c.g] || []).push(c); });

  var body = '<div id="__jn_body" style="flex:1;overflow:auto;padding:10px 14px 16px">';

  Object.keys(groups).forEach(function (g) {
    body += '<div style="margin:14px 0 6px;font-size:11px;letter-spacing:2px;color:#b89b6a;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:4px">'
      + (g === '背景' ? '🖼 ' : '') + g + '</div>';
    groups[g].forEach(function (c) {
      if (c.t === 'color') {
        body += '<label style="display:flex;align-items:center;gap:8px;margin:8px 0">'
          + '<span style="flex:1">' + c.label + '</span>'
          + '<input type="color" data-id="' + c.id + '" value="' + state[c.id] + '" style="width:42px;height:26px;border:none;background:none;cursor:pointer"></label>';
      } else if (c.t === 'text') {
        body += '<div style="margin:8px 0">'
          + '<div style="margin-bottom:3px">' + c.label + '</div>'
          + '<input type="text" data-txt="' + c.id + '" value="' + state[c.id] + '" placeholder="' + (c.hint || '') + '" '
          + 'style="width:100%;box-sizing:border-box;background:#2a2622;color:#f3ede0;border:1px solid rgba(255,255,255,.15);border-radius:6px;padding:5px 7px;font-size:11px">'
          + (c.hint ? '<div style="font-size:9px;opacity:.5;margin-top:2px;line-height:1.4">' + c.hint + '</div>' : '') + '</div>';
      } else {
        body += '<div style="margin:9px 0">'
          + '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span>' + c.label + '</span>'
          + '<input type="number" data-num="' + c.id + '" value="' + state[c.id] + '" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '" style="width:58px;background:#2a2622;color:#f3ede0;border:1px solid rgba(255,255,255,.15);border-radius:5px;padding:1px 4px;font-size:11px"></div>'
          + '<input type="range" data-rng="' + c.id + '" value="' + state[c.id] + '" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '" style="width:100%;accent-color:#b89b6a"></div>';
      }
    });
  });

  body += '<div style="display:flex;gap:6px;margin-top:16px">'
    + '<button id="__jn_export" style="flex:1;padding:9px;border-radius:8px;background:#b89b6a;color:#1f1c18;border:none;font-weight:700;cursor:pointer">导出CSS</button>'
    + '<button id="__jn_reset" style="flex:1;padding:9px;border-radius:8px;background:transparent;color:#f3ede0;border:1px solid rgba(255,255,255,.2);cursor:pointer">重置</button></div>';
  body += '<textarea id="__jn_out" readonly style="width:100%;height:120px;margin-top:10px;box-sizing:border-box;background:#15130f;color:#9fd0a0;border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:6px;font:10px/1.4 monospace;display:none"></textarea>';
  body += '<div style="margin-top:10px;font-size:10px;opacity:.55;line-height:1.6">左侧为实时预览，拖动即变。调好后点「导出CSS」复制，把文本发我即可写入仓库锁定。</div>';
  body += '</div>';

  panel.innerHTML =
    '<div style="display:flex;align-items:center;padding:12px 14px;background:rgba(255,255,255,.05);border-bottom:1px solid rgba(255,255,255,.08)">'
    + '<b style="font-size:14px;letter-spacing:1px">江南味道 · 在线编辑器</b>'
    + '<span id="__jn_toggle" style="margin-left:auto;opacity:.7;cursor:pointer;user-select:none">收起 ◂</span></div>'
    + body;
  document.body.appendChild(panel);

  function ctrlOf(id) {
    for (var i = 0; i < CONTROLS.length; i++) if (CONTROLS[i].id === id) return CONTROLS[i];
    return null;
  }

  panel.addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset.rng) {
      var id = t.dataset.rng, c = ctrlOf(id);
      state[id] = parseFloat(t.value);
      var n = panel.querySelector('[data-num="' + id + '"]'); if (n) n.value = t.value;
      buildCSS();
    } else if (t.dataset.num) {
      var id2 = t.dataset.num, c2 = ctrlOf(id2);
      state[id2] = parseFloat(t.value);
      var r = panel.querySelector('[data-rng="' + id2 + '"]'); if (r) r.value = t.value;
      buildCSS();
    } else if (t.dataset.id && t.type === 'color') {
      state[t.dataset.id] = t.value;
      buildCSS();
    } else if (t.dataset.txt) {
      state[t.dataset.txt] = t.value;
      buildCSS();
    }
  });

  // 文本框回车即应用（已在 input 中实时，但这里保证失焦也生效）
  panel.addEventListener('change', function (e) {
    if (e.target.dataset.txt) { state[e.target.dataset.txt] = e.target.value; buildCSS(); }
  });

  var head = panel.querySelector('div');
  head.addEventListener('click', function (e) {
    if (e.target.id !== '__jn_toggle') return;
    var b = panel.querySelector('#__jn_body');
    var sh = b.style.display !== 'none';
    b.style.display = sh ? 'none' : 'flex';
    panel.querySelector('#__jn_toggle').textContent = sh ? '展开 ▸' : '收起 ◂';
  });

  panel.querySelector('#__jn_reset').addEventListener('click', function () {
    CONTROLS.forEach(function (c) { state[c.id] = (c.t === 'color') ? curVal(c) : (c.t === 'text' ? c.def : parseFloat(c.def)); });
    CONTROLS.forEach(function (c) {
      if (c.t === 'color') {
        var el = panel.querySelector('[data-id="' + c.id + '"]'); if (el) el.value = state[c.id];
      } else if (c.t === 'text') {
        var tx = panel.querySelector('[data-txt="' + c.id + '"]'); if (tx) tx.value = state[c.id];
      } else {
        var r = panel.querySelector('[data-rng="' + c.id + '"]');
        var n = panel.querySelector('[data-num="' + c.id + '"]');
        if (r) r.value = state[c.id];
        if (n) n.value = state[c.id];
      }
    });
    buildCSS();
  });

  panel.querySelector('#__jn_export').addEventListener('click', function () {
    var out = panel.querySelector('#__jn_out');
    out.style.display = 'block';
    out.value = buildCSS();
    out.select();
    try {
      navigator.clipboard.writeText(out.value);
      var btn = this, old = btn.textContent;
      btn.textContent = '已复制 ✓';
      setTimeout(function () { btn.textContent = old; }, 1200);
    } catch (e) {}
  });
})();
