# Shared Error Codes: Issue #1266 Implementation and Verification

**Goal:** Finish the verification and contributor guidance needed for [InsForge/InsForge#1266](https://github.com/InsForge/InsForge/issues/1266), preserving the canonical shared contract and current API behavior.

**Status:** Implemented in the fork PR: installed-package checks, CI coverage, quota stability coverage, and contributor guidance. Local validation results and remaining upstream access limitations are recorded below. Upstream issue resolution remains a maintainer decision.

**Baseline:** Fork `ashutoshpw/InsForge`, `main` at `21ce31dd8fb3b75f2c3237eddff947431cfb4028`, reviewed on 2026-10-27. Recheck the baseline before implementation.

**Architecture:** `@insforge/shared-schemas` owns runtime error-code values, validation, and TypeScript types. Backend routes, services, providers, and consumers import the package root. Provider-specific protocols and backend remediation text retain their existing boundaries.

**Tech stack:** TypeScript, Zod, Node ESM, npm workspaces, Vitest, Turborepo, GitHub Actions.

## Findings Before Planning

Three subagents independently reviewed repository standards, the backend error contract and domain coverage, and schema packaging/testing. Their findings were reconciled against the source, Git history, upstream issue discussion, and prior PR metadata before writing this plan.

The issue is still open and currently unassigned, but its original migration is already in this baseline. [PR #1278](https://github.com/InsForge/InsForge/pull/1278) merged into `unify-error-codes`, rather than directly into `main`. Main history contains [PR #1335](https://github.com/InsForge/InsForge/pull/1335), commit `a7027dea`, and the follow-up package-version change in [PR #1336](https://github.com/InsForge/InsForge/pull/1336), commit `dbc0f637`. Repeating the original move would duplicate existing work.

| Issue acceptance criterion | Evidence at baseline | Remaining action |
| --- | --- | --- |
| Shared package exports canonical values and type | `packages/shared-schemas/src/error-codes.schema.ts:158` exports `errorCodeSchema`, `ErrorCode`, and `ERROR_CODES`; `src/index.ts:36` exports the module | Verify installed package artifacts and declaration resolution |
| Backend has no separate local enum | `backend/src/types/error-constants.ts` is absent; backend imports use `@insforge/shared-schemas` | Recheck imports when implementing |
| Existing strings remain stable | Schema comments require stable strings; `backend/tests/unit/shared-error-codes.test.ts` checks key/value identity and selected domain/generic values | Preserve current strings; add a targeted assertion only where missing |
| Known domain codes are available | Schema includes compute quota, deployments, payments, schedules, secrets, docs, and other domains | Add codes only for a demonstrated consumer-facing gap |
| Shared import and missing-code regression tests exist | Shared-code test imports the root; compute service tests cover quota propagation on creation and update | Run existing tests; cover the published import path separately |
| SDK, CLI, MCP have a package-level source | Root exports exist; package manifest points to `dist` | Verify released package availability; record downstream adoption as a separate handoff |

The domain audit found no raw string literal code arguments in current `AppError`/`errorResponse` calls. Remaining generic validation and internal-error codes are not automatically defects. For example, usage-route required fields still use `INVALID_INPUT`; that alone does not justify a new `USAGE_*` taxonomy.

Two concrete follow-up gaps were identified at the baseline and are addressed by this implementation:

1. Backend Vitest and TypeScript resolve `@insforge/shared-schemas` through source aliases (`backend/vitest.config.ts:11`, `backend/tsconfig.json:10`). Existing passing backend tests cannot prove that the distributed JavaScript and declarations expose the contract.
2. Migration guidance formerly at `docs/agent-docs/error-codes.md` was removed with Developer Guides in commit `817df89c` / [PR #1356](https://github.com/InsForge/InsForge/pull/1356). The canonical schema has brief ownership comments, but discoverable contributor guidance should be restored in the current structure.

## Scope and Compatibility Decisions

- Preserve `ERROR_CODES`, `errorCodeSchema`, and inferred `ErrorCode`, including the existing Zod enum representation. Do not introduce a second enum, mirrored list, or compatibility shim without demonstrated need.
- Preserve all current code strings, statuses, messages, and response envelopes. HTTP errors use `{ error, message, statusCode, nextActions? }`; the machine code is in `error` (`backend/src/utils/response.ts`). Cloud inputs and realtime payloads have their own shapes.
- Keep `NEXT_ACTIONS` backend-local in `backend/src/utils/next-actions.ts`.
- Keep provider-native codes separate: PostgreSQL SQLSTATE, S3 XML codes, Axios cancellation codes, and cloud `quota_exceeded` are not canonical InsForge codes. Preserve existing translation and unknown-code fallbacks.
- Preserve compute's `errorCodeSchema.safeParse` handling in `backend/src/services/compute/services.service.ts` and Vercel quota translation in `backend/src/providers/deployments/vercel.provider.ts`.
- Do not globally narrow `AppError.code`, `ErrorResponseDetails.code`, or HTTP response types from `string` in this work. That is separate hardening requiring its own boundary audit.
- No package publication, downstream repository edits, issue claiming, or issue closure is needed for this fork implementation. Follow the issue-assignment workflow before an upstream contribution.

## Task 1: Reconfirm the Baseline and Existing Regressions

**Files to inspect:**

- `packages/shared-schemas/src/error-codes.schema.ts`
- `packages/shared-schemas/src/index.ts`
- `backend/tests/unit/shared-error-codes.test.ts`
- `backend/tests/unit/compute/services-service.test.ts`
- `backend/src/services/compute/services.service.ts`
- `backend/src/providers/deployments/vercel.provider.ts`

- [x] Fetch the intended implementation base and compare it with the recorded SHA and prior migrations. Recheck issue state, assignment, and related PRs before beginning new upstream work.
- [x] Search backend, packages, and frontend for local definitions, obsolete imports, literal error codes, and shared-code consumers. Classify provider protocol values separately rather than replacing every occurrence of `code`.
- [x] Run the existing focused regressions:

```bash
npm --workspace insforge-backend test -- tests/unit/shared-error-codes.test.ts tests/unit/compute/services-service.test.ts tests/unit/vercel-cloud-credentials-error.test.ts
```

**Expected:** Package-root imports resolve in the existing test environment; compute quota errors retain their shared code, HTTP 403 and message; Vercel cloud quota translation remains intact.

- [x] If useful, extend `backend/tests/unit/shared-error-codes.test.ts` with an explicit `COMPUTE_QUOTA_EXCEEDED === 'COMPUTE_QUOTA_EXCEEDED'` stability assertion. Do not duplicate the service regression already present.
- [x] Record any confirmed domain gap with its emitting path, observed payload, consumer need, proposed code, and compatibility effect. If none is found, leave the schema and runtime behavior unchanged.

## Task 2: Verify the Distributed Package Surface

**Files:**

- Create: `packages/shared-schemas/scripts/check-package-exports.mjs`
- Create: `packages/shared-schemas/tests/package-consumer/error-codes.mts`
- Modify: `packages/shared-schemas/package.json` with a narrowly named `test:package` script
- Modify: `.github/workflows/unit-tests.yml` to run that script after dependency installation

Use a small Node assertion/fixture check; a new test framework is unnecessary. Keep the fixture outside `src` so it does not become a public package export.

- [x] Build `@insforge/shared-schemas`, then pack it into a temporary directory. Inspect the actual `npm pack --json` manifest for `dist/index.js`, `dist/index.d.ts`, and the generated error-code module/declarations.
- [x] Install the resulting tarball in an isolated temporary ESM consumer, outside the workspace's source-alias configuration. Resolve the package by `@insforge/shared-schemas`, not by a direct `src` or `dist` filename. Include normal package dependencies such as Zod.
- [x] At runtime, import `ERROR_CODES` and `errorCodeSchema`; assert the quota literal is stable, known values parse, and an unknown code is rejected.
- [x] Copy the consumer fixture into that temporary consumer, then invoke the repository TypeScript compiler with that directory as its working directory and `--noEmit --strict --module NodeNext --moduleResolution NodeNext`. Do not load a repository tsconfig or use `paths`/`baseUrl`; compiling the original fixture in the workspace would defeat isolation. Import `ErrorCode` with `import type`, accept the quota literal, and use `@ts-expect-error` for an invalid literal so the check fails if the type becomes unrestricted.
- [x] Clean temporary artifacts on success and failure. Keep lockfiles, tarballs, build output, and installed dependencies out of the committed diff. Fail clearly on missing exports or declarations.
- [x] Wire the command into the existing unit-test workflow; the package currently has no `test` script, so do not assume the root Turbo test task already covers it.

**Result:** `npm --workspace @insforge/shared-schemas run test:package` proves both runtime and type imports through an installed tarball and is wired into CI. This verifies the package surface, not downstream product behavior.

## Task 3: Restore Discoverable Contributor Guidance

**Files:**

- Modify: `CONTRIBUTING.md`
- Create: `.agents/docs/error-codes.md`

- [x] Add a concise shared-error-code contribution section in `CONTRIBUTING.md`, linking to the agent reference. Follow existing Markdown headings and relative-link conventions.
- [x] Explain canonical ownership, root imports, `ErrorCode` type imports, `errorCodeSchema.safeParse` at untrusted boundaries, stable uppercase strings, and when a domain-specific code improves consumer handling.
- [x] Describe the current HTTP envelope, provider translation boundaries, generic fallbacks, and backend-local `NEXT_ACTIONS`.
- [x] Include the existing quota example and exact focused/package test commands. Require a regression test for new behavior and an explicit compatibility note for changed response codes.
- [x] Explain that adding a new constant is different from changing the code emitted by an existing endpoint; retaining a generic constant does not make an endpoint's changed response backward compatible.
- [x] Keep the implementation plan under `.internal/docs/plans/`. Do not recreate the removed public `docs/agent-docs` tree or add internal planning material to Mintlify navigation.

**Expected:** Contributors can find the convention from `CONTRIBUTING.md`, and agents can read it under `.agents/docs/`, consistent with `.internal/docs/README.md`.

## Task 4: Establish Release Evidence and Downstream Handoffs

**Files to inspect:** `packages/shared-schemas/package.json`, `package-lock.json`, and actual SDK/CLI/MCP dependency manifests when accessible.

Issue #1266 requires a single package-level source consumers can import or generate from. Adoption by every downstream product is useful release coordination, not an additional acceptance requirement. Inaccessible adoption evidence alone must not block maintainers from resolving the original issue.

- [x] Confirm the published package version that first contains the required root exports and quota code. The checkout says `1.2.0`, and a read-only `npm view @insforge/shared-schemas@1.2.0 version exports --json` check confirmed that registry metadata exists with the ESM runtime/type export map. This does not verify tarball contents, the first compatible release, or downstream adoption.
- [x] Inventory SDK, CLI, and MCP repositories and owners from project evidence. Record each dependency version, import/translation path, verification command, and result. Use `not verified` for inaccessible repositories or unavailable release evidence.
- [x] Check downstream handling of existing codes and unknown future codes without assuming all consumers use Node ESM or this repository's compiler configuration.
- [x] If an implementation change requires a package release, follow the maintainer's versioning process and update the lockfile only as needed. Coordinate release before downstream dependency updates; do not invent a version bump or publish from a planning task.
- [x] If all original acceptance criteria are satisfied by the available shared package and backend evidence, present the evidence to maintainers for issue resolution. Otherwise create a bounded follow-up handoff for each verified gap.

**Expected:** A downstream evidence table clearly separates package availability, installed-artifact verification, and each product's actual adoption. No unsupported claim that local tests cover external SDK/CLI/MCP repositories.

## Task 5: Validate and Deliver the Implementation

Read the canonical `.agents/skills/insforge-dev/SKILL.md` and narrow `shared-schemas`, `backend`, and `e2e-testing` skills again if they have changed. Preserve route → service → provider/infra boundaries, ESM `.js` specifiers, precise types, and the existing response format. Do not use TypeScript `any`.

- [x] Run focused regressions and the new installed-package check first.
- [x] Run required package validation:

```bash
npm --workspace @insforge/shared-schemas run build
npm --workspace insforge-backend exec -- tsc --noEmit
npm --workspace @insforge/dashboard run typecheck
```

- [x] Run required root pre-PR checks:

```bash
npx turbo run typecheck
npx turbo run lint
npx turbo run test
npx turbo run build
git diff --check
```

Build is required for the proposed packaging/script/CI follow-up and any schema/export changes. Fix failures in touched files. If unrelated baseline lint debt remains, scope checks as the parent skill instructs and document it precisely.

- [ ] Inspect current deterministic fixture coverage in `InsForge/agent-e2e` (blocked: repository returns 404 for the connected account). A docs-only change needs no fixture edits; changed API behavior needs appropriate fixture coverage. Backend shell E2E and Vitest are distinct from this cross-repository gate.
- [ ] Before an upstream OSS implementation PR, follow the `e2e-testing` skill: build a test image, then dispatch the deterministic fixture workflow. At this baseline, root version `2.3.5` yields `v2.3.6-issue-1266`; recompute from `package.json` if the version changes.

```bash
gh workflow run "Build and Push Docker Image" --repo InsForge/InsForge --ref <implementation-branch> -f test_tag=<computed-tag>
# Wait for the matching image build to succeed before the next command.
gh workflow run "Deterministic Fixture E2E" --repo InsForge/agent-e2e --ref main -f insforge_tag=<computed-tag>
```

If fixture changes are needed, use the fixture branch and linked companion PR instead of `main`. Follow the skill's failure triage; record run URLs and actual results. Do not claim this gate passed when access or runtime prerequisites are unavailable.

- [x] Deliver a focused draft PR using the repository template (`Summary`, `How did you test this change?`), a conventional commit, and the appropriate branch prefix. Link the upstream issue. Separate measured results from pending release/downstream work.

## Repository Standards Review

| Standard | How this plan follows it |
| --- | --- |
| `.internal/docs/README.md` | Plan is internal; contributor/agent guidance uses its designated locations |
| `CONTRIBUTING.md` | Issue-linked, focused work; conventional commits; draft PR and documented validation |
| `.github/PULL_REQUEST_TEMPLATE.md` | Current and future PR descriptions use the two required headings |
| `.github/copilot-instructions.md` | Shared contracts, precise TypeScript, existing layer and naming conventions |
| `.agents/skills/insforge-dev/shared-schemas/SKILL.md` | Canonical package ownership, public export stability, downstream boundaries |
| `.agents/skills/insforge-dev/backend/SKILL.md` | Existing middleware and response semantics; regression tests for behavior |
| `.agents/skills/insforge-dev/SKILL.md` | Local pre-PR checks and explicit validation limitations |
| `.agents/skills/insforge-dev/e2e-testing/SKILL.md` | Full deterministic gate recorded for the future upstream OSS implementation PR |

This implementation is delivered in the existing draft PR against the user's fork. It does not claim or close the upstream issue, publish the shared package, or submit an upstream PR. Remote image publication and deterministic E2E remain blocked: the connected account has read-only access (`push: false`) to `InsForge/InsForge`, the implementation branch exists only in the fork, and `InsForge/agent-e2e` returns 404. No remote workflow was dispatched, and no gate success is claimed. An authorized upstream maintainer must complete the gate before upstream submission. Markdown is ignored by `.prettierignore`, so link/path review and `git diff --check` provide meaningful document validation.

## Completion Criteria

- [x] Existing migration is preserved, with no duplicate canonical definitions or avoidable wire changes.
- [x] Published package runtime and declaration imports are covered by an installed-artifact check in CI.
- [x] Contributor convention guidance is discoverable and matches current source behavior.
- [x] Existing shared-code, compute quota, and provider quota regressions pass.
- [x] Required local checks and the blocked upstream gate have explicit outcomes; no upstream gate success is claimed.
- [x] Shared-package release availability is verified; SDK/CLI/MCP adoption status and any owner handoffs are recorded separately without expanding the original acceptance criteria.
- [x] Maintainers receive an acceptance-criterion evidence summary and can decide whether #1266 is complete.


## Implementation Evidence

### Package and regression checks

`packages/shared-schemas/scripts/check-package-exports.mjs` builds and packs the actual package, checks the manifest for the four runtime/declaration entry files, installs the tarball and its dependencies in a temporary ESM consumer outside the workspace, copies the type fixture there, and validates both TypeScript and Node runtime imports. It uses the existing repository compiler, requires no new dependency or test framework, suppresses install lifecycle scripts, and cleans temporary files in `finally`.

The script is exposed as `npm --workspace @insforge/shared-schemas run test:package` and runs in `.github/workflows/unit-tests.yml`. The manifest comes from the real pack operation rather than a separate dry run, so it describes the artifact actually installed. `backend/tests/unit/shared-error-codes.test.ts` now explicitly pins the quota code's string value. No canonical schema values or API runtime behavior changed.

The positive installed-package smoke check passed. Controlled copies of the package with the root error-code export removed and with `ErrorCode` widened to `string` were both rejected by the check. These negative controls do not modify the working source. Independent subagent review found no actionable packaging/isolation issues.

### Contributor guidance

`CONTRIBUTING.md` now links to `.agents/docs/error-codes.md`, which documents shared ownership/imports, stable strings, the HTTP `error` field, provider boundaries/fallbacks, backend-local `NEXT_ACTIONS`, compatibility decisions, and the exact validation commands. The guidance and relative links were independently reviewed.

### Published release evidence

Read-only npm metadata and SHA-512 integrity-verified tarballs establish the stable release boundary:

| Version | Published date (UTC) | Root runtime/type error exports and compute quota code |
| --- | --- | --- |
| `1.1.49` | 2026-04-15 | Absent |
| `1.1.52` | 2026-05-06 | Absent |
| `1.1.53` | 2026-05-22 | Present |
| `1.2.0` | 2026-07-15 | Present |
| `1.2.1` | 2026-07-27 | Present |

The first verified stable release containing the contract is `1.1.53` (`gitHead` `efec0825a6209f178f3b544be80e9bc7ed169980`); its immediate stable predecessor lacks it. The checkout's `1.2.0` release has `gitHead` `fa1d00b42ebcccf3807d8f29f4848514a36d931a`. Its registry integrity is `sha512-qUYNXkCKVPTKXC/jWtG+FEgH/NFY0d2EnEgjYj8vu+R6wezGpKXP8T0rSMtoavgXo1ZcOTCR8+pQJBWJSR9BvA==`.

Published tarballs were structurally inspected, not executed; the installed-artifact execution check covers the local package. No public exports or runtime files change in this PR, so no release/version bump or lockfile update is needed.

### Downstream source inventory and handoffs

All three repositories below belong to the InsForge organization. Individual release owners were not inferred. Findings are pinned source observations; external test suites were not run.

| Consumer/source snapshot | Source version and schemas dependency | Verified source handling | Handoff |
| --- | --- | --- | --- |
| [SDK](https://github.com/InsForge/InsForge-sdk-js/tree/e2e0251980cf2d923d3b346b6910034753b39263) | `1.5.2`; `^1.2.1`, locked `1.2.1` | Imports shared codes/types; permits future strings via `ErrorCode \| (string & {})`; preserves structured fields in `src/types.ts` and `src/lib/http-client.ts` | Retain shared imports and open-string compatibility |
| [CLI](https://github.com/InsForge/CLI/tree/40182fd30a929112e79913ea7d58b39355413e91) | `0.2.8`; `^1.1.58`, locked `1.1.58` | `src/lib/api/oss.ts` forwards backend error/status/guidance; `src/lib/errors.ts` accepts arbitrary optional string codes; no shared `ERROR_CODES` import found | Optionally adopt shared constants for canonical comparisons; preserve CLI-local/transport codes |
| [MCP](https://github.com/InsForge/insforge-mcp/tree/52585ec29407b328b0f562944d36479203c5489e) | Source `1.2.12`; exact/locked `1.1.49` | Pinned schemas lack error exports; `src/shared/response-handler.ts` reduces failures to `Error(message)` and reads singular `nextAction` | MCP maintainers: upgrade schemas, preserve code/status, align `nextActions`, and add known/unknown-code regressions |

Source snapshots differ from published consumer releases: npm SDK `1.5.2` has `gitHead` `1da68e659de5accf972ce3ccf5c07228f21d9471`, CLI `0.2.8` has `f47bae26c28b5c74b05cc8f09feb4f4d97927c59`, and MCP's latest published `1.2.11` has `0fe44764676bd67bca962c1684b2d68b1f929386` and also pins schemas `1.1.49`. Do not infer published product behavior from the source snapshots. These are bounded owner handoffs, not extra acceptance requirements for #1266; no downstream code was changed or message posted.

### Local validation

Final local results:

- `npx turbo run typecheck`: passed across all workspaces.
- `npx turbo run build`: passed.
- `npx turbo run lint`: passed with five existing backend warnings and no errors; changed code also passes scoped ESLint.
- `npx turbo run test`: passed, with 2,479 backend, 302 dashboard, and 27 UI tests passing; 21 backend integration tests skipped.
- Focused shared-code/compute/provider regressions: 132 tests passed.
- Installed-package smoke: passed; both missing-root-export and widened-type negative controls failed as expected, with temporary consumers cleaned up.
- Changed-code Prettier checks, contributor-reference relative links, `scripts/sync-skills.sh --check`, and `git diff --check`: passed.

The package check is wired into CI; this record does not claim a remote workflow result. The upstream issue was rechecked and remains open/unassigned; the fork's implementation base is unchanged. The existing canonical exports, absence of a backend-local enum, domain coverage, quota propagation, and available published package satisfy the original code/source requirements. The PR adds ongoing artifact regression coverage and restores the missing maintainer convention. Upstream E2E and issue resolution remain the explicit access/maintainer handoffs above.
