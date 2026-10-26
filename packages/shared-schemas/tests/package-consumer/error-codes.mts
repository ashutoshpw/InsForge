import { ERROR_CODES, errorCodeSchema } from '@insforge/shared-schemas';
import type { ErrorCode } from '@insforge/shared-schemas';

const quotaCode: ErrorCode = 'COMPUTE_QUOTA_EXCEEDED';
const quotaLiteral: 'COMPUTE_QUOTA_EXCEEDED' = ERROR_CODES.COMPUTE_QUOTA_EXCEEDED;
const parsedCode: ErrorCode = errorCodeSchema.parse(quotaCode);

// A missing or widened declaration must fail this consumer compilation.
// @ts-expect-error Unknown strings are not canonical InsForge error codes.
const invalidCode: ErrorCode = 'NOT_A_REAL_ERROR_CODE';

void quotaLiteral;
void parsedCode;
void invalidCode;
