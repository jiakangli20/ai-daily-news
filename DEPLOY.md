# 服务器部署指南

## 前置要求

1. **Docker 和 Docker Compose**
   ```bash
   # CentOS 安装 Docker
   yum install -y docker docker-compose
   systemctl start docker
   systemctl enable docker
   ```

2. **项目文件**
   - 确保所有源代码文件已上传到服务器

## 部署步骤

### 1. 上传项目到服务器

使用 `rsync` 或 `scp` 上传项目（排除 node_modules）：

```bash
# 从本地机器执行（在项目根目录）
rsync -avz --progress \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude '.data/' \
  --exclude '.git/' \
  --exclude '.DS_Store' \
  --exclude '.vercel' \
  --exclude '.output' \
  --exclude '.cache' \
  ./ root@192.168.10.156:/opt/newsnow/
```

或者使用 `scp`：

```bash
# 打包项目（在本地）
tar --exclude='node_modules' \
    --exclude='dist' \
    --exclude='.data' \
    --exclude='.git' \
    -czf newsnow.tar.gz .

# 上传到服务器
scp newsnow.tar.gz root@192.168.10.156:/opt/

# 在服务器上解压
ssh root@192.168.10.156
cd /opt
tar -xzf newsnow.tar.gz -C newsnow/
cd newsnow
```

### 2. 在服务器上配置环境变量

创建 `.env` 文件：

```bash
cd /opt/newsnow  # 或你的项目目录

# 复制示例文件
cp example.env.server .env

# 编辑环境变量（如果需要登录功能）
vim .env
```

`.env` 文件内容示例：

```env
G_CLIENT_ID=your_github_client_id
G_CLIENT_SECRET=your_github_client_secret
JWT_SECRET=your_random_jwt_secret_key_here
INIT_TABLE=true
ENABLE_CACHE=true
```

### 3. 构建和启动 Docker 容器

```bash
# 进入项目目录
cd /opt/newsnow

# 使用 docker-compose 构建并启动
docker-compose -f docker-compose.local.yml up -d --build

# 查看日志
docker-compose -f docker-compose.local.yml logs -f

# 查看容器状态
docker-compose -f docker-compose.local.yml ps
```

### 4. 验证部署

```bash
# 检查容器是否运行
docker ps | grep newsnow

# 检查端口是否监听
netstat -tlnp | grep 4444
# 或
ss -tlnp | grep 4444

# 测试访问（在服务器本地）
curl http://localhost:4444/api/latest
```

### 5. 访问应用

- 本地访问：`http://192.168.10.156:4444`
- 如果配置了 Nginx 反向代理：`http://your-domain.com`

## 常用命令

### 停止服务

```bash
docker-compose -f docker-compose.local.yml down
```

### 重启服务

```bash
docker-compose -f docker-compose.local.yml restart
```

### 更新代码后重新部署

```bash
# 1. 重新上传代码到服务器
# 2. 在服务器上重新构建
docker-compose -f docker-compose.local.yml up -d --build

# 或仅重启（如果代码更改不需要重新构建）
docker-compose -f docker-compose.local.yml restart
```

### 查看日志

```bash
# 实时日志
docker-compose -f docker-compose.local.yml logs -f

# 最近 100 行日志
docker-compose -f docker-compose.local.yml logs --tail=100
```

### 进入容器

```bash
docker exec -it newsnow sh
```

## 故障排查

### 容器无法启动

```bash
# 查看详细错误
docker-compose -f docker-compose.local.yml logs

# 检查镜像是否构建成功
docker images | grep newsnow

# 手动构建测试
docker build -t newsnow:test .
```

### 端口冲突

如果 4444 端口被占用，修改 `docker-compose.local.yml` 中的端口映射：

```yaml
ports:
  - '8080:4444'  # 改为其他端口
```

### 数据持久化

数据存储在 Docker volume `newsnow_data` 中：

```bash
# 查看 volume
docker volume ls | grep newsnow

# 备份数据
docker run --rm -v newsnow_data:/data -v $(pwd):/backup alpine tar czf /backup/newsnow_backup.tar.gz /data
```

## Nginx 反向代理配置（可选）

如果需要通过域名访问，可以配置 Nginx：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:4444;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
