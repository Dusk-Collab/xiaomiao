// utils/format.js —— 金额/时间格式化（与演示版 store.js 同名方法一致）
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function money(n) { return '¥' + (Math.round((n || 0) * 100) / 100).toFixed(2); }
function timeStr(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}
function dateStr(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
module.exports = { money: money, timeStr: timeStr, dateStr: dateStr, pad: pad };
