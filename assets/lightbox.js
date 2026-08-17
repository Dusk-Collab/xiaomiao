/* 图片放大查看组件（Lightbox）
 * 用法：Lightbox.open(images, { start: 0, title: '...' })
 *   - images: 字符串数组（URL/dataURL），或单个字符串
 *   - start: 从第几张开始（默认 0）
 *   - title: 顶部副标题（可选）
 * 全屏覆盖，左右切换，点击空白/ESC/× 关闭，body 锁滚动。
 */
(function (global) {
  'use strict';

  var STYLE_ID = 'lightbox-style-v1';
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '#lb{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.92);' +
        'display:none;align-items:center;justify-content:center;flex-direction:column;}' +
        '#lb.show{display:flex;animation:lbFade .18s;}' +
        '@keyframes lbFade{from{opacity:0}to{opacity:1}}' +
        '#lb-img{max-width:94vw;max-height:78vh;object-fit:contain;border-radius:6px;' +
        'box-shadow:0 12px 40px rgba(0,0,0,.5);user-select:none;-webkit-user-drag:none;' +
        'transition:transform .25s;}' +
        '#lb-img.lb-zoom{cursor:zoom-out;}' +
        '#lb-top{position:absolute;top:env(safe-area-inset-top,0);left:0;right:0;' +
        'display:flex;align-items:center;justify-content:space-between;color:#fff;' +
        'padding:12px 16px;font-size:13.5px;font-weight:600;letter-spacing:.3px;}' +
        '#lb-title{flex:1;text-align:center;opacity:.92;font-size:13px;}' +
        '#lb-counter{margin-right:auto;background:rgba(255,255,255,.18);padding:3px 9px;' +
        'border-radius:999px;font-size:11.5px;}' +
        '#lb-close,#lb-prev,#lb-next{width:38px;height:38px;border-radius:50%;' +
        'background:rgba(255,255,255,.14);color:#fff;border:none;cursor:pointer;' +
        'display:grid;place-items:center;font-size:20px;line-height:1;backdrop-filter:blur(6px);}' +
        '#lb-close:active,#lb-prev:active,#lb-next:active{background:rgba(255,255,255,.28);}' +
        '#lb-close{font-size:22px;}' +
        '#lb-prev,#lb-next{position:absolute;top:50%;transform:translateY(-50%);}' +
        '#lb-prev{left:10px;}#lb-next{right:10px;}' +
        '#lb-tip{position:absolute;bottom:env(safe-area-inset-bottom,0);left:0;right:0;' +
        'text-align:center;color:rgba(255,255,255,.55);font-size:11px;padding:8px;}' +
        '@media (min-width:600px){#lb-prev{left:24px;}#lb-next{right:24px;}}';
    document.head.appendChild(s);
  }

  function ensureDom() {
    injectStyle();
    if (document.getElementById('lb')) return;
    var lb = document.createElement('div');
    lb.id = 'lb';
    lb.innerHTML =
      '<div id="lb-top">' +
        '<span id="lb-counter">1/1</span>' +
        '<span id="lb-title"></span>' +
        '<button id="lb-close" aria-label="关闭">✕</button>' +
      '</div>' +
      '<button id="lb-prev" aria-label="上一张">‹</button>' +
      '<img id="lb-img" alt="">' +
      '<button id="lb-next" aria-label="下一张">›</button>' +
      '<div id="lb-tip">点击图片放大/缩小 · 左右滑动切换</div>';
    document.body.appendChild(lb);
    document.getElementById('lb-close').onclick = close;
    document.getElementById('lb-prev').onclick = prev;
    document.getElementById('lb-next').onclick = next;
    lb.addEventListener('click', function (e) {
      if (e.target.id === 'lb') close();
      else if (e.target.id === 'lb-img') toggleZoom();
    });
  }

  var curIdx = 0;
  var imgs = [];
  var titleText = '';

  function render() {
    var img = document.getElementById('lb-img');
    img.src = imgs[curIdx] || '';
    img.classList.remove('lb-zoom');
    img.style.transform = '';
    document.getElementById('lb-counter').textContent =
      (curIdx + 1) + '/' + imgs.length;
    document.getElementById('lb-title').textContent = titleText || '';
    document.getElementById('lb-prev').style.display = imgs.length > 1 ? '' : 'none';
    document.getElementById('lb-next').style.display = imgs.length > 1 ? '' : 'none';
  }

  function open(images, opts) {
    opts = opts || {};
    if (!images) return;
    imgs = Array.isArray(images) ? images.slice() : [images];
    imgs = imgs.filter(function (x) { return !!x; });
    if (!imgs.length) return;
    curIdx = Math.max(0, Math.min(imgs.length - 1, opts.start || 0));
    titleText = opts.title || '';
    ensureDom();
    render();
    var lb = document.getElementById('lb');
    lb.classList.add('show');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
  }

  function close() {
    var lb = document.getElementById('lb');
    if (!lb) return;
    lb.classList.remove('show');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    var img = document.getElementById('lb-img');
    img.classList.remove('lb-zoom');
    img.style.transform = '';
  }

  function prev() {
    if (!imgs.length) return;
    curIdx = (curIdx - 1 + imgs.length) % imgs.length;
    render();
  }

  function next() {
    if (!imgs.length) return;
    curIdx = (curIdx + 1) % imgs.length;
    render();
  }

  function toggleZoom() {
    var img = document.getElementById('lb-img');
    if (img.classList.contains('lb-zoom')) {
      img.classList.remove('lb-zoom');
      img.style.transform = '';
    } else {
      img.classList.add('lb-zoom');
      img.style.transform = 'scale(2)';
    }
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') prev();
    else if (e.key === 'ArrowRight') next();
  }

  /* 触摸滑动（左右滑切换） */
  var startX = 0, startY = 0, dragging = false;
  document.addEventListener('touchstart', function (e) {
    var lb = document.getElementById('lb');
    if (!lb || !lb.classList.contains('show')) return;
    var t = e.changedTouches[0];
    startX = t.clientX; startY = t.clientY; dragging = true;
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (!dragging) return;
    dragging = false;
    var t = e.changedTouches[0];
    var dx = t.clientX - startX, dy = t.clientY - startY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) prev(); else next();
    }
  }, { passive: true });

  global.Lightbox = { open: open, close: close };
})(window);