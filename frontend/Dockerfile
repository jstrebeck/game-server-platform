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

# Copy only required files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Expose Next.js port
EXPOSE 3000

# Start Next.js
CMD ["npm", "run", "start"]
