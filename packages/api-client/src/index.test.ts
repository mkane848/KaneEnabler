import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithWakeRetry } from './wakeRetry';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchWithWakeRetry', () => {
  it('returns parsed JSON on the first successful GET', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ cards: [] }));
    const result = await fetchWithWakeRetry<{ cards: never[] }>('/api/cards', {
      method: 'GET',
      unreachableMessage: 'still asleep',
    });
    expect(result).toEqual({ cards: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/cards', {
      method: 'GET',
      headers: undefined,
      body: undefined,
    });
  });

  it('POSTs a JSON body with a content-type header', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await fetchWithWakeRetry('/api/recommend', {
      method: 'POST',
      body: { list: 'Sol Ring' },
      unreachableMessage: 'still asleep',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list: 'Sol Ring' }),
    });
  });

  it('retries a connection failure (TypeError) and succeeds once the server wakes', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch')) // asleep on first attempt
      .mockResolvedValueOnce(jsonResponse({ cards: [{ name: 'Sol Ring' }] }));

    const result = await fetchWithWakeRetry<{ cards: { name: string }[] }>('/api/cards', {
      method: 'GET',
      unreachableMessage: 'finally unreachable',
      retryBaseMs: 1,
      retryMaxMs: 1,
    });

    expect(result).toEqual({ cards: [{ name: 'Sol Ring' }] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up with the caller message once the wake budget expires on persistent failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      fetchWithWakeRetry('/api/cards', {
        method: 'GET',
        unreachableMessage: 'finally unreachable',
        wakeBudgetMs: 1,
        retryBaseMs: 1,
        retryMaxMs: 1,
      }),
    ).rejects.toThrow('finally unreachable');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('does not retry an HTTP error — surfaces it immediately', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'boom' }, 400));
    await expect(
      fetchWithWakeRetry('/api/cards', { method: 'GET', unreachableMessage: 'still asleep' }),
    ).rejects.toThrow('boom');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the status code when an HTTP error body carries no message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    await expect(
      fetchWithWakeRetry('/api/cards', { method: 'GET', unreachableMessage: 'still asleep' }),
    ).rejects.toThrow('Request failed with status 500');
  });

  it('tolerates a non-JSON error body, falling back to the status code', async () => {
    fetchMock.mockResolvedValue(new Response('plain text, not json', { status: 502 }));
    await expect(
      fetchWithWakeRetry('/api/cards', { method: 'GET', unreachableMessage: 'still asleep' }),
    ).rejects.toThrow('Request failed with status 502');
  });

  it('uses the caller-provided describeError for the retryAfterSeconds suffix', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'rate limited', retryAfterSeconds: 12 }, 429),
    );
    await expect(
      fetchWithWakeRetry('/api/combos', {
        method: 'POST',
        body: {},
        unreachableMessage: 'still asleep',
        describeError: (payload) => `Dead. Try again in ${payload.retryAfterSeconds}s.`,
      }),
    ).rejects.toThrow('Dead. Try again in 12s.');
  });
});
