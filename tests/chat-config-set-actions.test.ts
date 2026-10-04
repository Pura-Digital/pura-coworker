import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../src/renderer/types';

const mocks = vi.hoisted(() => ({
  state: {
    appConfig: null as AppConfig | null,
    setAppConfig: vi.fn(),
    setIsConfigured: vi.fn(),
    setGlobalNotice: vi.fn(),
  },
  save: vi.fn(),
  switchSet: vi.fn(),
  listModels: vi.fn(),
  listPuraDigitalModels: vi.fn(),
}));
vi.mock('react', () => ({
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => [value, vi.fn()],
  useCallback: (callback: unknown) => callback,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../src/renderer/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
    { getState: () => mocks.state }
  ),
}));
vi.mock('../src/renderer/store/selectors', () => ({ useAppConfig: () => mocks.state.appConfig }));
import { useChatConfigSet } from '../src/renderer/hooks/useChatConfigSet';

describe('chat config set actions', () => {
  beforeEach(() => {
    mocks.state.appConfig = {
      activeConfigSetId: 'work',
      model: 'old-model',
      isConfigured: true,
      configSets: [
        {
          id: 'work',
          name: 'Work',
          provider: 'custom',
          customProtocol: 'openai',
          activeProfileKey: 'custom:openai',
          enableThinking: false,
          updatedAt: '',
          profiles: {
            'custom:openai': {
              apiKey: 'test-key',
              baseUrl: 'https://example.com/v1',
              model: 'old-model',
            },
          },
        },
      ],
    } as AppConfig;
    mocks.state.setAppConfig.mockImplementation((config: AppConfig) => {
      mocks.state.appConfig = config;
    });
    vi.stubGlobal('window', { electronAPI: { config: mocks } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('saves only the chosen model and set, then synchronizes the returned configuration', async () => {
    const updated = { ...mocks.state.appConfig!, model: 'new-model' };
    mocks.save.mockResolvedValue({ success: true, config: updated });
    const hook = useChatConfigSet(false, true);
    expect(await hook.configSetSelector.onModelChange('work', 'new-model')).toBe(true);
    expect(mocks.save).toHaveBeenCalledWith({ activeConfigSetId: 'work', model: 'new-model' });
    expect(mocks.state.setAppConfig).toHaveBeenCalledWith(updated);
    expect(mocks.state.setIsConfigured).toHaveBeenCalledWith(true);
    expect(hook.switchingConfigSetRef.current).toBe(false);
  });

  it('blocks duplicate changes while saving and releases the submit guard afterward', async () => {
    let resolve!: (value: unknown) => void;
    mocks.save.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const hook = useChatConfigSet(false, true);
    const pending = hook.configSetSelector.onModelChange('work', 'new-model');
    expect(hook.switchingConfigSetRef.current).toBe(true);
    expect(await hook.configSetSelector.onModelChange('work', 'other-model')).toBe(false);
    resolve({ success: true, config: mocks.state.appConfig });
    await pending;
    expect(hook.switchingConfigSetRef.current).toBe(false);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous model and reports save failures', async () => {
    mocks.save.mockRejectedValue(new Error('Unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const hook = useChatConfigSet(false, true);
    expect(await hook.configSetSelector.onModelChange('work', 'new-model')).toBe(false);
    expect(mocks.state.appConfig?.model).toBe('old-model');
    expect(mocks.state.setAppConfig).not.toHaveBeenCalled();
    expect(mocks.state.setGlobalNotice).toHaveBeenCalled();
    expect(hook.switchingConfigSetRef.current).toBe(false);
  });

  it('does not save when disabled or when the selected set is no longer active', async () => {
    expect(await useChatConfigSet(true, true).configSetSelector.onModelChange('work', 'new')).toBe(
      false
    );
    const hook = useChatConfigSet(false, true);
    mocks.state.appConfig!.activeConfigSetId = 'another-set';
    expect(await hook.configSetSelector.onModelChange('work', 'new')).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('loads models using the selected set credentials and uses the Pura catalog when applicable', async () => {
    const hook = useChatConfigSet(false, true);
    mocks.listModels.mockResolvedValue([{ id: 'remote-model', name: 'Remote' }]);
    expect(await hook.configSetSelector.loadModels('work')).toEqual([
      { id: 'remote-model', name: 'Remote' },
    ]);
    expect(mocks.listModels).toHaveBeenCalledWith({
      provider: 'custom',
      customProtocol: 'openai',
      apiKey: 'test-key',
      baseUrl: 'https://example.com/v1',
    });
    mocks.state.appConfig!.configSets[0].profiles['custom:openai']!.baseUrl =
      'https://llm.puradigital.it/v1';
    mocks.listPuraDigitalModels.mockResolvedValue([]);
    await hook.configSetSelector.loadModels('work');
    expect(mocks.listPuraDigitalModels).toHaveBeenCalledTimes(1);
    expect(mocks.listModels).toHaveBeenCalledTimes(1);
  });
});
