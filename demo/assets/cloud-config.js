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
 * 创建步骤（2 分钟）：
 * 1. GitHub → 右上角头像 → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token
 * 2. Token name 随意（如 xiaomiao-sync）；Expiration 选 90 天或 No expiration
 * 3. Repository access 选「Only select repositories」→ 选 Dusk-Collab/xiaomiao
 * 4. Repository permissions → Contents → 选 Read and write
 * 5. Generate token → 复制以 github_pat_ 开头的那串
 * 6. 【不要在此文件硬编码 token】请在前述后台设置面板粘贴；此处的占位符
 *    会被本机 localStorage 里粘贴过的 token 自动覆盖（见文件末尾逻辑）。
 */
window.CLOUD_CONFIG = {
  repo: 'Dusk-Collab/xiaomiao',
  branch: 'main',
  dataPath: 'demo/assets/data.json',
  // 默认用 github.com；如需指向 GitHub Enterprise，可改成内部域名
  apiBase: 'https://api.github.com',
  rawBase: 'https://raw.githubusercontent.com',
  token: '__PASTE_TOKEN_HERE__'
};

// 若本浏览器曾在后台「云端同步设置」里粘贴过令牌，则用它覆盖占位符。
// 令牌只存在本机 localStorage，不进仓库，避免公开源码泄露。
try {
  var _ct = localStorage.getItem('om_cloud_token');
  if (_ct) window.CLOUD_CONFIG.token = _ct;
} catch (e) {}
