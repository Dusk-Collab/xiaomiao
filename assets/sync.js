/* 跨设备实时同步层（演示用）
 * 用 MQTT over WebSocket 把本地状态广播到一个公共 broker，
 * 手机/电脑等不同设备连同一个 topic 即可互通（替代云数据库 watch）。
 * 注意：这是演示级方案，公共 broker 不保证持久化与并发安全；
 * 生产请替换为微信云开发 db.collection().watch()。
 * 设计：连接失败/不可达时自动降级为「本地单设备」模式，界面显示「离线」，绝不卡死。
 */
(function (global) {
  'use strict';

  var BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',     // 国内可达性较好（EMQ 国产）
    'wss://broker.hivemq.com:8884/mqtt'   // 海外兜底
  ];
  var MY_ID = 'c_' + Math.random().toString(36).slice(2, 10);
  var KEEPALIVE = 30;

  var ws = null, pid = 1, alive = false, statusCb = null, msgCb = null, topic = '';
  var pingTimer = null, reconnectTimer = null, connectTimer = null, brokerIdx = 0, stopped = false;

  /* ---------- MQTT 报文构造 ---------- */
  function strBytes(s) { var a = []; for (var i = 0; i < s.length; i++) a.push(s.charCodeAt(i) & 0xff); return a; }
  function varint(n) { var o = []; do { var b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; o.push(b); } while (n > 0); return o; }
  function packet(type, body) { return new Uint8Array([type].concat(varint(body.length), body)); }
  function buildConnect() {
    var pb = strBytes(MY_ID);
    var vh = [0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04, 0x02, (KEEPALIVE >> 8) & 0xff, KEEPALIVE & 0xff];
    var payload = [(pb.length >> 8) & 0xff, pb.length & 0xff].concat(pb);
    return packet(0x10, vh.concat(payload));
  }
  function buildSubscribe(t) {
    var tb = strBytes(t); var id = pid++;
    var vh = [(id >> 8) & 0xff, id & 0xff];
    var payload = [(tb.length >> 8) & 0xff, tb.length & 0xff].concat(tb, [0]);
    return packet(0x82, vh.concat(payload));
  }
  function buildPublish(t, buf) {
    var tb = strBytes(t);
    var vh = [(tb.length >> 8) & 0xff, tb.length & 0xff].concat(tb);
    return packet(0x31, vh.concat(Array.from(buf))); // 0x31 = PUBLISH, QoS0, RETAIN=1（后加入设备可立即拿到最新状态）
  }
  function buildPing() { return packet(0xC0, []); }
  function decVarint(buf, pos) { var v = 0, m = 1, p = pos; while (true) { var b = buf[p]; v += (b & 0x7f) * m; p++; if ((b & 0x80) === 0) break; m *= 128; } return [v, p]; }

  /* ---------- 状态通知 ---------- */
  function setStatus(s) { if (statusCb) try { statusCb(s); } catch (e) {} }

  function openBroker() {
    if (stopped) return;
    if (brokerIdx >= BROKERS.length) { brokerIdx = 0; } // 循环重试
    var url = BROKERS[brokerIdx];
    try { ws = new WebSocket(url, ['mqtt']); }
    catch (e) { brokerIdx++; setTimeout(openBroker, 1500); return; }
    ws.binaryType = 'arraybuffer';
    alive = false;
    clearTimeout(connectTimer);
    connectTimer = setTimeout(function () { // 连接超时，换下一个 broker
      try { ws.close(); } catch (e) {}
      brokerIdx++; setTimeout(openBroker, 800);
    }, 6000);

    ws.onopen = function () { clearTimeout(connectTimer); ws.send(buildConnect()); };
    ws.onmessage = function (ev) {
      var buf = new Uint8Array(ev.data instanceof ArrayBuffer ? ev.data : []);
      if (!buf.length) return;
      var type = buf[0] >> 4;
      if (type === 2) { // CONNACK
        alive = true; clearTimeout(connectTimer); clearInterval(pingTimer);
        pingTimer = setInterval(function () { if (alive && ws.readyState === 1) ws.send(buildPing()); }, (KEEPALIVE * 1000) / 2);
        ws.send(buildSubscribe(topic));
        setStatus('online');
      } else if (type === 9) { /* SUBACK */ }
      else if (type === 3) { // PUBLISH
        var p = 1, rl = decVarint(buf, p); p = rl[1];
        var tlen = (buf[p] << 8) | buf[p + 1]; p += 2;
        var t = String.fromCharCode.apply(null, buf.slice(p, p + tlen)); p += tlen;
        var payload = buf.slice(p);
        if (msgCb) try { msgCb(t, payload); } catch (e) {}
      } else if (type === 13) { /* PINGRESP */ }
    };
    ws.onerror = function () { /* 交给 onclose 处理 */ };
    ws.onclose = function () {
      alive = false; clearInterval(pingTimer); clearTimeout(connectTimer);
      if (stopped) { setStatus('offline'); return; }
      setStatus('offline');
      brokerIdx++;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(openBroker, 3000); // 断线重连
    };
  }

  var Sync = {
    init: function (opt) {
      topic = opt.topic || 'scanorder/demo_v1';
      statusCb = opt.onStatus || null;
      msgCb = opt.onMessage || null;
      stopped = false;
      brokerIdx = 0;
      setStatus('connecting');
      openBroker();
    },
    publish: function (t, buf) {
      if (!alive || !ws || ws.readyState !== 1) return false;
      try { ws.send(buildPublish(t, buf)); return true; } catch (e) { return false; }
    },
    stop: function () { stopped = true; clearTimeout(reconnectTimer); clearTimeout(connectTimer); clearInterval(pingTimer); try { if (ws) ws.close(); } catch (e) {} },
    id: MY_ID
  };

  global.Sync = Sync;
})(window);
