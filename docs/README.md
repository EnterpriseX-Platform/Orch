# Documentation

Design and architecture references for Orch. Start with the
[project README](../README.md) for an overview and quick start.

## Architecture

- [ARCHITECTURE.md](ARCHITECTURE.md) — system overview: web control plane, Rust broker, data flow.
- [EVENT_DRIVEN_FLOW_ARCHITECTURE.md](EVENT_DRIVEN_FLOW_ARCHITECTURE.md) — how flows execute and emit events.
- [external-workers-design.md](external-workers-design.md) — external worker model and job execution.
- [ASYNC_RESPONSE_GUIDE.md](ASYNC_RESPONSE_GUIDE.md) — async request/response handling.

## Configuration & operations

- [CONFIG_CONCEPT.md](CONFIG_CONCEPT.md) — configuration model: projects, APIs, flows, routing.
- [PORTS.md](PORTS.md) — port assignments across services.
- [LOCAL-DEV.md](LOCAL-DEV.md) — local development setup.
- [LOGGING_DESIGN.md](LOGGING_DESIGN.md) — logging architecture (audit / event / access split).

## Subsystems

- [Audit Trail System](../apps/web/docs/AUDIT_SYSTEM.md) — audit capture and history.
- [Cache Architecture](../apps/web/docs/CACHE_ARCHITECTURE.md) — caching strategy.
