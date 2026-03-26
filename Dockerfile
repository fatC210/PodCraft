# 构建阶段（用 bun，与项目 lockfile 一致）
FROM oven/bun:alpine AS builder

WORKDIR /app
COPY package.json bun.lock* bun.lockb* ./
RUN bun install

COPY . .
RUN bun run build

# 生产阶段
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
# 放入 templates 目录，nginx 启动时自动 envsubst 替换环境变量
COPY nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 80
