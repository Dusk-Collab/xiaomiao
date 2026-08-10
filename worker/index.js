// 小淼饭店 · 云端同步代理（Cloudflare Worker）
// 作用：把 GitHub token 藏在服务端环境变量里，浏览器不再持有 token，
//       从而后台改商品可“零粘贴、跨设备”自动提交到仓库。
//
// 部署后需在 Cloudflare 后台设置两个变量（Secrets）：
//   GITHUB_TOKEN = 你的 classic PAT（ghp_...，仅授权本仓库 repo 权限）
//   ADMIN_KEY    = 任意随机串，给代理加一道门（建议设置）
//
// 安全边界：
//   - 仅允许写入本仓库 demo/assets/ 下的文件（锁死路径前缀）
//   - 仅允许来自 https://dusk-collab.github.io 的请求（Origin 校验）
//   - token 不在前端出现，泄露面=这一个早餐店仓库的写入权

const REPO = 'Dusk-Collab/xiaomiao';
const BRANCH = 'main';
const ALLOWED_ORIGIN = 'https://dusk-collab.github.io';
const PATH_PREFIX = 'demo/assets/';

function cors(res) {
  res.headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.headers.set('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  return res;
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));

    // 1) 来源校验：只允许商家后台站点调用
    const origin = request.headers.get('Origin') || '';
    if (origin !== ALLOWED_ORIGIN) {
      return cors(json({ error: 'forbidden origin' }, 403));
    }

    // 2) 路径校验：只能动本仓库 demo/assets/ 下的文件
    const url = new URL(request.url);
    const path = url.searchParams.get('path');
    if (!path || path.indexOf(PATH_PREFIX) !== 0) {
      return cors(json({ error: 'invalid path' }, 400));
    }

    // 3) 可选二次校验：ADMIN_KEY
    if (env.ADMIN_KEY) {
      const k = url.searchParams.get('key') || request.headers.get('x-admin-key') || '';
      if (k !== env.ADMIN_KEY) return cors(json({ error: 'bad key' }, 401));
    }

    // 4) 转发到 GitHub Contents API（token 来自服务端环境变量）
    const apiUrl =
      'https://api.github.com/repos/' + REPO + '/contents/' + path + '?ref=' + BRANCH;
    let body;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = await request.text();
    }
    const ghRes = await fetch(apiUrl, {
      method: request.method,
      headers: {
        Authorization: 'Bearer ' + env.GITHUB_TOKEN,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'xiaomiao-sync-worker',
      },
      body: body,
    });
    const text = await ghRes.text();
    return cors(
      new Response(text, {
        status: ghRes.status,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  },
};
