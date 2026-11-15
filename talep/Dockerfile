FROM node:22-alpine
WORKDIR /srv
COPY server.mjs index.html ./
USER node
ENV NODE_ENV=production
CMD ["node","server.mjs"]
