# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, report them privately using
[GitHub Security Advisories](https://github.com/EnterpriseX-Platform/Orch/security/advisories/new).
We will acknowledge your report, investigate, and keep you updated on the fix.

When reporting, please include:

- A description of the vulnerability and its impact
- Steps to reproduce (proof-of-concept if possible)
- Affected version/commit and environment

## Supported versions

This project is under active development. Security fixes are applied to the
latest `master`.

## Handling secrets

Orch is configured entirely through environment variables and secret stores —
never hard-code credentials.

- `.env` is gitignored; commit only `.env.example` with placeholder values.
- `JWT_SECRET` and any API tokens must be supplied at deploy time, not committed.
- If a secret is ever committed, **rotate it immediately** — rewriting Git history
  does not guarantee the old value is unreachable on remote hosts or in clones.
