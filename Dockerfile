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

WORKDIR /app/docs-site
RUN npm run build

WORKDIR /app/workspace
RUN npm run build:client

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

COPY --from=builder /app/workspace/dist ./workspace/dist
COPY --from=builder /app/docs-site/build ./workspace/dist/docs
COPY shared ./shared
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

RUN mkdir -p /app/data/pdfs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

WORKDIR /app/workspace
CMD ["sh", "-c", "npx tsx src/server/db/migrate.ts && npm run start"]
