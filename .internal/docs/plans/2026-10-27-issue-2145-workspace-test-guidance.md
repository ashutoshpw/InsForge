# Issue #2145: Correct workspace test guidance

**Status:** Proposed; this PR delivers the plan only.

**Issue:** [InsForge/InsForge#2145](https://github.com/InsForge/InsForge/issues/2145)

**Reviewed baseline:** `21ce31dd8fb3b75f2c3237eddff947431cfb4028` on the fork's `main` branch.

**Goal:** Make the development skill accurately describe which workspaces run tests through `npm test`, while preserving the canonical-source and generated-mirror workflow.

## Findings

The Finish Rules bullet in [the canonical skill](../../../.agents/skills/insforge-dev/SKILL.md) currently says all four root checks cover every workspace, including `packages/shared-schemas/`. Root scripts delegate to Turborepo, but a workspace must define the corresponding script for that task to execute there.

| Workspace                  | `lint` | `build` | `typecheck` | `test`       |
| -------------------------- | ------ | ------- | ----------- | ------------ |
| `backend/`                 | Yes    | Yes     | Yes         | `vitest run` |
| `frontend/`                | Yes    | Yes     | Yes         | Not defined  |
| `packages/dashboard/`      | Yes    | Yes     | Yes         | `vitest run` |
| `packages/shared-schemas/` | Yes    | Yes     | Yes         | Not defined  |
| `packages/ui/`             | Yes    | Yes     | Yes         | `vitest run` |

Evidence is in root `package.json`, the five workspace `package.json` files, and `turbo.json`. The test task depends on `^build`; building shared schemas as a dependency does not establish test coverage for that workspace.

`npm test -- --dry=json` confirms three executable test tasks. Turbo also emits `#test` entries with `command: "<NONEXISTENT>"` for the two workspaces without test scripts. Validation must inspect executable commands and distinguish dependency builds, rather than assume those graph entries are absent.

## Approach and scope

Correct the documentation to match existing behavior. Adding a shared-schemas test script would introduce a separate testing requirement and would still leave the blanket claim inaccurate for `frontend/`.

[`scripts/sync-skills.sh`](../../../scripts/sync-skills.sh) identifies `.agents/skills/insforge-dev/` as the single source of truth. It copies the entire skill tree into `.claude/` and `.codex/`; its implementation needs no change. The existing trees are in sync, and `.github/workflows/lint-and-format.yml` already checks for drift.

| File                                   | Eventual implementation change             |
| -------------------------------------- | ------------------------------------------ |
| `.agents/skills/insforge-dev/SKILL.md` | Replace the inaccurate Finish Rules bullet |
| `.claude/skills/insforge-dev/SKILL.md` | Regenerate from canonical source           |
| `.codex/skills/insforge-dev/SKILL.md`  | Regenerate from canonical source           |

Keep package scripts, dependencies, test suites, Turbo configuration, sync logic, and the existing mandatory pre-PR checklist unchanged. The current plan PR adds only this document; implementation will be a separate change.

## Implementation steps

### 1. Reconfirm the baseline

- [ ] Read the root and workspace manifests again before editing, especially if `main` has advanced.
- [ ] Run `scripts/sync-skills.sh --check`; resolve unexpected baseline drift separately.
- [ ] Run `npm test -- --dry=json` and verify that the executable test tasks match the table above.

### 2. Correct the canonical Finish Rules bullet

- [ ] Edit only `.agents/skills/insforge-dev/SKILL.md` initially. Replace the existing blanket coverage bullet with:

> Use repo-level checks like `npm run lint`, `npm run build`, `npm run typecheck`, and `npm test` when the change crosses package boundaries — each is wired through Turborepo (`turbo run <task>`). Lint, build, and typecheck cover every workspace; `npm test` runs tests in `backend/`, `packages/dashboard/`, and `packages/ui/`. `frontend/` and `packages/shared-schemas/` do not currently define a `test` script.

- [ ] Preserve the surrounding Finish Rules and Pre-PR Checklist.

### 3. Regenerate mirrors

- [ ] Run `scripts/sync-skills.sh` from the repository root.
- [ ] Review the full diff. Because the script copies whole directories, stop and investigate unrelated generated changes.
- [ ] Confirm the implementation diff contains only the three `SKILL.md` files listed above, with identical wording changes.

### 4. Validate the correction

- [ ] Run the following from the repository root:

```bash
scripts/sync-skills.sh --check
cmp .agents/skills/insforge-dev/SKILL.md .claude/skills/insforge-dev/SKILL.md
cmp .agents/skills/insforge-dev/SKILL.md .codex/skills/insforge-dev/SKILL.md
npm test -- --dry=json
git diff --check
git diff --stat
```

- [ ] Confirm only `backend/`, `packages/dashboard/`, and `packages/ui/` have executable test commands. Ignore `<NONEXISTENT>` placeholders and dependency build tasks when identifying test execution.
- [ ] Review Markdown readability manually. The repository's `.prettierignore` ignores `*.md`, so a default Prettier check is not evidence that Markdown was formatted. If an explicit check is desired, use a temporary empty ignore file and limit Prettier to the changed files.
- [ ] Run `npx turbo run typecheck`, `npx turbo run lint`, and `npx turbo run test` as required by the development skill. Record actual results. Its build requirement is conditional on routing, configuration, schemas, or cross-package exports changing; none changes here.
- [ ] Do not add tests that duplicate this prose or placeholder test scripts. Existing manifests, the dry task graph, and the synchronization check directly verify the correction.

### 5. Prepare the implementation PR

- [ ] Follow the issue-first assignment process in `CONTRIBUTING.md` before submitting an upstream implementation PR. Issue #2145 was open and unassigned during exploration; the contribution guide also explicitly permits drive-by review with possible tracking labels.
- [ ] Use a `docs/` branch, a Conventional Commit such as `docs(skills): clarify workspace test coverage`, and the PR template's Summary and How did you test this change? sections.
- [ ] For an upstream InsForge OSS submission, follow `.agents/skills/insforge-dev/e2e-testing/SKILL.md`: derive the test tag from the current root version, build the feature image, then run the deterministic fixture workflow in `InsForge/agent-e2e`. Docs-only changes need no fixture edits; this does not exempt that upstream release gate.
- [ ] Report missing upstream workflow access or failed gates accurately before upstream submission. This plan-only fork PR does not claim those workflows were run.
- [ ] Commit the canonical skill and both generated copies together. An implementation PR may close the upstream issue once the correction is present; this plan PR uses a reference only.

## Acceptance criteria

- [ ] The canonical guidance separates root task orchestration from workspace script availability.
- [ ] It names the three workspaces with tests and the two without a test script, matching the manifests at implementation time.
- [ ] Both generated skill trees pass the existing CI synchronization check and match the canonical source byte for byte.
- [ ] No runtime behavior, package scripts, sync implementation, or unrelated guidance changes.
- [ ] The implementation PR reports validation results and any remaining upstream prerequisites without implying the plan itself fixed the issue.

## Exploration and repository standards review

Three independent subagent reviews completed before this plan was drafted:

1. **Task behavior:** inspected all workspace scripts, Turbo dependencies, and a successful dry run; identified the `<NONEXISTENT>` graph entries.
2. **Skill synchronization:** checked the canonical source, both mirrors, sync script, CI drift check, and historical real-copy convention. Baseline sync and byte comparisons passed.
3. **Repository standards:** reviewed contribution rules, the PR template, CI, development and E2E skills, and existing internal plans. Confirmed this document belongs in `.internal/docs/plans/` per `.internal/docs/README.md`.

Follow current manifests and actual paths when examples in older plans or `.github/copilot-instructions.md` are stale. Preserve the existing public-docs navigation contract by keeping this plan outside `docs/`.

The plan-only fork PR targets `ashutoshpw/InsForge:main` from `docs/issue-2145-fix-plan`. It references the upstream issue without claiming closure, assignment, implementation, or upstream release validation.

## Validation of this plan PR

- `npx turbo run typecheck`: passed (8 tasks, all cache hits).
- `npx turbo run lint`: passed (5 tasks; existing warnings in unchanged source files).
- `npx turbo run test`: passed (6 tasks, including 3 cached dependency builds; test tasks execute without caching).
- `npm test -- --dry=json`: passed; executable test workspaces were asserted to be exactly `backend`, `packages/dashboard`, and `packages/ui`.
- `scripts/sync-skills.sh --check`: passed on the unchanged skill trees.
- Explicit Prettier check with a temporary empty ignore file, local Markdown link resolution, and `git diff --check`: passed.
- Separate technical and repository standards reviews of the drafted plan found no blockers.
- No standalone build or upstream image/deterministic E2E workflow was run for this plan-only fork PR. Future implementation and upstream submission checks remain listed above.
