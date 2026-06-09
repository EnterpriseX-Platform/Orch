# ==========================================
# Orch - Next.js Dockerfile
# Port: 3047
# Base Path: /orch
# Build context: repository root (.)
# ==========================================

FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy workspace config and lockfile from root
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/sdk/package.json ./packages/sdk/
COPY apps/web/package.json ./apps/web/

# Install dependencies using pnpm (workspace-aware)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/sdk ./packages/sdk
COPY apps/web ./apps/web

# Build SDK first (workspace dependency)
RUN cd packages/sdk && pnpm run build 2>/dev/null || true

# Generate Prisma Client
RUN cd apps/web && npx prisma generate

# Build the application from workspace root
ENV NEXT_PUBLIC_API_BASE_URL=/orch/api
RUN pnpm --filter orch-web run build

# Production image, copy all the files and run next
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3047

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Automatically leverage output traces to reduce image size
# In pnpm workspace, standalone output has server.js at apps/web/server.js
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./

# public + static must be placed next to server.js for Next.js to find them
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

# Copy Prisma files for migrations
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/prisma ./prisma

USER nextjs

EXPOSE 3047

ENV HOSTNAME="0.0.0.0"
ENV PORT=3047

# In pnpm workspace, standalone output places server.js under apps/web/
CMD ["node", "apps/web/server.js"]
