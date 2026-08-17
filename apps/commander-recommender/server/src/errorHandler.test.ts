import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { errorHandler } from './errorHandler';

function mockRes(): Response {
  const res = {
    headersSent: false,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

describe('errorHandler', () => {
  it('logs the error and responds with a generic 500 JSON body', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    const next = vi.fn();

    errorHandler(new Error('scoring blew up'), {} as never, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Something went wrong on the server. Please try again.',
    });
    expect(next).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('never echoes the underlying error message to the client', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    errorHandler(new Error('/etc/passwd stack trace details'), {} as never, res, vi.fn());
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(JSON.stringify(body)).not.toContain('/etc/passwd');
    vi.restoreAllMocks();
  });

  it('delegates to next(err) instead of writing a second response once headers are sent', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    (res as unknown as { headersSent: boolean }).headersSent = true;
    const next = vi.fn();

    const err = new Error('mid-stream failure');
    errorHandler(err, {} as never, res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
