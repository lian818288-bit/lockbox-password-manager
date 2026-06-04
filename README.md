# Lockbox 密码管理器

一个可托管在 GitHub Pages 上的静态密码管理器。主密码不保存，密码库使用浏览器 Web Crypto API 做 PBKDF2-SHA256 派生和 AES-GCM 加密。

## 使用方式

直接打开 `index.html`，输入至少 10 位主密码即可创建本地加密密码库。

## 跨设备同步

应用支持可选 GitHub Gist 同步：

1. 在 GitHub 创建一个只用于此应用的 token，权限建议仅包含 `gist`。
2. 打开应用的“同步”页，填写 token。
3. 首次点击“推送远端”会创建一个 private Gist，并自动写入 Gist ID。
4. 其他设备打开同一个 GitHub Pages 地址，输入相同主密码，再填写 token 和 Gist ID，点击“拉取远端”。
5. 勾选自动同步后，应用每 30 秒拉取一次远端更新。

同步到 GitHub 的内容是加密后的 JSON 密文。请不要把主密码或 token 发给任何人。

## GitHub Pages 托管

把 `password-manager` 目录里的文件上传到 GitHub 仓库，然后在仓库设置里启用 Pages：

```bash
cd password-manager
git init
git add .
git commit -m "Add encrypted password manager"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

在 GitHub 仓库中进入 `Settings -> Pages`，选择 `Deploy from a branch`，分支选 `main`，目录选 `/root`。

## 安全说明

- 不要把明文密码、主密码、GitHub token 写进代码或提交到仓库。
- 主密码忘记后无法恢复密码库。
- GitHub Gist token 会保存在浏览器 localStorage 中；建议使用权限最小、可随时撤销的 token。
- 这是一款轻量级个人工具，不替代 1Password、Bitwarden 等经过长期安全审计的专业产品。
