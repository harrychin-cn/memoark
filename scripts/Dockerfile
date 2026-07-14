ARG TARGETOS
ARG TARGETARCH
ARG TARGETVARIANT

FROM --platform=$BUILDPLATFORM golang:1.26.2-alpine AS backend
WORKDIR /backend-build
ARG TARGETOS TARGETARCH TARGETVARIANT VERSION=dev COMMIT=unknown COMPLIANCE_CHECK=false

# Install build dependencies
RUN apk add --no-cache git ca-certificates

# Copy go mod files and download dependencies (cached layer)
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

# Copy source code (use .dockerignore to exclude unnecessary files)
COPY . .

# Commercial release builds must opt into this check. It rejects a source notice or SBOM
# generated for a different target, version, revision, Go build toolchain, or dependency manifest before compiling the binary.
RUN if [ "$COMPLIANCE_CHECK" = "true" ]; then \
      source_suffix="${TARGETOS}-${TARGETARCH}${TARGETVARIANT}"; \
      source_target="${TARGETOS}/${TARGETARCH}"; \
      if [ -n "$TARGETVARIANT" ]; then source_target="${source_target}/${TARGETVARIANT}"; fi; \
      go_toolchain_version="$(go env GOVERSION)"; \
      go_root="$(go env GOROOT)"; \
      source_notice="notices/memoark-source-${source_suffix}.THIRD_PARTY_NOTICES"; \
      source_sbom="sbom/memoark-source-${source_suffix}.cdx.json"; \
      sbom_value() { awk -F '"' -v key="$1" '$2 == "name" && $4 == key { getline; print $4; exit }' "$source_sbom"; }; \
      test -s "$source_notice" && \
      test -s "$source_sbom" && \
      grep -F -- "- application version: ${VERSION}" "$source_notice" >/dev/null && \
      grep -F -- "- git revision: ${COMMIT}" "$source_notice" >/dev/null && \
      grep -F -- "- Go target: ${source_target}" "$source_notice" >/dev/null && \
      grep -F -- "- Go binary build toolchain: ${go_toolchain_version}" "$source_notice" >/dev/null && \
      grep -F -- "## golang-runtime: Go standard library and runtime@${go_toolchain_version#go}" "$source_notice" >/dev/null && \
      test "$(sbom_value memoark:application-version)" = "${VERSION}" && \
      test "$(sbom_value memoark:git-revision)" = "${COMMIT}" && \
      test "$(sbom_value memoark:go-target)" = "${source_target}" && \
      test "$(sbom_value memoark:go-build-toolchain-version)" = "${go_toolchain_version}" && \
      test "$(sbom_value memoark:go-runtime-license-sha256)" = "$(sha256sum "$go_root/LICENSE" | awk '{print $1}')" && \
      test "$(sbom_value memoark:go-runtime-patents-sha256)" = "$(sha256sum "$go_root/PATENTS" | awk '{print $1}')" && \
      test "$(sed -n 's/^- go.mod SHA-256: //p' "$source_notice")" = "$(sha256sum go.mod | awk '{print $1}')" && \
      test "$(sed -n 's/^- go.sum SHA-256: //p' "$source_notice")" = "$(sha256sum go.sum | awk '{print $1}')" && \
      test "$(sed -n 's/^- web\/package.json SHA-256: //p' "$source_notice")" = "$(sha256sum web/package.json | awk '{print $1}')" && \
      test "$(sed -n 's/^- web\/pnpm-lock.yaml SHA-256: //p' "$source_notice")" = "$(sha256sum web/pnpm-lock.yaml | awk '{print $1}')" && \
      test "$(sbom_value memoark:go.mod-sha256)" = "$(sha256sum go.mod | awk '{print $1}')" && \
      test "$(sbom_value memoark:go.sum-sha256)" = "$(sha256sum go.sum | awk '{print $1}')" && \
      test "$(sbom_value memoark:package.json-sha256)" = "$(sha256sum web/package.json | awk '{print $1}')" && \
      test "$(sbom_value memoark:pnpm-lock-sha256)" = "$(sha256sum web/pnpm-lock.yaml | awk '{print $1}')"; \
    fi

# Please build frontend first, so that the static files are available.
# Refer to `pnpm release` in package.json for the build command.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    goarm="$(printf %s "$TARGETVARIANT" | sed 's/^v//')" && \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH GOARM="$goarm" \
    go build \
      -trimpath \
      -ldflags="-s -w -X github.com/usememos/memos/internal/version.Version=${VERSION} -X github.com/usememos/memos/internal/version.Commit=${COMMIT} -extldflags '-static'" \
      -tags netgo,osusergo \
      -o memos \
      ./cmd/memos

# Use minimal Alpine with security updates
FROM alpine:3.21 AS monolithic
ARG TARGETOS TARGETARCH TARGETVARIANT VERSION=dev COMMIT=unknown COMPLIANCE_CHECK=false

# Install runtime dependencies and create non-root user in single layer
RUN apk add --no-cache tzdata ca-certificates su-exec && \
    addgroup -g 10001 -S nonroot && \
    adduser -u 10001 -S -G nonroot -h /var/opt/memos nonroot && \
    mkdir -p /var/opt/memos /usr/local/memos && \
    chown -R nonroot:nonroot /var/opt/memos

# Copy binary and entrypoint to /usr/local/memos
COPY --from=backend /backend-build/memos /usr/local/memos/memos
COPY --from=backend --chmod=755 /backend-build/scripts/entrypoint.sh /usr/local/memos/entrypoint.sh
COPY --from=backend /backend-build/LICENSE /usr/local/memos/LICENSE
COPY --from=backend /backend-build/NOTICE /usr/local/memos/NOTICE
COPY --from=backend /backend-build/TRADEMARKS.md /usr/local/memos/TRADEMARKS.md
COPY --from=backend /backend-build/PRIVACY.md /usr/local/memos/PRIVACY.md
COPY --from=backend /backend-build/docs/ADVERTISING.md /usr/local/memos/ADVERTISING.md
COPY --from=backend /backend-build/notices/memoark-source-${TARGETOS}-${TARGETARCH}${TARGETVARIANT}.THIRD_PARTY_NOTICES /usr/local/memos/THIRD_PARTY_NOTICES
COPY --from=backend /backend-build/sbom/memoark-source-${TARGETOS}-${TARGETARCH}${TARGETVARIANT}.cdx.json /usr/local/memos/sbom.cdx.json
RUN source_target="${TARGETOS}/${TARGETARCH}" && \
    if [ -n "$TARGETVARIANT" ]; then source_target="${source_target}/${TARGETVARIANT}"; fi && \
    sbom_value() { awk -F '"' -v key="$1" '$2 == "name" && $4 == key { getline; print $4; exit }' /usr/local/memos/sbom.cdx.json; } && \
    test -s /usr/local/memos/THIRD_PARTY_NOTICES && \
    test -s /usr/local/memos/sbom.cdx.json && \
    grep -F -- "- Go target: ${source_target}" /usr/local/memos/THIRD_PARTY_NOTICES >/dev/null && \
    test "$(sbom_value memoark:go-target)" = "${source_target}" && \
    if [ "$COMPLIANCE_CHECK" = "true" ]; then \
      grep -F -- "- application version: ${VERSION}" /usr/local/memos/THIRD_PARTY_NOTICES >/dev/null && \
      grep -F -- "- git revision: ${COMMIT}" /usr/local/memos/THIRD_PARTY_NOTICES >/dev/null && \
      test "$(sbom_value memoark:application-version)" = "${VERSION}" && \
      test "$(sbom_value memoark:git-revision)" = "${COMMIT}"; \
    fi

# Run as root to fix permissions, entrypoint will drop to nonroot
USER root

# Set working directory to the writable volume
WORKDIR /var/opt/memos

# Data directory
VOLUME /var/opt/memos

ENV TZ="UTC" \
    MEMOS_PORT="5230"

EXPOSE 5230

ENTRYPOINT ["/usr/local/memos/entrypoint.sh", "/usr/local/memos/memos"]
