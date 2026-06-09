# Contributing to Orch

Thanks for your interest in contributing! This guide covers how to get a local
environment running and how to submit changes.

## Getting started

The fastest way to run the whole stack is Docker:

```bash
git clone https://github.com/EnterpriseX-Platform/Orch.git
cd Orch
docker compose up --build      # → http://localhost:3047/orch
```

For active development with hot reload, run the infrastructure in Docker and the
apps on your host:

```bash
pnpm install
pnpm start:infra                       # Postgres, Kafka, Zookeeper, Kafka UI

cd apps/web
npx prisma migrate deploy && npx prisma generate
pnpm --filter orch-web dev             # http://localhost:3047

cd apps/orch-broker
cargo run                              # http://localhost:8047
```

See [`docs/`](docs/) for architecture and design references.

## Project structure

- `apps/web` — Next.js control plane (UI + config API + Prisma schema)
- `apps/orch-broker` — Rust gateway + flow engine
- `packages/sdk` — shared TypeScript SDK (`@orch/sdk`)

## Making changes

1. Fork the repo and create a branch from `master` (`feat/...`, `fix/...`).
2. Keep changes focused; match the style of the surrounding code.
3. Run the checks before opening a PR:
   - Web: `pnpm lint` and `pnpm build`
   - Broker: `cargo fmt`, `cargo clippy`, `cargo test`
   - Schema changes: `npx prisma validate` and add a migration
       (`npx prisma migrate dev --name <description>`)
4. Write a clear PR description explaining the what and why. Link any related issue.

## Guidelines

- Code, comments, and user-facing text are in **English**.
- Do not commit secrets. Use `.env` (gitignored) and `.env.example` for placeholders.
- The SDK is consumed as a built artifact — run `pnpm build` in `packages/sdk` after editing it.

## Reporting bugs & requesting features

Open a [GitHub issue](https://github.com/EnterpriseX-Platform/Orch/issues) with steps to
reproduce, expected vs. actual behavior, and your environment. For security issues, see
[SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

By contributing, you agree that your contributions will be licensed under the
[AGPL-3.0](LICENSE).
