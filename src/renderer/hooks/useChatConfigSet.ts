import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { useAppConfig } from '../store/selectors';
import { isPuraDigitalActive } from '../../shared/pura-digital';

export function useChatConfigSet(disabled: boolean, isElectron: boolean) {
  const { t } = useTranslation();
  const appConfig = useAppConfig();
  const setGlobalNotice = useAppStore((state) => state.setGlobalNotice);
  const [isSwitchingConfigSet, setIsSwitchingConfigSet] = useState(false);
  const switchingConfigSetRef = useRef(false);
  const configSets = appConfig?.configSets ?? [];
  const activeConfigSet = configSets.find((set) => set.id === appConfig?.activeConfigSetId);

  const mutateConfig = async (setId: string, model?: string): Promise<boolean> => {
    const current = useAppStore.getState().appConfig;
    if (
      !isElectron ||
      disabled ||
      switchingConfigSetRef.current ||
      !current?.configSets.some((set) => set.id === setId) ||
      (model !== undefined && (current.activeConfigSetId !== setId || !model.trim()))
    )
      return false;
    if (setId === current.activeConfigSetId && (model === undefined || model === current.model)) {
      return true;
    }

    switchingConfigSetRef.current = true;
    setIsSwitchingConfigSet(true);
    try {
      const result =
        model === undefined
          ? await window.electronAPI.config.switchSet({ id: setId })
          : await window.electronAPI.config.save({ activeConfigSetId: setId, model });
      if (!result.success) throw new Error('Config update failed');
      const store = useAppStore.getState();
      store.setAppConfig(result.config);
      store.setIsConfigured(Boolean(result.config.isConfigured));
      return true;
    } catch (error) {
      console.error('Failed to update chat API config:', error);
      setGlobalNotice({
        id: 'chat-config-set-switch-error',
        type: 'error',
        message: t('api.saveFailed'),
        messageKey: 'api.saveFailed',
      });
      return false;
    } finally {
      switchingConfigSetRef.current = false;
      setIsSwitchingConfigSet(false);
    }
  };

  const loadModels = useCallback(async (setId: string) => {
    const set = useAppStore.getState().appConfig?.configSets.find((item) => item.id === setId);
    if (!set) throw new Error('Config set not found');
    const profile = set.profiles[set.activeProfileKey];
    if (isPuraDigitalActive(set.provider, set.customProtocol, profile?.baseUrl)) {
      return window.electronAPI.config.listPuraDigitalModels();
    }
    return window.electronAPI.config.listModels({
      provider: set.provider,
      customProtocol: set.customProtocol,
      apiKey: profile?.apiKey || '',
      baseUrl: profile?.baseUrl,
    });
  }, []);

  return {
    isSwitchingConfigSet,
    switchingConfigSetRef,
    configSetSelector: {
      configSets,
      activeConfigSet,
      model: appConfig?.model,
      disabled: disabled || !isElectron || isSwitchingConfigSet,
      onChange: (setId: string) => mutateConfig(setId),
      onModelChange: (setId: string, model: string) => mutateConfig(setId, model),
      loadModels,
    },
  };
}
