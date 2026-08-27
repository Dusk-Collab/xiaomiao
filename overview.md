# 恢复"现在这个对话位置"= 验证码登录版本（2026-08-27）

## 用户指令
撤销上一轮"回退到今天聊天之前"的操作，把代码恢复到现在对话已完成位置（验证码登录双 tab 版），并恢复商家后台验证码登录功能。

## 最终结果
- **远程 main** = `b1b9d1e28b`（"admin: 登录界面双tab(密码登录/验证码登录)+图形点选验证码(main 源同步)"）
- **远程 gh-pages** = `1a3eacb50`（"restore: 验证码登录双tab版+12商品数据"）
- **本地 main** = `b1b9d1e`，working tree clean

## 数据红线（全程守住）
- 回退前用 GitHub API 把 `b1b9d1e28b` 的 `demo/assets/data.json` 与本地备份 `xm_data_backup_12.json` 做整体 JSON 对比：**完全一致**（12 商品、店铺名"晨光早餐·中心街店"、orders 0、逐商品内容差异 0）
- 恢复过程中本地、线上 `data.json` 始终是用户原始的 12 商品，**未被动**

## 关键操作步骤
1. **本地 reflog 排查**：上一轮回退冲掉了 reflog，本地没有 `b1b9d1e28b` 对象
2. **查 GitHub 对象库**：`GET /repos/Dusk-Collab/xiaomiao/commits/b1b9d1e28b` 返回 200（force push 后的旧 commit 在 GitHub 对象库保留数小时，可作救命稻草）
3. **git fetch 拉对象**：`git fetch https://Dusk-Collab:<PAT>@github.com/Dusk-Collab/xiaomiao.git b1b9d1e28b41436277a2eb366b5fe19746e9644a` 成功（`cat-file -t` 返回 `commit`，本环境直接 fetch sha 走通）
4. **校验关键文件**：`/git/trees/<sha>?recursive=1` + `/contents/admin.html?ref=<sha>` 确认 `switchLoginTab`×4、`btnGetCode`×2、cloud-config `branch:'gh-pages'`、`dataPath:'assets/data.json'`、data.json 12 商品
5. **本地切回**：`git reset --hard b1b9d1e28b`（工作区直接 = 验证码版本）
6. **强推 main**：`+ dcb42d9...b1b9d1e HEAD -> main (forced update)`
7. **扁平化 demo/ 部署 gh-pages**（独立临时仓库 `ghp_restore_<ts>`，`rm server.js`，加 `.nojekyll`）：`+ 2b2f5ee...1a3eacb HEAD -> gh-pages (forced update)`

## 真浏览器实测（puppeteer-core + 系统 Chrome，390×844 手机视口）
等 35s CDN 刷新后，跑全流程：
- 双 tab 在（"密码登录"/"验证码登录"），默认密码 tab 激活，密码框 + 👁 小眼睛在
- 切验证码 tab：面板切换正确，`#codePhone`/`#btnGetCode`/`#codeInput` 都在
- 填 `13800138000` → 点获取验证码 → 5 个 `.cap-shape` 弹出（红长方形/蓝圆形/绿三角形/黄方形/紫菱形随机排布）
- 故意先点 `cap-circle` → "顺序不对，请重来"（防呆有效）
- 按 `rect → circle → triangle` 正确顺序 → "验证通过！验证码：915958"
- 1.4s 后 `#captchaBox` 自动隐藏
- 提取验证码填入 `#codeInput`，点登录 → `#loginMask` 隐藏，`sessionStorage.admin_auth="1"`，进入订单看板
- **无 JS 错误**

## 线上地址（请 Ctrl+F5 强刷清缓存）
- 后台：https://dusk-collab.github.io/xiaomiao/admin.html
- 顾客：https://dusk-collab.github.io/xiaomiao/customer.html

## 证据截图（手机视口实测）
- `C:/Users/Administrator/xm_vc_1_default.png`：双 tab 默认密码登录页
- `C:/Users/Administrator/xm_vc_3_captcha.png`：图形点选验证码面板（5 个形状 + 提示语"请依次点击：红色长方形 → 蓝色圆形 → 绿色三角形"）
- `C:/Users/Administrator/xm_vc_5_admin.png`：验证码登录成功后的后台订单看板
- `C:/Users/Administrator/xm_revert_admin.png`：上一轮回退的干净版仅密码截图（作对比保留）

## 关键经验（写入 MEMORY.md）
- `git fetch origin <full_sha>` 在本环境直接可用（与"ls-remote/push 常 expected flush 截断"不冲突，因为是直接 fetch 包，不走 ref listing）
- GitHub force push 后旧 commit 对象**短时间内**（至少数小时）保留在对象库，可通过 API 获取，反悔时按 sha 拉回
- "按 SHA 恢复工作流"已写入 `.workbuddy/memory/MEMORY.md`（7 步标准流程）