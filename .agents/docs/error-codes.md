# Shared Error Codes - Contributor Reference

Use this reference when changing InsForge platform errors or consuming the shared error-code contract from backend, dashboard, SDK, CLI, MCP, or other tooling.

## Canonical Contract

[`packages/shared-schemas/src/error-codes.schema.ts`](../../packages/shared-schemas/src/error-codes.schema.ts) owns the canonical codes. Its domain arrays feed one Zod enum, which exports `errorCodeSchema`, the inferred `ErrorCode` type, and the runtime `ERROR_CODES` map. The [package root](../../packages/shared-schemas/src/index.ts) exports all three.

Import from the public package root. Keep uppercase string values stable; do not add a backend-local enum, copy the list into a consumer, or depend on private `src`/`dist` module paths.

```typescript
import { ERROR_CODES, errorCodeSchema } from '@insforge/shared-schemas';
import type { ErrorCode } from '@insforge/shared-schemas';

const quotaCode: ErrorCode = ERROR_CODES.COMPUTE_QUOTA_EXCEEDED;
```

`ERROR_CODES.COMPUTE_QUOTA_EXCEEDED` has the public string value `'COMPUTE_QUOTA_EXCEEDED'`. Use the constant when emitting this known error and the inferred type when a value must be a canonical code.

## HTTP Errors and Backend Guidance

The backend's [`AppError`](../../backend/src/utils/errors.ts) carries `code`, `message`, `statusCode`, and optional `nextActions`. The [error middleware](../../backend/src/api/middlewares/error.ts) sends these through [`errorResponse`](../../backend/src/utils/response.ts). In the HTTP JSON body, the machine-readable code is named `error`:

```json
{
  "error": "COMPUTE_QUOTA_EXCEEDED",
  "message": "Compute quota exceeded",
  "statusCode": 403
}
```

This is an illustrative payload; preserve the actual message and status supplied by the existing flow. The optional `nextActions` field is a string. Keep response envelopes unchanged, including protocol-specific and realtime responses that use different shapes.

[`NEXT_ACTIONS`](../../backend/src/utils/next-actions.ts) is backend-local remediation guidance. Import it from the backend utility when needed; it is not part of the shared error-code package. Keep backend imports consistent with ESM `.js` specifiers, and let existing middleware handle `AppError` rather than adding a new response format.

## Untrusted Codes and Provider Boundaries

Parse incoming codes with `errorCodeSchema.safeParse`; a TypeScript cast does not validate a remote value. Choose a fallback appropriate to the existing operation rather than forwarding an unknown value as a canonical code. For example:

```typescript
function readSharedCode(value: unknown, fallback: ErrorCode): ErrorCode {
  const parsed = errorCodeSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}
```

Follow the surrounding translation policy and preserve existing fallbacks:

- [Compute service handling](../../backend/src/services/compute/services.service.ts) parses a cloud payload's `code`, then the original `AppError.code`, and falls back to `COMPUTE_SERVICE_DEPLOY_FAILED`. It preserves the cloud status and message and joins a cloud `nextActions` array into the HTTP guidance string. Existing creation and update regressions cover `COMPUTE_QUOTA_EXCEEDED` with HTTP 403.
- [Vercel provider handling](../../backend/src/providers/deployments/vercel.provider.ts) translates the cloud's HTTP 403 `quota_exceeded` value to `DEPLOYMENT_QUOTA_EXCEEDED`. The lowercase provider value remains a provider protocol code.
- PostgreSQL SQLSTATE values, S3 XML error codes, and Axios cancellation codes retain their native meanings and existing translation boundaries. Do not replace them simply because a field is named `code`.

`AppError.code` and HTTP error response types currently accept `string`. Validating a shared code at a boundary does not require globally narrowing those types or changing every provider protocol.

## Adding or Changing a Code

1. Search existing codes and emitting paths first. Reuse a suitable shared code; generic values such as `INVALID_INPUT` and `INTERNAL_ERROR` remain valid where they describe the behavior.
2. Add a domain-specific code only when a demonstrated error needs distinct consumer handling. Record the emitting path, current payload, consumer need, and compatibility impact. Add it to the relevant domain array in the canonical schema, keeping root exports aligned.
3. Preserve existing public strings. Adding a constant is additive; changing an endpoint from `INVALID_INPUT` to a new domain code changes observable API behavior even if `INVALID_INPUT` remains exported. Document such changes explicitly, including downstream migration or release coordination where needed.
4. Add regression coverage for new behavior at the relevant service/provider/API layer. Assert the emitted code and preserve associated HTTP status, message, and guidance. Extend shared-code coverage when adding a new canonical value; avoid duplicating an existing service regression.
5. Check consumers across `backend/`, `packages/`, and `frontend/`. For external SDK, CLI, and MCP repositories, record what was verified and what remains a downstream handoff. A local package check does not establish external adoption.

## Validation

Run these commands from the repository root. Focused regressions cover shared-code stability, compute cloud quota propagation, and Vercel cloud quota translation:

```bash
npm --workspace insforge-backend test -- tests/unit/shared-error-codes.test.ts tests/unit/compute/services-service.test.ts tests/unit/vercel-cloud-credentials-error.test.ts
```

Check the distributed runtime and TypeScript surface separately:

```bash
npm --workspace @insforge/shared-schemas run test:package
```

The package check builds and packs the package, installs it in an isolated ESM consumer, and checks runtime and declaration imports through `@insforge/shared-schemas`. Backend Vitest and TypeScript use source aliases, so passing backend tests alone cannot prove that installed package artifacts expose the contract. The package check does not publish a release or validate downstream product behavior.

For a contract change, also run the package checks and repository pre-PR checks required by the canonical [InsForge development skill](../skills/insforge-dev/SKILL.md), [shared-schemas skill](../skills/insforge-dev/shared-schemas/SKILL.md), and [backend skill](../skills/insforge-dev/backend/SKILL.md). Before an upstream OSS implementation PR, follow the [deterministic E2E gate](../skills/insforge-dev/e2e-testing/SKILL.md) and report actual results and limitations.
