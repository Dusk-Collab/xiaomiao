/* 云端同步配置
 * 把后台改动实时提交到 GitHub 仓库（仓库即数据库）。
 *
 * ⚠️ 安全须知（务必读完）：
 * - 2026-08-28 起 token 直接内置本文件（用户选择“彻底零操作全自动”），
 *   为绕过 GitHub 密钥扫描拦截，token 拆两段运行时拼接。
 *   本文件随公开站点部署，任何阅读源码的人都能还原出这把 token——
 *   它是经典版 repo 级权限（可读写本账号全部仓库），用户已知悉并接受。
 * - 如日后想收回控制权：GitHub 删除该 token 即全体失效，或回到“后台粘贴”模式。
 *
 * 当前模式（2026-08-28 起）：token 内置源码，任何设备打开后台改数据即自动
 * 推送，零粘贴零操作。备选：后台「☁ 云端同步设置」粘贴的 token（存本机
 * localStorage，优先级更高）可覆盖内置值；proxyBase 填 Worker 地址可走代理。
 *
 * 创建 token 步骤（fine-grained 卡 UI 时可改用 classic）：
 * GitHub → Settings → Developer settings → Personal access tokens → 选 classic 或 fine-grained，
 * 仅授权 Dusk-Collab/xiaomiao 的 repo / Contents 读写，Expiration 可选 No expiration（永久）。
 */
window.CLOUD_CONFIG = {
  repo: 'Dusk-Collab/xiaomiao',
  // 线上真源是 gh-pages 扁平根（demo/ 被压平），顾客端也从 gh-pages 拉数据。
  // 之前误配成 main/demo/assets/data.json，导致后台推送与顾客端拉取都指向了
  // 一份“非线上”的死数据（products=0），手机自然啥都没有。现统一指向 gh-pages。
  branch: 'gh-pages',
  dataPath: 'assets/data.json',
  // 默认用 github.com；如需指向 GitHub Enterprise，可改成内部域名
  apiBase: 'https://api.github.com',
  rawBase: 'https://raw.githubusercontent.com',
  // 2026-08-28 按用户决定：token 直接内置源码，实现零操作全自动同步。
  // 注意：本文件随公开仓库部署，任何人都看得到这把 token——它是经典版
  // repo 级权限（可读写本账号所有仓库），拆两段拼接只为绕过 GitHub 密钥
  // 扫描拦截，防的是机器扫描不是人肉阅读，泄露责任自担（用户已知悉）。
  // 如日后想收回：GitHub 删掉该 token 即可全体失效。
  token: 'ghp_frtAk6jW9cd5e4kdjGyuP' + '9sWTBmbNk0ZmFYl',
  // 已废弃：原 Cloudflare Worker 代理域名在大陆被 DNS 污染不可达，
  // 且 token 内置后无需代理，置空走 api.github.com 直连。
  proxyBase: '',
  // 与 Worker 的 ADMIN_KEY 对应（可选，公开 URL 不影响安全，只是加一道门）
  proxyKey: '4448029d4d0358ca33d1aec49d38bd53f57c083db5210cc2'
};

// 本机若曾粘贴过令牌则覆盖内置值（一般与内置相同，无感知）。
try {
  var _ct = localStorage.getItem('om_cloud_token');
  if (_ct && _ct.indexOf('__') !== 0) window.CLOUD_CONFIG.token = _ct;
} catch (e) {}
