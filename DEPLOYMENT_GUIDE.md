# 远程服务器部署指南

## 📋 部署前准备

### 1. 服务器信息
- **远程服务器 IP**: 38.134.18.201
- **端口**: 3457
- **当前状态**: 运行旧版代码（无 GitHub Gist 集成）

### 2. 需要部署的代码
- **最新提交**: `f6462ebf` - "完成历史记录功能（假阳性修复）"
- **分支**: `main`
- **仓库**: https://github.com/SAMLAY-c/mind-map.git

---

## 🚀 部署步骤

### 步骤 1：SSH 登录远程服务器
```bash
ssh user@38.134.18.201
# 替换 user 为实际用户名
```

### 步骤 2：定位到项目目录
```bash
cd /path/to/mind-map  # 替换为实际路径
# 或者
cd ~/mind-map
# 或者
cd /var/www/mind-map
```

### 步骤 3：拉取最新代码
```bash
git pull origin main
```

**预期输出**:
```
remote: Counting objects: 100%, done.
remote: Compressing objects: 100%, done.
remote: Total 15 (delta 8), reused 12 (delta 5)
Unpacking objects: 100% done
From https://github.com/SAMLAY-c/mind-map
 * [new branch]      main       -> origin/main
Updating 2a745a9b..f6462ebf
Fast-forward
 web/.env.example              |  3 +++
 web/package.json              |  2 ++
 web/package-lock.json         | 87 +++++++++++++++++++++++++++++++
 web/scripts/markdown-server.js | 292 ++++++++++++++++++++++++++++++++++++++++++------
 4 files changed, 539 insertions(+), 294 deletions(-)
```

### 步骤 4：进入 web 目录安装新依赖
```bash
cd web
npm install
```

**预期输出**:
```
added 2 packages, and audited 899 packages in 3s
```

### 步骤 5：配置环境变量（重要！）

创建 `.env` 文件：
```bash
nano .env
# 或者
vim .env
```

**复制以下内容**（替换实际的 GitHub Token）：
```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SERVER_URL=http://38.134.18.201:3457
PORT=3457
```

**获取 GitHub Token**（如果没有）：
1. 访问：https://github.com/settings/tokens
2. 点击 "Generate new token" → "Generate new token (classic)"
3. 勾选权限：`gist` (Create gists)
4. 生成并复制 token

**保存文件**：
- Nano: `Ctrl + O` → `Enter` → `Ctrl + X`
- Vim: `ESC` → `:wq` → `Enter`

### 步骤 6：验证 .env 文件
```bash
cat .env
```

**预期输出**：
```
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SERVER_URL=http://38.134.18.201:3457
PORT=3457
```

### 步骤 7：重启服务器

**方式 A：如果使用 PM2**
```bash
pm2 restart mind-map-server
# 或者
pm2 restart all
# 查看日志
pm2 logs mind-map-server --lines 50
```

**方式 B：如果直接运行**
```bash
# 先杀掉旧进程
lsof -ti:3457 | xargs kill -9
# 或者
pkill -f "markdown-server"

# 启动新服务
npm run md:serve
```

**方式 C：如果使用 systemd**
```bash
sudo systemctl restart mind-map-server
sudo systemctl status mind-map-server
```

### 步骤 8：验证部署

**检查服务状态**：
```bash
curl http://localhost:3457/health
```

**预期输出**：
```json
{
  "code": 0,
  "msg": "Mind Map Server is running",
  "version": "2.0.0"
}
```

**检查进程**：
```bash
lsof -i:3457
# 或
netstat -tulnp | grep 3457
```

---

## ✅ 部署后测试

### 测试 1：创建思维导图
```bash
curl -X POST http://38.134.18.201:3457/api/create \
  -H "Content-Type: application/json" \
  -d '{
    "markdown": "# 测试\n## 功能验证\n- 创建成功",
    "title": "部署测试"
  }'
```

**预期输出**：
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "gistId": "xxxxxx",
    "viewUrl": "http://38.134.18.201:3457/view/xxxxxx",
    "gistUrl": "https://gist.github.com/xxx/xxxxxx"
  }
}
```

### 测试 2：访问思维导图页面
在浏览器打开返回的 `viewUrl`，验证：
- ✅ 思维导图正常显示
- ✅ 可以编辑节点
- ✅ 点击"保存"按钮无 CORS 错误
- ✅ 保存成功显示"✅ 已保存"
- ✅ 点击"历史版本"可以看到版本列表

### 测试 3：验证历史记录
```bash
# 替换 <gistId> 为实际 ID
curl http://38.134.18.201:3457/api/history/<gistId>
```

---

## 🔧 故障排查

### 问题 1：端口被占用
```bash
# 查找占用端口的进程
lsof -i:3457
# 杀掉进程
kill -9 <PID>
```

### 问题 2：.env 文件找不到
```bash
# 检查文件是否存在
ls -la .env
# 检查文件权限
chmod 600 .env  # 只允许所有者读写
```

### 问题 3：依赖安装失败
```bash
# 清理缓存重新安装
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### 问题 4：GitHub Token 无效
```bash
# 测试 token
curl -H "Authorization: Bearer YOUR_TOKEN" https://api.github.com/gists
# 返回 401 或 403 说明 token 无效
```

---

## 📊 部署检查清单

- [ ] SSH 登录成功
- [ ] 代码已拉取到最新版本（f6462ebf）
- [ ] 新依赖已安装（dotenv, node-fetch）
- [ ] .env 文件已创建
- [ ] GITHUB_TOKEN 已配置有效值
- [ ] SERVER_URL 配置为 http://38.134.18.201:3457
- [ ] PORT 配置为 3457
- [ ] 旧服务进程已停止
- [ ] 新服务已启动
- [ ] /health 接口返回正常
- [ ] 创建思维导图测试成功
- [ ] 浏览器访问页面正常
- [ ] 保存功能无 CORS 错误
- [ ] 历史版本查看正常

---

## 📝 重要提醒

### 安全注意事项
1. **不要提交 .env 文件到 Git**（已在 .gitignore 中）
2. **定期轮换 GitHub Token**
3. **限制 GitHub Token 权限**（只需要 gist 权限）

### 监控建议
1. 定期检查服务器日志：`pm2 logs` 或查看日志文件
2. 监控 GitHub API 调用配额（5000 次/小时）
3. 定期备份 Gist 数据

### 扩展建议
1. 考虑使用 PM2 的自动重启功能
2. 配置 Nginx 反向代理和 HTTPS
3. 添加访问日志和错误日志
4. 设置监控告警

---

## 🎯 部署完成后

部署成功后，你可以：

1. **创建思维导图**：
   ```bash
   curl -X POST http://38.134.18.201:3457/api/create \
     -H "Content-Type: application/json" \
     -d '{"markdown":"# 标题\n## 内容","title":"标题"}'
   ```

2. **分享链接**：
   - 每次创建都会生成唯一的永久链接
   - 链接格式：`http://38.134.18.201:3457/view/<gistId>`

3. **版本管理**：
   - 所有修改自动保存到 GitHub Gist
   - 可以查看历史版本记录

---

**部署日期**: 2026-03-12
**文档版本**: 1.0
**维护者**: SAMLAY-c
