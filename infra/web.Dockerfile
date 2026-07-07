FROM node:20-alpine

WORKDIR /app/apps/web

COPY apps/web/package.json /app/apps/web/package.json
COPY apps/web/package-lock.json /app/apps/web/package-lock.json
RUN npm ci

COPY apps/web /app/apps/web

