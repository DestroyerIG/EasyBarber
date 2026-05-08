# Design: UUID casts in raw queries

## Context
PostgreSQL does not cast text to uuid implicitly. Raw queries in backend repositories compare or write uuid columns with text parameters, which fails with "operator does not exist: uuid = text".

## Goals
- Add explicit ::uuid casts for all raw query parameters that target uuid columns in backend/src/repositories.
- Keep existing query structure, error handling, and logic unchanged.

## Non-goals
- Refactor repositories or replace raw queries with Prisma query API.
- Change schema or application behavior beyond missing casts.
- Touch files outside backend/src/repositories.

## Source of truth
- prisma/schema.prisma defines all uuid columns.

## Approach (Option B)
1. Extract the list of uuid columns from prisma/schema.prisma.
2. Scan backend/src/repositories for $queryRaw and $queryRawUnsafe (including Prisma.sql).
3. For each raw query, add ::uuid to parameters used in:
   - WHERE/ON comparisons against uuid columns.
   - INSERT VALUES for uuid columns.
   - UPDATE SET assignments to uuid columns.
4. Do not modify expressions that already include ::uuid.
5. Keep formatting and query structure unchanged.

## Change rules
- WHERE/ON: column = ${param}::uuid
- INSERT VALUES: ${param}::uuid for uuid columns
- UPDATE SET: column = ${param}::uuid
- Maintain existing SQL and Prisma template style.

## Risks and mitigations
- Wrong column type: cross-check each column with the schema list.
- Double casts or syntax errors: skip any expression already ending with ::uuid.

## Testing
- No new automated tests required.
- Optional: run a small set of repository calls that previously failed.

## Rollout
- Local code change only. No runtime config changes.
