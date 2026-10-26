import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  seed: {} as Record<string, unknown>,
}));

vi.mock('electron-store', () => {
  class MockStore<T extends Record<string, unknown>> {
    public store: Record<string, unknown>;
    public path = '/tmp/mock-config-store.json';

    constructor(options: { defaults?: Record<string, unknown> }) {
      this.store = {
        ...(options?.defaults || {}),
        ...mocks.seed,
      };
    }

    get<K extends keyof T>(key: K): T[K] {
      return this.store[key as string] as T[K];
    }

    set(key: string | Record<string, unknown>, value?: unknown): void {
      if (typeof key === 'string') {
        this.store[key] = value;
        return;
      }
      this.store = {
        ...this.store,
        ...key,
      };
    }

    clear(): void {
      this.store = {};
    }
  }

  return {
    default: MockStore,
  };
});

import { ConfigStore } from '../src/main/config/config-store';

describe('ConfigStore config sets', () => {
  beforeEach(() => {
    mocks.seed = {};
  });

  it('keeps anonymization isolated per setup and disabled for newly created setups', () => {
    const store = new ConfigStore();
    store.update({ provider: 'custom', customProtocol: 'openai', anonymizationEnabled: true });
    const sourceId = store.getAll().activeConfigSetId;
    expect(store.getAll().anonymizationEnabled).toBe(true);
    const cloned = store.createSet({ name: 'Copy', mode: 'clone' });
    expect(cloned.anonymizationEnabled).toBe(false);
    store.switchSet({ id: sourceId });
    expect(store.getAll().anonymizationEnabled).toBe(true);
    const blank = store.createSet({ name: 'New', mode: 'blank' });
    expect(blank.anonymizationEnabled).toBe(false);
    store.update({ provider: 'ollama', anonymizationEnabled: true });
    expect(store.getAll().anonymizationEnabled).toBe(false);
  });

  it('migrates legacy fields into default config set transparently', () => {
    mocks.seed = {
      provider: 'openai',
      customProtocol: 'openai',
      apiKey: 'sk-legacy-openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5-mini',
      enableThinking: true,
      isConfigured: true,
    };

    const store = new ConfigStore();
    const config = store.getAll();

    expect(config.activeConfigSetId).toBe('default');
    expect(config.configSets.length).toBe(1);
    expect(config.configSets[0].isSystem).toBe(true);
    expect(config.configSets[0].provider).toBe('openai');
    expect(config.provider).toBe('openai');
    expect(config.apiKey).toBe('sk-legacy-openai');
    expect(config.enableThinking).toBe(true);
  });

  it('creates/switches sets without polluting other sets', () => {
    mocks.seed = {
      provider: 'openrouter',
      customProtocol: 'anthropic',
      apiKey: 'sk-openrouter-origin',
      baseUrl: 'https://openrouter.ai/api',
      model: 'anthropic/claude-sonnet-4-6',
      enableThinking: false,
      isConfigured: true,
    };

    const store = new ConfigStore();

    const created = store.createSet({ name: 'Work OpenAI', mode: 'clone' });
    expect(created.configSets.length).toBe(2);
    const newSet = created.configSets.find((set) => set.id !== 'default');
    expect(newSet?.name).toBe('Work OpenAI');
    expect(created.activeConfigSetId).toBe(newSet?.id);

    store.update({ provider: 'openai', apiKey: 'sk-openai-new', model: 'gpt-5-mini' });
    const openaiSetView = store.getAll();
    expect(openaiSetView.provider).toBe('openai');
    expect(openaiSetView.apiKey).toBe('sk-openai-new');

    store.switchSet({ id: 'default' });
    const defaultSetView = store.getAll();
    expect(defaultSetView.provider).toBe('openrouter');
    expect(defaultSetView.apiKey).toBe('sk-openrouter-origin');
  });

  it('guards default set deletion and falls back to default after delete', () => {
    const store = new ConfigStore();
    const created = store.createSet({ name: 'My Set', mode: 'clone' });
    const customSet = created.configSets.find((set) => !set.isSystem);
    expect(customSet).toBeTruthy();

    expect(() => store.deleteSet({ id: 'default' })).toThrowError();

    const renamed = store.renameSet({ id: customSet!.id, name: 'My Renamed Set' });
    const renamedSet = renamed.configSets.find((set) => set.id === customSet!.id);
    expect(renamedSet?.name).toBe('My Renamed Set');

    store.switchSet({ id: customSet!.id });
    const afterDelete = store.deleteSet({ id: customSet!.id });
    expect(afterDelete.activeConfigSetId).toBe('default');
    expect(afterDelete.configSets.length).toBe(1);
  });

  it('creates blank set with default values for current provider/protocol', () => {
    mocks.seed = {
      provider: 'custom',
      customProtocol: 'openai',
      apiKey: 'sk-existing',
      baseUrl: 'https://example.com/v1',
      model: 'custom-model',
      enableThinking: true,
      isConfigured: true,
    };

    const store = new ConfigStore();
    const created = store.createSet({ name: 'Blank Set', mode: 'blank' });
    const blankSet = created.configSets.find((set) => set.id !== 'default');
    expect(blankSet).toBeTruthy();
    expect(blankSet?.provider).toBe('custom');
    expect(blankSet?.customProtocol).toBe('openai');
    expect(blankSet?.enableThinking).toBe(false);
    expect(blankSet?.profiles['custom:openai']?.apiKey).toBe('');
    expect(blankSet?.profiles['custom:openai']?.baseUrl).toBe('https://api.openai.com/v1');
    expect(blankSet?.profiles['custom:openai']?.model).toBe('gpt-5.4');
    expect(created.activeConfigSetId).toBe(blankSet?.id);
    expect(created.provider).toBe('custom');
    expect(created.customProtocol).toBe('openai');
    expect(created.apiKey).toBe('');
  });

  it('allows renaming default set but still blocks deleting it', () => {
    const store = new ConfigStore();
    const renamed = store.renameSet({ id: 'default', name: 'Main Profile' });
    expect(renamed.configSets[0].name).toBe('Main Profile');
    expect(() => store.deleteSet({ id: 'default' })).toThrowError();
  });

  it('creates blank set from gemini provider with gemini defaults intact', () => {
    mocks.seed = {
      provider: 'gemini',
      customProtocol: 'gemini',
      apiKey: 'AIza-existing',
      baseUrl: 'https://generativelanguage.googleapis.com',
      model: 'gemini/gemini-2.5-pro',
      enableThinking: false,
      isConfigured: true,
    };

    const store = new ConfigStore();
    const created = store.createSet({ name: 'Gemini Blank', mode: 'blank' });
    const blankSet = created.configSets.find((set) => set.id !== 'default');

    expect(blankSet?.provider).toBe('gemini');
    expect(blankSet?.profiles.gemini?.apiKey).toBe('');
    expect(blankSet?.profiles.gemini?.baseUrl).toBe('https://generativelanguage.googleapis.com');
    expect(blankSet?.profiles.gemini?.model).toBe('');
  });

  it('persists theme preference across config mutations', () => {
    mocks.seed = {
      theme: 'dark',
      isConfigured: true,
    };

    const store = new ConfigStore();
    expect(store.get('theme')).toBe('dark');

    store.update({ theme: 'system' });
    expect(store.get('theme')).toBe('system');

    const created = store.createSet({ name: 'Theme Carry', mode: 'clone' });
    expect(created.theme).toBe('system');
  });

  it('accepts light theme and falls back to default for invalid theme values', () => {
    mocks.seed = {
      theme: 'light',
      isConfigured: true,
    };

    const lightStore = new ConfigStore();
    expect(lightStore.get('theme')).toBe('light');

    mocks.seed = {
      theme: 'sepia',
      isConfigured: true,
    };

    const invalidStore = new ConfigStore();
    expect(invalidStore.get('theme')).toBe('light');
  });
});

describe('installation onboarding completion', () => {
  beforeEach(() => { mocks.seed = {}; });
  it('starts unfinished on a clean installation', () => {
    expect(new ConfigStore().getAll().onboardingCompleted).toBe(false);
  });
  it('migrates users of an older configured version as completed', () => {
    mocks.seed = { isConfigured: true };
    const store = new ConfigStore();
    expect(store.getAll().onboardingCompleted).toBe(true);
  });
  it('migrates legacy credentials even if the configured flag is stale', () => {
    mocks.seed = { provider: 'openai', apiKey: 'legacy-key', model: 'model', isConfigured: false };
    expect(new ConfigStore().getAll().onboardingCompleted).toBe(true);
  });
  it('preserves completion through settings, provider changes and restarts after an update', () => {
    const store = new ConfigStore();
    store.update({ onboardingCompleted: true });
    store.update({ apiKey: '', isConfigured: false, theme: 'dark', onboardingCompleted: false });
    const alternate = store.createSet({ name: 'Other', mode: 'blank' });
    store.switchSet({ id: alternate.activeConfigSetId });
    mocks.seed = { ...store.getAll() };
    const reopened = new ConfigStore();
    expect(reopened.getAll().onboardingCompleted).toBe(true);
    expect(reopened.getAll().theme).toBe('dark');
  });
});

describe('UI zoom persistence', () => {
  beforeEach(() => { mocks.seed = {}; });

  it.each([0.8, 0.9, 1, 1.1, 1.25, 1.5])('keeps selected display scale %s through confirmation, unrelated saves and restart', (value) => {
    const store = new ConfigStore();
    store.update({ uiZoom: value });
    expect(store.getAll().uiZoom).toBe(value);
    expect(store.get('uiZoom')).toBe(value);
    // A later settings/config save must not run the legacy conversion again.
    store.update({ theme: 'dark' });
    store.update({ memoryEnabled: false });
    expect(store.getAll().uiZoom).toBe(value);
    mocks.seed = { ...store.getAll() };
    const reopened = new ConfigStore();
    expect(reopened.getAll().uiZoom).toBe(value);
    expect(reopened.get('uiZoom')).toBe(value);
  });

  it('converts an old absolute zoom only once', () => {
    mocks.seed = { uiZoom: 0.8 };
    const store = new ConfigStore();
    expect(store.getAll().uiZoom).toBe(0.89);
    expect(store.getAll().uiZoomVersion).toBe(1);
    mocks.seed = { ...store.getAll() };
    expect(new ConfigStore().getAll().uiZoom).toBe(0.89);
  });

  it('does not reinterpret a current 90% choice as legacy browser zoom', () => {
    mocks.seed = { uiZoom: 0.9, uiZoomVersion: 1 };
    expect(new ConfigStore().getAll().uiZoom).toBe(0.9);
  });
});
