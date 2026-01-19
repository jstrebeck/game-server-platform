# =========================================================
# 1) Dependencies stage
# =========================================================
FROM node:20-alpine AS deps

WORKDIR /app

# Copy lock files
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./

# Install dependencies
RUN npm install


# =========================================================
# 2) Build stage
# =========================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Build-time args for NEXT_PUBLIC_* variables
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build Next.js app
RUN npm run build


# =========================================================
# 3) Production runtime
# =========================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build (includes only necessary node_modules)
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

# Expose Next.js port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start with node directly (standalone includes server.js)
CMD ["node", "server.js"]
