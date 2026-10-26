import { describe, expect, it, vi } from 'vitest';
import { DatabaseError } from 'pg';
import type { Request, Response } from 'express';
import { errorMiddleware } from '@/api/middlewares/error.js';
import { AppError } from '@/utils/errors.js';
import logger from '@/utils/logger.js';
import { ERROR_CODES } from '@insforge/shared-schemas';

vi.mock('@/utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function makeMockRes() {
  const res = {} as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    statusCode?: number;
    body?: unknown;
  };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
}

function makePgError(code: string, message: string): DatabaseError {
  // pg's DatabaseError ctor isn't ergonomic; build a shaped instance.
  const err = new DatabaseError(message, message.length, 'error');
  Object.assign(err, { code });
  return err;
}

describe('errorMiddleware', () => {
  it('translates Postgres 42501 (RLS WITH CHECK denial) into 403 with FORBIDDEN', () => {
    const err = makePgError(
      '42501',
      'new row violates row-level security policy for table "objects"'
    );
    const req = {} as Request;
    const res = makeMockRes();
    const next = vi.fn();

    errorMiddleware(err, req, res, next);

    expect(res.statusCode).toBe(403);
    const body = res.body as { error: string; message: string; nextActions?: string };
    expect(body.error).toBe(ERROR_CODES.FORBIDDEN);
    expect(body.message).toContain('row-level security');
    // The hint should mention RLS so a developer can self-diagnose.
    expect(body.nextActions).toMatch(/row-level security|RLS|policy/i);
  });

  it('still maps 23505 (unique violation) to 409 — regression check', () => {
    const err = makePgError('23505', 'duplicate key value violates unique constraint');
    err.detail = 'Key (key)=(note.txt) already exists.';
    const req = {} as Request;
    const res = makeMockRes();
    const next = vi.fn();

    errorMiddleware(err, req, res, next);

    expect(res.statusCode).toBe(409);
  });

  it('passes AppError through with its declared status', () => {
    const err = new AppError('bad input', 400, ERROR_CODES.INVALID_INPUT);
    const req = {} as Request;
    const res = makeMockRes();
    const next = vi.fn();

    errorMiddleware(err, req, res, next);

    expect(res.statusCode).toBe(400);
    const body = res.body as { error: string; message: string };
    expect(body.error).toBe(ERROR_CODES.INVALID_INPUT);
    expect(body.message).toBe('bad input');
  });

  it('falls back to 500 for unknown errors even when they carry a 4xx status', () => {
    const req = {} as Request;
    const res = makeMockRes();
    const next = vi.fn();

    errorMiddleware({ status: 404, message: 'not found from an unknown source' }, req, res, next);

    expect(res.statusCode).toBe(500);
    const body = res.body as { error: string; message: string };
    expect(body.error).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(body.message).toBe('Internal server error');
  });

  it('falls back to 500 for unrecognized pg codes', () => {
    const err = makePgError('XX000', 'database connection failed for user internal_admin');
    const req = {} as Request;
    const res = makeMockRes();
    const next = vi.fn();

    errorMiddleware(err, req, res, next);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({
      error: ERROR_CODES.INTERNAL_ERROR,
      message: 'Internal server error',
      statusCode: 500,
    });
  });

  it('keeps unexpected error details in server logs and out of the response', () => {
    const err = new Error('connection failed: postgres://admin:secret@internal-db:5432/app');
    const req = {} as Request;
    const res = makeMockRes();
    const next = vi.fn();

    errorMiddleware(err, req, res, next);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: ERROR_CODES.INTERNAL_ERROR,
      message: 'Internal server error',
      statusCode: 500,
      nextActions: undefined,
    });
    expect(logger.error).toHaveBeenCalledWith('Error occurred', {
      error: err.message,
      stack: err.stack,
    });
  });

  it.each([
    { message: 'secret token', statusCode: 403 },
    {},
    'secret token',
    42,
    false,
    null,
    undefined,
  ])('returns a generic 500 for an unrecognized thrown value: %j', (err) => {
    const req = {} as Request;
    const res = makeMockRes();
    const next = vi.fn();

    errorMiddleware(err, req, res, next);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({
      error: ERROR_CODES.INTERNAL_ERROR,
      message: 'Internal server error',
      statusCode: 500,
    });
  });

  it.each([
    new SyntaxError('Unexpected token in JSON'),
    { type: 'entity.parse.failed', status: 400, message: 'Invalid JSON in request body' },
  ])('preserves recognized JSON parsing errors: %j', (err) => {
    const req = {} as Request;
    const res = makeMockRes();
    const next = vi.fn();

    errorMiddleware(err, req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      error: ERROR_CODES.INVALID_INPUT,
      message: err.message,
      statusCode: 400,
      nextActions: 'Please ensure your request body contains valid JSON',
    });
  });
});
