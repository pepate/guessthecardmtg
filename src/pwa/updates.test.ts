import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the registerSW options the module passes, and a fake updateSW.
const h = vi.hoisted(() => ({ opts: null as any, updateSW: vi.fn() }));
vi.mock('virtual:pwa-register', () => ({
  registerSW: (o: any) => { h.opts = o; return h.updateSW; },
}));

beforeEach(() => {
  vi.resetModules();
  h.opts = null;
  h.updateSW.mockReset();
  Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
});

describe('pwa updates', () => {
  it('registers immediately and is not ready until a refresh is needed', async () => {
    const mod = await import('./updates');
    mod.initPwaUpdates();
    expect(h.opts.immediate).toBe(true);
    expect(mod.isUpdateReady()).toBe(false);
    // applyUpdate is a no-op before an update arrives.
    mod.applyUpdate();
    expect(h.updateSW).not.toHaveBeenCalled();
  });

  it('marks ready, notifies listeners, and applies (reloads) on demand', async () => {
    const mod = await import('./updates');
    mod.initPwaUpdates();
    const cb = vi.fn();
    mod.onUpdateReady(cb);
    h.opts.onNeedRefresh();
    expect(mod.isUpdateReady()).toBe(true);
    expect(cb).toHaveBeenCalledOnce();
    mod.applyUpdate();
    expect(h.updateSW).toHaveBeenCalledWith(true);
  });

  it('re-checks for a new service worker on window focus', async () => {
    const mod = await import('./updates');
    mod.initPwaUpdates();
    const registration = { update: vi.fn().mockResolvedValue(undefined) } as unknown as ServiceWorkerRegistration;
    h.opts.onRegisteredSW('sw.js', registration);
    window.dispatchEvent(new Event('focus'));
    expect(registration.update).toHaveBeenCalled();
  });
});
