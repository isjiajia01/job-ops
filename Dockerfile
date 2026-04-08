# syntax=docker/dockerfile:1.6

ARG BASE_IMAGE=ghcr.io/isjiajia01/job-ops-base:arm64-latest

# ==========================================================================
# BUILD STAGE
# ==========================================================================
FROM ${BASE_IMAGE} AS builder

WORKDIR /app

COPY shared ./shared
COPY docs-site ./docs-site
COPY workspace ./workspace
COPY scripts ./scripts
COPY visa-sponsor-providers ./visa-sponsor-providers
COPY extractors/adzuna ./extractors/adzuna
COPY extractors/gradcracker ./extractors/gradcracker
COPY extractors/hiringcafe ./extractors/hiringcafe
COPY extractors/jobindex ./extractors/jobindex
COPY extractors/jobspy ./extractors/jobspy
COPY extractors/startupjobs ./extractors/startupjobs
COPY extractors/thehub ./extractors/thehub
COPY extractors/ukvisajobs ./extractors/ukvisajobs

WORKDIR /app
RUN npm run build:extractors

WORKDIR /app/docs-site
RUN npm run build

WORKDIR /app/workspace
RUN npm run build:client && npm run build:server

# ==========================================================================
# PRODUCTION STAGE
# ==========================================================================
FROM ${BASE_IMAGE} AS production

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV PORT=3001
ENV PYTHON_PATH=/usr/bin/python3
ENV DATA_DIR=/app/data
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

COPY package*.json ./
COPY docs-site/package*.json ./docs-site/
COPY shared/package*.json ./shared/
COPY workspace/package*.json ./workspace/
COPY extractors/adzuna/package*.json ./extractors/adzuna/
COPY extractors/gradcracker/package*.json ./extractors/gradcracker/
COPY extractors/hiringcafe/package*.json ./extractors/hiringcafe/
COPY extractors/jobindex/tsconfig.json ./extractors/jobindex/
COPY extractors/jobspy/tsconfig.json ./extractors/jobspy/
COPY extractors/startupjobs/package*.json ./extractors/startupjobs/
COPY extractors/thehub/tsconfig.json ./extractors/thehub/
COPY extractors/ukvisajobs/package*.json ./extractors/ukvisajobs/

COPY --from=builder /app/workspace/dist ./workspace/dist
COPY --from=builder /app/docs-site/build ./workspace/dist/docs
COPY --from=builder /app/visa-sponsor-providers/uk/dist ./visa-sponsor-providers/uk/dist
COPY --from=builder /app/extractors/adzuna/dist ./extractors/adzuna/dist
COPY --from=builder /app/extractors/gradcracker/dist ./extractors/gradcracker/dist
COPY --from=builder /app/extractors/hiringcafe/dist ./extractors/hiringcafe/dist
COPY --from=builder /app/extractors/jobindex/dist ./extractors/jobindex/dist
COPY --from=builder /app/extractors/jobspy/dist ./extractors/jobspy/dist
COPY --from=builder /app/extractors/startupjobs/dist ./extractors/startupjobs/dist
COPY --from=builder /app/extractors/thehub/dist ./extractors/thehub/dist
COPY --from=builder /app/extractors/ukvisajobs/dist ./extractors/ukvisajobs/dist
COPY extractors/jobspy/scrape_jobs.py ./extractors/jobspy/scrape_jobs.py

RUN npm prune --omit=dev --workspaces --include-workspace-root \
  && mkdir -p /app/data/pdfs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

WORKDIR /app/workspace
CMD ["sh", "-c", "node dist/server/db/migrate.js && node dist/server/index.js"]
