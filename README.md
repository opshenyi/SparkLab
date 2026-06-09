# SparkLab

SparkLab 是一个面向在线实验教学的 Web 平台：前端使用 Next.js，后端使用 Go + Gin，数据库默认 SQLite，实验环境通过宿主机 Docker Engine 创建和管理容器。

本仓库的正式部署方式统一为 Docker Compose。服务器不需要在宿主机安装 Go 或 Node，也不需要在宿主机执行前后端构建；更新由 GitHub 发布清单驱动，拉取代码后通过 Docker Compose 重建镜像并重启服务。

## 功能概览

- 学员登录、课程浏览、实验容器创建、Web 终端操作。
- 管理员管理用户、课程、实验、镜像、容器、网络和存储卷。
- 教师管理课程实验与教学资料。
- 前端进入时自动检查 GitHub 更新清单并展示公告。
- 管理后台可检查更新、查看版本日志，并一键从 GitHub 拉取代码完成 Docker 重部署。

## 目录结构

```text
.
├── docker-compose.yml          # Docker-only 部署入口
├── .env.example                # 根目录部署环境变量模板
├── update-manifest.json        # GitHub 更新清单：版本、公告、日志、脚本
├── scripts/
│   ├── update.sh               # Linux/Docker Compose 更新脚本
│   └── update.ps1              # Windows/Docker Compose 更新脚本
├── server/                     # Go 后端
│   ├── Dockerfile
│   ├── entrypoint.sh
│   └── cmd/server/main.go
└── web/                        # Next.js 前端
    └── Dockerfile
```

## 一键部署

服务器需要先安装 Git、Docker 和 Docker Compose v2。

```bash
git clone https://github.com/opshenyi/SparkLab.git
cd SparkLab
cp .env.example .env
```

编辑 `.env`，至少修改这些值：

```env
WEB_URL=http://你的服务器IP:3000
NEXT_PUBLIC_API_URL=http://你的服务器IP:3001
JWT_SECRET=换成一串足够长的随机密钥
```

可以用下面的命令生成 `JWT_SECRET`：

```bash
openssl rand -hex 32
```

启动：

```bash
docker compose up -d
```

查看状态和日志：

```bash
docker compose ps
docker compose logs -f
```

默认访问：

- 前端：`http://服务器IP:3000`
- 后端健康检查：`http://服务器IP:3001/health`

首次启动会创建一个引导管理员。默认用户名是 `admin`；如果 `.env` 没有设置 `SPARKLAB_BOOTSTRAP_ADMIN_PASSWORD`，系统会生成随机密码并写入：

```text
data/server/bootstrap-admin.txt
```

首次登录后请立刻在管理后台创建正式管理员或修改密码。演示课程和演示学生不会默认写入，需要显式设置 `SEED_DEMO_DATA=true`。

## 数据持久化

Docker Compose 会把运行数据写在仓库根目录的 `data/` 下：

```text
data/server       # SQLite 数据库与 seed 标记
data/uploads      # 后端课程资料上传
data/web-uploads  # 前端视频上传
```

`data/` 已加入 `.gitignore`，不会被提交到 GitHub。迁移服务器前请备份这个目录。

## 更新机制

更新完全通过 GitHub 完成，核心文件是根目录的 `update-manifest.json`。每次发布新版本时，需要同时更新：

- `version`：新版本号，例如 `0.4.5`
- `releasedAt`：发布时间
- `announcement`：前端公告
- `changelog`：管理后台展示的更新日志

部署主机检查更新时会读取 GitHub 上的 `update-manifest.json`，并与本地版本比较。管理员点击更新后，后端会执行：

```text
检查 GitHub manifest
确认本地 Git 工作区干净
git fetch origin main
git pull --ff-only origin main
scripts/update.sh
docker compose build --build-arg SPARKLAB_VERSION=... --build-arg SPARKLAB_COMMIT=...
后台执行 docker compose up -d --remove-orphans --no-build
```

更新过程中后端会把当前阶段写入 `data/server/update-status.json`，重启日志默认写入 `data/server/update-redeploy.log`。管理后台会轮询 `/admin/updates/status`，显示拉取代码、合并代码、构建镜像、重启服务等状态；新后端启动后会确认“运行中的版本/提交”已经到达目标版本，然后前端倒计时自动刷新页面。

这样后端接口可以先返回“更新已安排”，随后 Compose 在后台接管重启；即使前端短暂连不上服务，恢复后也会继续读状态并刷新到新版本。

管理后台会同时展示三种状态：

- 运行中：当前后端进程启动时记录的版本和提交。
- 仓库：服务器本地 Git 仓库当前拉取到的版本和提交。
- GitHub：远端发布清单和最新提交。

如果仓库已经变成新版本，但运行中仍是旧版本，说明代码已拉取但容器没有重建/重启成功；此时后台会显示“代码已拉取，运行仍是旧版本”，并允许再次点击更新来重建部署。

更新脚本在容器内运行时，会通过 `docker inspect` 自动识别 `/app/repo` 对应的宿主机项目目录，并把它传给 Docker Compose。正常情况下 `.env` 里的 `HOST_PROJECT_DIR` 可以留空；如果自动识别失败，再手动填写服务器上的项目绝对路径，例如 `/root/SparkLab`。

默认更新脚本不再强制拉取 Docker Hub 基础镜像。需要刷新基础镜像时，可在 `.env` 中设置：

```env
SPARKLAB_BUILD_PULL=true
```

## 发版流程

在开发机完成修改后：

```bash
git status
```

确认 `update-manifest.json` 已提升版本并写好日志，然后提交并推送：

```bash
git add .
git commit -m "你的版本说明"
git push origin main
```

服务器端有两种检查方式：

- 进入前端页面时，会自动请求 `/updates/check`，用于公告和新版本提示。
- 管理员进入后台首页时，会请求 `/admin/updates/check`，并可点击“更新”执行 `/admin/updates/apply`。

如果仓库是私有仓库，需要让服务器具备拉取权限：可以配置 Deploy Key，也可以把远程地址配置为带权限的 HTTPS 地址。`GITHUB_TOKEN` 只用于提高 GitHub API 检查额度或读取私有 manifest，`git pull` 本身仍需要 Git 凭据。

## 环境变量

主要变量在根目录 `.env.example` 中：

```env
WEB_PORT=3000
BACKEND_PORT=3001
WEB_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001
SERVER_URL=http://backend:3001
DATABASE_URL=file:/app/data/spark_lab.db
JWT_SECRET=
GITHUB_REPO=opshenyi/SparkLab
GITHUB_BRANCH=main
HOST_PROJECT_DIR=
SPARKLAB_UPDATE_DIR=/app/data
UPDATE_CHECK_CACHE_SECONDS=300
UPDATE_SCRIPT_TIMEOUT_SECONDS=1200
SPARKLAB_BUILD_PULL=false
SEED_ON_START=true
SEED_DEMO_DATA=false
SPARKLAB_BOOTSTRAP_ADMIN_USERNAME=admin
SPARKLAB_BOOTSTRAP_ADMIN_PASSWORD=
SPARKLAB_BOOTSTRAP_CREDENTIALS_FILE=/app/data/bootstrap-admin.txt
COOKIE_SECURE=
COOKIE_SAMESITE=lax
```

对外访问地址变更时，通常只需要改 `WEB_URL` 和 `NEXT_PUBLIC_API_URL`。`SERVER_URL=http://backend:3001` 是容器内部地址，一般不要改。

## 常用维护命令

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f web
docker compose restart
docker compose pull
docker compose up -d
```

手动触发同一套更新脚本：

```bash
bash scripts/update.sh
```

## 版本清单

当前版本由 `update-manifest.json` 控制。发布新代码但没有提升 manifest 版本时，后台会提示“GitHub 有新代码但版本号未变化”，仍可由管理员手动应用更新。
