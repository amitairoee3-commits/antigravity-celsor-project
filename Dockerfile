# Stage 1: Dependencies & Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies needed for node-gyp (optional but good practice)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# We build the next app. If you use a custom server, ensure it is compiled too if it uses TS.
# Since we are using Next's built-in features plus a server.ts, we need to compile server.ts.
# We will use tsx or ts-node in production or compile it.
RUN npm run build

# Compile the custom server using typescript
RUN npx tsc src/server.ts --outDir dist --esModuleInterop

# Stage 2: Production runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Security: run as non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built assets
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy compiled custom server
COPY --from=builder /app/dist/server.js ./server.js

# Install production dependencies for custom server if needed (standalone usually includes what's needed for next, but server.js might need Socket.io, BullMQ)
COPY package.json package-lock.json ./
RUN npm ci --only=production

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Run custom server
CMD ["node", "server.js"]
