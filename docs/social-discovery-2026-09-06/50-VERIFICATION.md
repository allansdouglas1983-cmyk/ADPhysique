# 50 — Verification: Volyume Community

## Settled-tree checks (branch `claude/volyume-social-discovery-h7dknu`)

Filled in from the final run over the settled tree (see the tails block at
the end of this file).

## What was verified, and how

**Cloud schema.** Migration 160 was applied twice (fresh and re-run) to a
throwaway PostgreSQL 16 with stubs for `auth`, `consent_log`,
`user_body_profile` and `partnerships`, then torn down: idempotent; 14
tables with RLS on and zero policies; 72 of 72 functions SECURITY DEFINER
with `search_path` pinned; exactly the 41 `community_*` RPCs executable by
`authenticated`, no helper, nothing by `anon`. Behaviour proven live:
accent folding, area-scoped gym keys, minor forced to followers-only,
partnership to mutual follows both ways, counters, PR payload weight
passing while nested bodyweight raises `forbidden_field`, blocked caption
raising `content_not_allowed`, the 3/day post limit, auto-hide at exactly
the third distinct reporter with an audit row, moderator unhide, block
deleting both edges and hiding the profile, cursor round trip, consent
grant and withdrawal rows, `community_leave`, and `delete_user_data`
clearing every Community row. Guards in `src/__tests__/community.*`
pin the rpc-only shape, the deletion coverage, the consent widening, the
forbidden keys, blocked terms and payload allow-lists against the client
constants, and the client RPC argument names against the migration's real
signatures.

**Client library.** Unit tests over the real database module on in-memory
SQLite: a kettlebell circuit snapshot (3 rounds, 90 s round rest) survives
import and adaptation with those fields intact; every imported row has a
null starting weight; excluded, unreachable-kit and limitation cases each
produce a substitute with the right reason; no alternative keeps the row
with a reason; day mismatch is reported; forbidden keys are rejected; the
payload allow-lists are exact; transport fails closed on unresolved
consent and sign-out wiping; only `transport.js` reaches the Supabase
client.

**Screens.** Mount tests for all fifteen screens; state tests for the hub
(no profile, following-empty with suggestions, discover with Volyume
tiles, offline cached, legacy partner card, params on remount), join
(handle states, offline), edit profile and privacy (partial updates),
programme (structure with circuits, never a weight, Adapt leads, already
using it, reporting a comment, reader without a profile), adapt (reason
copy, days mismatch, unreadable limitations offers actions), compose
hand-off, search programmes paging, moderation queue and note, activity
row, post card per kind.

**Journeys walked in code by the adversarial reviews** (`51`, `52`) and
the fixes each produced: new user with zero connections; find by handle;
discover through a programme; publish then view as another user; use
as-is; adapt with an exclusion and a kit mismatch; circuit programme;
post from workout summary and share card; block then invisibility in
every screen; report a post and a comment; leave; offline open; legacy
partner link; cold deep links `u`, `p`, `s`; account deletion coverage;
minors; suspended and restricted accounts; rate rails; forbidden-key
bypass attempts; push replay; erasure.

**Retirement.** Full suite green after Partners removal; App.js no longer
intercepts partner links; every surviving `partner` reference is
accounted for in the retirement commit.

## Not verified here (device only)
Rendering on a physical device, the OS share sheet, push arrival, the
universal-link association on a signed build, and the public pages
against the deployed function. These are the founder's device checklist
(blueprint §12, sixteen steps) on an EAS build after migration 160 and
the two functions are applied on the founder's exact phrase.

## Tails from the settled tree

Run 2026-09-06 over the settled branch tree (`2d61886` plus the closing
docs), exact outputs:

```
> volyume@1.3.5 lint
> eslint . --max-warnings 0
(no output; exit 0)

npx tsc --noEmit                      (no output; exit 0)
node scripts/check-imports.cjs        check-imports: OK (1863 files, no unresolved imports or missing named exports).
bash scripts/check-identity-invariant.sh
                                      Identity invariant clean: all 'SET user_id' callsites are annotated.

> volyume@1.3.5 test
> cross-env TZ=Europe/London jest --runInBand
Test Suites: 1 skipped, 1211 passed, 1211 of 1212 total
Tests:       16 skipped, 16841 passed, 16857 total
Snapshots:   17 passed, 17 total
Time:        192.671 s
```

Final product pass (blueprint §14), settled tree:

```
> volyume@1.3.5 lint
> eslint . --max-warnings 0
(no output; exit 0)
Test Suites: 1 skipped, 1216 passed, 1216 of 1217 total
Tests:       16 skipped, 16869 passed, 16885 total
Snapshots:   17 passed, 17 total
Time:        280.535 s
```
