# ───────────────────────────────────────────
# Weldr Agent Application
#   • Alpine Linux base (minimal footprint)
#   • Node.js + Bun
#   • Local SSD storage with rclone S3 sync
#   • Turborepo pruned build
#   • AMD64 architecture
# ───────────────────────────────────────────

# ───────────────────────────────────────────
# Version definitions
# ───────────────────────────────────────────
ARG NODE_VERSION=22
ARG RCLONE_VERSION=1.71.2
ARG BUN_VERSION=1.3.5
ARG TURBO_VERSION=2.6.0

FROM node:${NODE_VERSION}-alpine AS base

# Redeclare ARGs for use in this stage
ARG RCLONE_VERSION
ARG BUN_VERSION

# ───────────────────────────────────────────
# System dependencies
# ───────────────────────────────────────────
RUN --mount=type=cache,target=/var/cache/apk,sharing=locked \
  apk add --no-cache \
  bash \
  ca-certificates \
  curl \
  unzip \
  tree \
  git \
  ripgrep \
  jq \
  dumb-init && \
  rm -rf /tmp/* /var/tmp/*

# ───────────────────────────────────────────
# Install rclone (AMD64)
# ───────────────────────────────────────────
RUN curl -fsSL "https://github.com/rclone/rclone/releases/download/v${RCLONE_VERSION}/rclone-v${RCLONE_VERSION}-linux-amd64.zip" -o /tmp/rclone.zip && \
  unzip -q /tmp/rclone.zip -d /tmp && \
  mv "/tmp/rclone-v${RCLONE_VERSION}-linux-amd64/rclone" /usr/local/bin/rclone && \
  chmod +x /usr/local/bin/rclone && \
  rm -rf /tmp/rclone*

# ───────────────────────────────────────────
# Install Bun
# ───────────────────────────────────────────
RUN curl -fsSL https://bun.sh/install | bash -s -- "bun-v${BUN_VERSION}" && \
  mv /root/.bun/bin/bun /usr/local/bin/bun && \
  chmod +x /usr/local/bin/bun && \
  rm -rf /root/.bun

# ───────────────────────────────────────────
# Set git config
# ───────────────────────────────────────────
RUN git config --global user.name "weldr" && \
  git config --global user.email "noreply@weldr.ai" && \
  git config --global --add safe.directory /workspace && \
  git config --global init.defaultBranch main

# ───────────────────────────────────────────
# Builder stage - prune workspace
# ───────────────────────────────────────────
FROM base AS builder

# Redeclare ARG for use in this stage
ARG TURBO_VERSION

WORKDIR /app

# Install turbo globally with cache mount
RUN --mount=type=cache,target=/root/.npm \
  npm install -g turbo@${TURBO_VERSION}

# Copy entire workspace for turbo prune
COPY . .

# Prune workspace for agent app
RUN turbo prune @weldr/agent --docker

# ───────────────────────────────────────────
# Installer stage - install dependencies
# ───────────────────────────────────────────
FROM base AS installer

WORKDIR /app

# Set environment variables
ENV CI=true \
  NODE_ENV=production \
  BUN_HOME=/root/.bun/install/cache

# Copy pruned package.json files and lockfiles
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/bun.lockb ./bun.lockb
COPY --from=builder /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Install all dependencies (needed for build) with cache mount
RUN --mount=type=cache,id=bun,target=/root/.bun/install/cache \
  bun install --frozen-lockfile

# Copy source files
COPY --from=builder /app/out/full/ .

# Build the application
RUN bun run turbo build --cwd apps/agent

# Prune dev dependencies and install only production dependencies
RUN --mount=type=cache,id=bun,target=/root/.bun/install/cache \
  bun install --production --frozen-lockfile --ignore-scripts

# Clean up unnecessary files
RUN rm -rf \
  node_modules/@aws-sdk/client-iam \
  node_modules/ofetch \
  /root/.bun/install/cache \
  /root/.cache \
  /root/.npm \
  /tmp/* \
  /var/tmp/* \
  2>/dev/null || true

# ───────────────────────────────────────────
# Runner stage - production
# ───────────────────────────────────────────
FROM base AS runner

# Set production environment
ENV NODE_ENV=production \
  PORT=8080

# Copy branch management scripts
COPY --from=builder /app/apps/agent/scripts/sync-to-s3.sh /usr/local/bin/sync-to-s3.sh
COPY --from=builder /app/apps/agent/scripts/sync-from-s3.sh /usr/local/bin/sync-from-s3.sh
COPY --from=builder /app/apps/agent/scripts/create-branch-dir.sh /usr/local/bin/create-branch-dir.sh
COPY --from=builder /app/apps/agent/scripts/cleanup-lru.sh /usr/local/bin/cleanup-lru.sh
RUN chmod +x /usr/local/bin/*.sh

# Copy production artifacts and dependencies
COPY --from=installer /app/apps/agent/dist ./dist
COPY --from=installer /app/apps/agent/package.json ./package.json
COPY --from=installer /app/packages ./packages
COPY --from=installer /app/node_modules ./node_modules
COPY --from=installer /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Aggressive cleanup to reduce image size
RUN find node_modules -type d \( \
  -name ".cache" -o \
  -name "__tests__" -o \
  -name "test" -o \
  -name "tests" -o \
  -name ".turbo" \
  \) -exec rm -rf {} + 2>/dev/null || true && \
  find node_modules -type f \( \
  -name "*.tsbuildinfo" -o \
  -name "*.test.*" -o \
  -name "*.spec.*" -o \
  -name "*.md" -o \
  -name "CHANGELOG*" -o \
  -name "LICENSE*" -o \
  -name "AUTHORS*" -o \
  -name ".npmignore" -o \
  -name ".gitignore" -o \
  -name "*.map" ! -path "*/source-map/*" \
  \) -delete 2>/dev/null || true && \
  rm -rf \
  packages/*/node_modules \
  packages/*/.turbo \
  packages/*/tsconfig.tsbuildinfo \
  /tmp/* \
  /var/tmp/* \
  2>/dev/null || true

# Set working directory
WORKDIR /

# Expose agent port
EXPOSE 8080

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Run the application
CMD ["node", "dist/index.js"]
