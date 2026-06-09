# ==========================================
# Orch Broker - Rust Dockerfile
# Port: 8047
# ==========================================

FROM rust:1-bookworm AS builder

# Install dependencies (pinned to bookworm = glibc 2.36 so runtime matches)
RUN apt-get update && apt-get install -y pkg-config libssl-dev clang libclang-dev cmake && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Cargo files
COPY Cargo.toml Cargo.lock ./

# Copy source code
COPY src ./src

# Build release binary. Cache the cargo registry + target dir across builds
# (BuildKit cache mounts) so an incremental source change recompiles only the
# broker crate (~minutes) instead of every dependency from scratch (~45 min on
# emulated amd64). The mounts are NOT part of the image, so copy the binary out
# to a plain path for the runtime stage to pick up.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build --release && \
    cp /app/target/release/orch-broker /app/orch-broker

# Runtime stage
FROM debian:bookworm-slim

# Install CA certificates and OpenSSL for HTTPS
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy binary from builder (copied out of the cache-mounted target dir above)
COPY --from=builder /app/orch-broker /app/orch-broker

# Expose port 8047
EXPOSE 8047

# Run the broker
CMD ["/app/orch-broker"]
