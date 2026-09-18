# 01-fix-all-to-20-20

Status: ready-for-agent

## Ticket

Remediate all audit findings to 20/20 per `.scratch/audit-remediation/PRD.md` (source of truth).

## TDD slices

Work slice by slice: add/extend vitest coverage for callers you touch, then fix, then run `npx vitest run <touched>` + eslint on touched files.

## Blast-radius rule

Before finalizing each edit: run `graphify affected "<symbol>"` (e.g. Label, ProductCard, WalletPage) and cover impacted callers in tests. Do NOT run broad graph queries (orientation already done, 2-query budget spent).

## After merge

Run `graphify update .` (code-only fast path) to refresh the map.

## Done when

All P0/P1/P2/P3 in your group resolved, tests green, group re-audit 20/20.
