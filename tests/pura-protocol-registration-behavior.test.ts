import { afterEach, describe, expect, it, vi } from 'vitest';
const electron = vi.hoisted(() => ({
  isPackaged: false,
  setAsDefaultProtocolClient: vi.fn(() => true),
  isDefaultProtocolClient: vi.fn(() => true),
}));
vi.mock('electron', () => ({ app: electron }));
vi.mock('../src/main/utils/logger', () => ({ log: vi.fn(), logWarn: vi.fn() }));
import {
  registerAidenCustomProtocol,
  isAidenCustomProtocolRegistered,
} from '../src/main/pura/pura-protocol-registration';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  electron.isPackaged = false;
});

describe('platform-specific OAuth handler registration', () => {
  it('never claims a macOS handler from a shared development Electron binary', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    expect(registerAidenCustomProtocol()).toBe(false);
    expect(isAidenCustomProtocolRegistered()).toBe(false);
    expect(electron.setAsDefaultProtocolClient).not.toHaveBeenCalled();
    expect(electron.isDefaultProtocolClient).not.toHaveBeenCalled();
  });

  it('lets the packaged macOS app own its declared callback scheme', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    vi.spyOn(process, 'execPath', 'get').mockReturnValue(
      '/Applications/Aiden.app/Contents/MacOS/Aiden'
    );
    electron.isPackaged = true;
    expect(registerAidenCustomProtocol()).toBe(true);
    expect(electron.setAsDefaultProtocolClient).toHaveBeenCalledWith('com.puradigital.aiden');
  });
});
