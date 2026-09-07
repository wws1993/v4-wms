# 可选：仅在能正常拉取 Docker Hub / 镜像加速时使用。
# 国内 ECS 推荐直接跑 server.py（见 ../docs/部署指南.md），不要 docker build 本目录。
FROM docker.m.daocloud.io/library/node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm config set registry https://registry.npmmirror.com \
  && npm install --omit=dev
COPY server.js ./
RUN mkdir -p /data
ENV PORT=3000
ENV WMS_DATA_DIR=/data
EXPOSE 3000
CMD ["npm", "start"]
