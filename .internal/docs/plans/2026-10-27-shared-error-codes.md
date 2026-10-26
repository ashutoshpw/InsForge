# Shared Error Codes: Issue #1266 Completion Plan

**Goal:** Finish the verification and contributor guidance needed for [InsForge/InsForge#1266](https://github.com/InsForge/InsForge/issues/1266), preserving the canonical shared contract and current API behavior.

**Status:** Proposed plan. This PR changes documentation only; unchecked tasks below are future work.

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

Two concrete follow-up gaps remain:

1. Backend Vitest and TypeScript resolve `@insforge/shared-schemas` through source aliases (`backend/vitest.config.ts:11`, `backend/tsconfig.json:10`). Existing passing backend tests cannot prove that the distributed JavaScript and declarations expose the contract.
2. Migration guidance formerly at `docs/agent-docs/error-codes.md` was removed with Developer Guides in commit `817df89c` / [PR #1356](https://github.com/InsForge/InsForge/pull/1356). The canonical schema has brief ownership comments, but discoverable contributor guidance should be restored in the current structure.

## Scope and Compatibility Decisions

- Preserve `ERROR_CODES`, `errorCodeSchema`, and inferred `ErrorCode`, including the existing Zod enum representation. Do not introduce a second enum, mirrored list, or compatibility shim without demonstrated need.
- Preserve all current code strings, statuses, messages, and response envelopes. HTTP errors use `{ error, message, statusCode, nextActions? }`; the machine code is in `error` (`backend/src/utils/response.ts`). Cloud inputs and realtime payloads have their own shapes.
- Keep `NEXT_ACTIONS` backend-local in `backend/src/utils/next-actions.ts`.
- Keep provider-native codes separate: PostgreSQL SQLSTATE, S3 XML codes, Axios cancellation codes, and cloud `quota_exceeded` are not canonical InsForge codes. Preserve existing translation and unknown-code fallbacks.
- Preserve compute's `errorCodeSchema.safeParse` handling in `backend/src/services/compute/services.service.ts` and Vercel quota translation in `backend/src/providers/deployments/vercel.provider.ts`.
- Do not globally narrow `AppError.code`, `ErrorResponseDetails.code`, or HTTP response types from `string` in this work. That is separate hardening requiring its own boundary audit.
- Do not publish packages, edit downstream repositories, claim the issue, or close it as part of this plan PR. The future implementation owner follows the issue-assignment workflow before an upstream contribution.

## Task 1: Reconfirm the Baseline and Existing Regressions

**Files to inspect:**

- `packages/shared-schemas/src/error-codes.schema.ts`
- `packages/shared-schemas/src/index.ts`
- `backend/tests/unit/shared-error-codes.test.ts`
- `backend/tests/unit/compute/services-service.test.ts`
- `backend/src/services/compute/services.service.ts`
- `backend/src/providers/deployments/vercel.provider.ts`

- [ ] Fetch the intended implementation base and compare it with the recorded SHA and prior migrations. Recheck issue state, assignment, and related PRs before beginning new upstream work.
- [ ] Search backend, packages, and frontend for local definitions, obsolete imports, literal error codes, and shared-code consumers. Classify provider protocol values separately rather than replacing every occurrence of `code`.
- [ ] Run the existing focused regressions:

```bash
npm --workspace insforge-backend test -- tests/unit/shared-error-codes.test.ts tests/unit/compute/services-service.test.ts tests/unit/vercel-cloud-credentials-error.test.ts
```

**Expected:** Package-root imports resolve in the existing test environment; compute quota errors retain their shared code, HTTP 403 and message; Vercel cloud quota translation remains intact.

- [ ] If useful, extend `backend/tests/unit/shared-error-codes.test.ts` with an explicit `COMPUTE_QUOTA_EXCEEDED === 'COMPUTE_QUOTA_EXCEEDED'` stability assertion. Do not duplicate the service regression already present.
- [ ] Record any confirmed domain gap with its emitting path, observed payload, consumer need, proposed code, and compatibility effect. If none is found, leave the schema and runtime behavior unchanged.

## Task 2: Verify the Distributed Package Surface

**Proposed files:**

- Create: `packages/shared-schemas/scripts/check-package-exports.mjs`
- Create: `packages/shared-schemas/tests/package-consumer/error-codes.mts`
- Modify: `packages/shared-schemas/package.json` with a narrowly named `test:package` script
- Modify: `.github/workflows/unit-tests.yml` to run that script after dependency installation

Use a small Node assertion/fixture check; a new test framework is unnecessary. Keep the fixture outside `src` so it does not become a public package export.

- [ ] Build `@insforge/shared-schemas`, then pack it into a temporary directory. Inspect `npm pack --dry-run --json` for `dist/index.js`, `dist/index.d.ts`, and the generated error-code module/declarations.
- [ ] Install the resulting tarball in an isolated temporary ESM consumer, outside the workspace's source-alias configuration. Resolve the package by `@insforge/shared-schemas`, not by a direct `src` or `dist` filename. Include normal package dependencies such as Zod.
- [ ] At runtime, import `ERROR_CODES` and `errorCodeSchema`; assert the quota literal is stable, known values parse, and an unknown code is rejected.
- [ ] Copy the consumer fixture into that temporary consumer, then invoke the repository TypeScript compiler with that directory as its working directory and `--noEmit --strict --module NodeNext --moduleResolution NodeNext`. Do not load a repository tsconfig or use `paths`/`baseUrl`; compiling the original fixture in the workspace would defeat isolation. Import `ErrorCode` with `import type`, accept the quota literal, and use `@ts-expect-error` for an invalid literal so the check fails if the type becomes unrestricted.
- [ ] Clean temporary artifacts on success and failure. Keep lockfiles, tarballs, build output, and installed dependencies out of the committed diff. Fail clearly on missing exports or declarations.
- [ ] Wire the command into the existing unit-test workflow; the package currently has no `test` script, so do not assume the root Turbo test task already covers it.

**Expected:** `npm --workspace @insforge/shared-schemas run test:package` proves both runtime and type imports through an installed tarball and is exercised by CI. This verifies the package surface, not downstream product behavior.

## Task 3: Restore Discoverable Contributor Guidance

**Files:**

- Modify: `CONTRIBUTING.md`
- Create: `.agents/docs/error-codes.md`

- [ ] Add a concise shared-error-code contribution section in `CONTRIBUTING.md`, linking to the agent reference. Follow existing Markdown headings and relative-link conventions.
- [ ] Explain canonical ownership, root imports, `ErrorCode` type imports, `errorCodeSchema.safeParse` at untrusted boundaries, stable uppercase strings, and when a domain-specific code improves consumer handling.
- [ ] Describe the current HTTP envelope, provider translation boundaries, generic fallbacks, and backend-local `NEXT_ACTIONS`.
- [ ] Include the existing quota example and exact focused/package test commands. Require a regression test for new behavior and an explicit compatibility note for changed response codes.
- [ ] Explain that adding a new constant is different from changing the code emitted by an existing endpoint; retaining a generic constant does not make an endpoint's changed response backward compatible.
- [ ] Keep the implementation plan under `.internal/docs/plans/`. Do not recreate the removed public `docs/agent-docs` tree or add internal planning material to Mintlify navigation.

**Expected:** Contributors can find the convention from `CONTRIBUTING.md`, and agents can read it under `.agents/docs/`, consistent with `.internal/docs/README.md`.

## Task 4: Establish Release Evidence and Downstream Handoffs

**Files to inspect:** `packages/shared-schemas/package.json`, `package-lock.json`, and actual SDK/CLI/MCP dependency manifests when accessible.

Issue #1266 requires a single package-level source consumers can import or generate from. Adoption by every downstream product is useful release coordination, not an additional acceptance requirement. Inaccessible adoption evidence alone must not block maintainers from resolving the original issue.

- [ ] Confirm the published package version that first contains the required root exports and quota code. The checkout says `1.2.0`, and a read-only `npm view @insforge/shared-schemas@1.2.0 version exports --json` check confirmed that registry metadata exists with the ESM runtime/type export map. This does not verify tarball contents, the first compatible release, or downstream adoption.
- [ ] Inventory SDK, CLI, and MCP repositories and owners from project evidence. Record each dependency version, import/translation path, verification command, and result. Use `not verified` for inaccessible repositories or unavailable release evidence.
- [ ] Check downstream handling of existing codes and unknown future codes without assuming all consumers use Node ESM or this repository's compiler configuration.
- [ ] If an implementation change requires a package release, follow the maintainer's versioning process and update the lockfile only as needed. Coordinate release before downstream dependency updates; do not invent a version bump or publish from a planning task.
- [ ] If all original acceptance criteria are satisfied by the available shared package and backend evidence, present the evidence to maintainers for issue resolution. Otherwise create a bounded follow-up handoff for each verified gap.

**Expected:** A downstream evidence table clearly separates package availability, installed-artifact verification, and each product's actual adoption. No unsupported claim that local tests cover external SDK/CLI/MCP repositories.

## Task 5: Validate and Deliver the Implementation Follow-up

Read the canonical `.agents/skills/insforge-dev/SKILL.md` and narrow `shared-schemas`, `backend`, and `e2e-testing` skills again if they have changed. Preserve route → service → provider/infra boundaries, ESM `.js` specifiers, precise types, and the existing response format. Do not use TypeScript `any`.

- [ ] Run focused regressions and the new installed-package check first.
- [ ] Run required package validation:

```bash
npm --workspace @insforge/shared-schemas run build
npm --workspace insforge-backend exec -- tsc --noEmit
npm --workspace @insforge/dashboard run typecheck
```

- [ ] Run required root pre-PR checks:

```bash
npx turbo run typecheck
npx turbo run lint
npx turbo run test
npx turbo run build
git diff --check
```

Build is required for the proposed packaging/script/CI follow-up and any schema/export changes. Fix failures in touched files. If unrelated baseline lint debt remains, scope checks as the parent skill instructs and document it precisely.

- [ ] Inspect current deterministic fixture coverage in `InsForge/agent-e2e`. A docs-only change needs no fixture edits; changed API behavior needs appropriate fixture coverage. Backend shell E2E and Vitest are distinct from this cross-repository gate.
- [ ] Before an upstream OSS implementation PR, follow the `e2e-testing` skill: build a test image, then dispatch the deterministic fixture workflow. At this baseline, root version `2.3.5` yields `v2.3.6-issue-1266`; recompute from `package.json` if the version changes.

```bash
gh workflow run "Build and Push Docker Image" --repo InsForge/InsForge --ref <implementation-branch> -f test_tag=<computed-tag>
# Wait for the matching image build to succeed before the next command.
gh workflow run "Deterministic Fixture E2E" --repo InsForge/agent-e2e --ref main -f insforge_tag=<computed-tag>
```

If fixture changes are needed, use the fixture branch and linked companion PR instead of `main`. Follow the skill's failure triage; record run URLs and actual results. Do not claim this gate passed when access or runtime prerequisites are unavailable.

- [ ] Deliver a focused draft PR using the repository template (`Summary`, `How did you test this change?`), a conventional commit, and the appropriate branch prefix. Link the upstream issue. Separate measured results from pending release/downstream work.

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

The current deliverable is a documentation-only draft PR against the user's fork. It does not claim the upstream issue, close it, publish the shared package, or submit an upstream implementation PR. Remote image publication and deterministic E2E dispatch are not performed for this fork planning deliverable; they remain explicit implementation gates above. Markdown is ignored by `.prettierignore`, so link/path review and `git diff --check` provide meaningful document validation.

## Completion Criteria

- [ ] Existing migration is preserved, with no duplicate canonical definitions or avoidable wire changes.
- [ ] Published package runtime and declaration imports are covered by an installed-artifact check in CI.
- [ ] Contributor convention guidance is discoverable and matches current source behavior.
- [ ] Existing shared-code, compute quota, and provider quota regressions pass.
- [ ] Required local and upstream implementation gates have recorded outcomes and links where applicable.
- [ ] Shared-package release availability is verified; SDK/CLI/MCP adoption status and any owner handoffs are recorded separately without expanding the original acceptance criteria.
- [ ] Maintainers receive an acceptance-criterion evidence summary and can decide whether #1266 is complete.
