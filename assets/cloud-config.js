/* 云端同步配置
 * 把后台改动实时提交到 GitHub 仓库（仓库即数据库）。
 *
 * ⚠️ 安全须知（务必读完）：
 * - 浏览器端调用 GitHub API 必须带 token，而本文件会随站点公开部署，
 *   所以任何查看源码的人都能拿到这把 token。
 * - 【请勿在此文件硬编码真实 token】正确做法：打开商家后台左下角
 *   「☁ 云端同步设置」粘贴，token 仅存你本机浏览器 localStorage，不进源码、
 *   不公开，从而只有你自己能改数据。
 * - 请使用「Fine-grained token（细粒度令牌）」，且只授权本仓库
 *   Dusk-Collab/xiaomiao 的 Contents: Read and write。
 *   这样即使泄露，也最多改这一个早餐店仓库，动不了你 GitHub 账户下的其他仓库。
 * - 不要用你账号的「经典全局 PAT」来填这里（泄露后能看到你所有私有仓库）。
 *
 * 两种启用方式：
 * A) 手动粘贴（当前默认）：后台「☁ 云端同步设置」粘贴 token，仅存本机 localStorage，不进源码。
 * B) 全自动代理（零粘贴）：部署 worker/ 里的 Cloudflare Worker 后，把地址填到下面 proxyBase，
 *    浏览器不再持有 token，跨设备自动同步。详见 worker/ 目录说明。
 *
 * 创建 token 步骤（fine-grained 卡 UI 时可改用 classic）：
 * GitHub → Settings → Developer settings → Personal access tokens → 选 classic 或 fine-grained，
 * 仅授权 Dusk-Collab/xiaomiao 的 repo / Contents 读写，Expiration 可选 No expiration（永久）。
 */
window.CLOUD_CONFIG = {
  repo: 'Dusk-Collab/xiaomiao',
  branch: 'main',
  dataPath: 'demo/assets/data.json',
  // 默认用 github.com；如需指向 GitHub Enterprise，可改成内部域名
  apiBase: 'https://api.github.com',
  rawBase: 'https://raw.githubusercontent.com',
  token: '__PASTE_TOKEN_HERE__',
  // 全自动模式：填 Cloudflare Worker 地址（如 https://xiaomiao-sync.xxx.workers.dev）
  // 留空则走“手动粘贴 token”模式。代理模式下浏览器不再需要 token。
  proxyBase: 'https://xiaomiao-sync.xiaomiao-sync.workers.dev',
  // 与 Worker 的 ADMIN_KEY 对应（可选，公开 URL 不影响安全，只是加一道门）
  proxyKey: '4448029d4d0358ca33d1aec49d38bd53f57c083db5210cc2'
};

// 若本浏览器曾在后台「云端同步设置」里粘贴过令牌，则用它覆盖占位符。
// 令牌只存在本机 localStorage，不进仓库，避免公开源码泄露。
try {
  var _ct = localStorage.getItem('om_cloud_token');
  if (_ct) window.CLOUD_CONFIG.token = _ct;
} catch (e) {}
