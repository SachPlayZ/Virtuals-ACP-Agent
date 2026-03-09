# ── Stage 1: Build ──────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy dependency manifests first (better layer caching)
COPY package.json package-lock.json ./

# Install ALL dependencies (including devDependencies for tsc)
RUN npm ci

# Copy source code & TS config
COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript → JavaScript
RUN npm run build

# ── Stage 2: Production ────────────────────────────────────────
FROM node:20-slim AS runtime

WORKDIR /app

# sharp requires some native libs in slim images
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libvips-dev \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install production-only dependencies
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Expose the server port (default 3000)
EXPOSE 3000

# Run as non-root for security
RUN groupadd -r appuser && useradd -r -g appuser appuser
USER appuser

# Health-check (Fastify will respond on /)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/').then(r=>{process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"

# Start the server
CMD ["node", "dist/index.js"]
