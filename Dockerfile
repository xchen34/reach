# syntax=docker/dockerfile:1

# ---- Builder stage ----
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies based on apps/web/package-lock.json
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

# Copy the rest of the web app source and build it
COPY apps/web/ ./
RUN npm run build

# ---- Production stage ----
FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Only copy what's needed to run the built app
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.mjs ./next.config.mjs

EXPOSE 3000

CMD ["npm", "start"]
