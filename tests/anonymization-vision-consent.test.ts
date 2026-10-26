import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ complex: vi.fn() }));
vi.mock('../src/main/anonymization/gateway', async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks');
  return {
    anonymizationContext: new AsyncLocalStorage(),
    getAnonymizationGateway: () => ({ complex: mocks.complex }),
  };
});
import {
  closeVisionConsentBroker,
  createVisionConsentScope,
} from '../src/main/anonymization/vision-consent';

afterEach(() => closeVisionConsentBroker());
describe('per-screen vision consent', () => {
  it('requires a valid chat-bound capability and a fresh decision for new content', async () => {
    mocks.complex.mockResolvedValueOnce('proceed').mockResolvedValueOnce('exclude');
    const scope = await createVisionConsentScope('chat-one');
    const send = (text: string, token = scope.capability.token) =>
      fetch(scope.capability.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: createHash('sha256').update(text).digest('hex') }),
      });
    expect((await send('screen-one', 'invalid')).status).toBe(403);
    expect(mocks.complex).not.toHaveBeenCalled();
    expect(await (await send('screen-one')).json()).toEqual({ allowed: true });
    expect(await (await send('screen-two')).json()).toEqual({ allowed: false });
    expect(mocks.complex.mock.calls[0][0]).toBe('chat-one');
    expect(mocks.complex.mock.calls[0][3]).not.toBe(mocks.complex.mock.calls[1][3]);
    scope.dispose();
    expect((await send('screen-three')).status).toBe(403);
  });
  it('revokes authorization when the parent tool is cancelled', async () => {
    const controller = new AbortController();
    const scope = await createVisionConsentScope('chat', controller.signal);
    controller.abort();
    const response = await fetch(scope.capability.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${scope.capability.token}` },
    });
    expect(response.status).toBe(403);
    expect(mocks.complex).not.toHaveBeenCalled();
    scope.dispose();
  });
});
