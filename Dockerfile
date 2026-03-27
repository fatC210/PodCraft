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
COPY nginx.conf /etc/nginx/nginx.conf.template

EXPOSE 80

CMD ["/bin/sh", "-c", "RESOLVER=$(grep nameserver /etc/resolv.conf | head -1 | awk '{print $2}'); sed \"s/__RESOLVER__/$RESOLVER/\" /etc/nginx/nginx.conf.template > /tmp/nginx.tpl; envsubst '${BACKEND_HOST} ${PORT}' < /tmp/nginx.tpl > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
