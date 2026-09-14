import { useTranslation } from 'react-i18next';
import {
  Key,
  Plug,
  Server,
  Cpu,
  Loader2,
  Edit3,
  CheckCircle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useApiConfigState } from '../../hooks/useApiConfigState';
import { ApiConfigSetManager } from '../ApiConfigSetManager';
import { ProviderLogoBadge, protocolTabToLogoId, providerTabToLogoId } from '../ProviderLogoBadge';
import { CommonProviderSetupsCard, GuidanceInlineHint } from '../ProviderGuidance';
import ApiDiagnosticsPanel from '../ApiDiagnosticsPanel';
import {
  SettingsPage,
  SettingsCard,
  SettingsCardHeader,
  SettingsField,
  SettingsToggle,
  SettingsSegmentedControl,
  SettingsAlert,
  SettingsDisclosure,
  SettingsStickyFooter,
} from './shared';

interface ModelOptionItem {
  id: string;
  name: string;
}

// ==================== API Settings Tab ====================

export function SettingsAPI() {
  const { t } = useTranslation();
  const {
    provider,
    customProtocol,
    apiKey,
    baseUrl,
    model,
    customModel,
    useCustomModel,
    contextWindow,
    maxTokens,
    modelInputPlaceholder,
    modelInputHint,
    presets,
    currentPreset,
    modelOptions,
    isSaving,
    isLoadingConfig,
    error,
    successMessage,
    isRefreshingModels,
    isDiscoveringLocalOllama,
    isDiscoveringPuraModels,
    enableThinking,
    isOllamaMode,
    isPuraMode,
    requiresApiKey,
    protocolGuidanceText,
    protocolGuidanceTone,
    baseUrlGuidanceText,
    commonProviderSetups,
    configSets,
    activeConfigSetId,
    currentConfigSet,
    pendingConfigSetAction,
    pendingConfigSet,
    hasUnsavedChanges,
    isMutatingConfigSet,
    canDeleteCurrentConfigSet,
    setApiKey,
    setBaseUrl,
    setModel,
    setCustomModel,
    setContextWindow,
    setMaxTokens,
    toggleCustomModel,
    setEnableThinking,
    applyCommonProviderSetup,
    changeProvider,
    changeProtocol,
    requestConfigSetSwitch,
    requestCreateBlankConfigSet,
    cancelPendingConfigSetAction,
    saveAndContinuePendingConfigSetAction,
    discardAndContinuePendingConfigSetAction,
    renameConfigSet,
    deleteConfigSet,
    handleSave,
    refreshModelOptions,
    discoverLocalOllama,
    applyPuraDigitalSetup,
    applyCustomModelsSetup,
    discoverPuraDigitalModels,
    diagnosticResult,
    isDiagnosing,
    handleDiagnose,
    handleDeepDiagnose,
    shouldShowOllamaManualModelToggle,
    supportsModelDiscovery,
  } = useApiConfigState();

  if (isLoadingConfig) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
        <span className="ml-2 text-text-secondary">{t('common.loading')}</span>
      </div>
    );
  }

  const activeProviderTab = isPuraMode ? 'pura' : provider === 'ollama' ? 'ollama' : 'custom';

  return (
    <SettingsPage>
      {error && <SettingsAlert variant="error">{error}</SettingsAlert>}
      {successMessage && <SettingsAlert variant="success">{successMessage}</SettingsAlert>}

      <SettingsCard>
        <ApiConfigSetManager
        configSets={configSets}
        activeConfigSetId={activeConfigSetId}
        currentConfigSet={currentConfigSet}
        pendingConfigSetAction={pendingConfigSetAction}
        pendingConfigSet={pendingConfigSet}
        hasUnsavedChanges={hasUnsavedChanges}
        isMutatingConfigSet={isMutatingConfigSet}
        isSaving={isSaving}
        canDeleteCurrentConfigSet={canDeleteCurrentConfigSet}
        onSwitchSet={requestConfigSetSwitch}
        onRequestCreateBlankSet={requestCreateBlankConfigSet}
        onSaveCurrentSet={handleSave}
        onRenameSet={renameConfigSet}
        onDeleteSet={deleteConfigSet}
        onCancelPendingAction={cancelPendingConfigSetAction}
        onSaveAndContinuePendingAction={saveAndContinuePendingConfigSetAction}
        onDiscardAndContinuePendingAction={discardAndContinuePendingConfigSetAction}
        />
      </SettingsCard>

      <SettingsCard>
        <SettingsCardHeader
          title={t('api.sectionProvider')}
          description={t('api.providerDescription')}
          icon={Server}
        />
        <SettingsSegmentedControl
          options={(['pura', 'ollama', 'custom'] as const).map((p) => {
            const isPuraTab = p === 'pura';
            const label = isPuraTab
              ? t('api.puraDigital')
              : p === 'custom'
                ? t('api.moreModels')
                : presets?.[p]?.name || p;
            return {
              value: p,
              label: (
                <span className="inline-flex items-center gap-1.5 justify-center">
                  <ProviderLogoBadge id={providerTabToLogoId(p)} />
                  <span className="truncate">{label}</span>
                </span>
              ),
            };
          })}
          value={activeProviderTab}
          onChange={(p) => {
            if (p === 'pura') applyPuraDigitalSetup();
            else if (p === 'custom') applyCustomModelsSetup();
            else changeProvider(p);
          }}
          disabled={isLoadingConfig}
        />
      </SettingsCard>

      <SettingsCard>
        <SettingsCardHeader title={t('api.sectionConnection')} icon={Key} />
        {provider === 'custom' && !isPuraMode && (
          <SettingsField label={t('api.protocol')} description={t('api.selectProtocol')}>
            <SettingsSegmentedControl
              options={(
                [
                  { id: 'anthropic', label: 'Anthropic' },
                  { id: 'openai', label: 'OpenAI' },
                  { id: 'gemini', label: 'Gemini' },
                ] as const
              ).map((mode) => ({
                value: mode.id,
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <ProviderLogoBadge id={protocolTabToLogoId(mode.id)} />
                    {mode.label}
                  </span>
                ),
              }))}
              value={customProtocol}
              onChange={changeProtocol}
            />
            <GuidanceInlineHint text={protocolGuidanceText} tone={protocolGuidanceTone} />
          </SettingsField>
        )}

        {(provider === 'custom' || provider === 'ollama') && (
          <SettingsField
            label={t('api.baseUrl')}
            description={
              isPuraMode
                ? t('api.puraDigitalUrlHint')
                : provider === 'ollama'
                  ? t('api.enterOllamaUrl')
                  : undefined
            }
          >
            <div className="flex gap-2">
              <input
                id="api-base-url-input"
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                readOnly={isPuraMode}
                className={`input flex-1 ${isPuraMode ? 'opacity-70 cursor-not-allowed' : ''}`}
              />
              {isOllamaMode && (
                <button
                  type="button"
                  onClick={() => void discoverLocalOllama()}
                  disabled={isDiscoveringLocalOllama}
                  className="btn btn-secondary text-xs px-3 whitespace-nowrap"
                >
                  <Plug className="w-3 h-3" />
                  {isDiscoveringLocalOllama
                    ? t('api.discoveringLocalOllama')
                    : t('api.discoverLocalOllama')}
                </button>
              )}
            </div>
            {provider === 'custom' && !isPuraMode && (
              <GuidanceInlineHint text={baseUrlGuidanceText} />
            )}
          </SettingsField>
        )}

        <SettingsField label={t('api.apiKey')} description={t('api.apiKeyDescription')}>
          <input
            id="api-key-input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={currentPreset?.keyPlaceholder || t('api.enterApiKey')}
            className="input"
          />
          {(isPuraMode ? 'platform.puradigital.it' : currentPreset?.keyHint) && (
            <p className="text-xs text-text-muted mt-1">
              {isPuraMode ? 'platform.puradigital.it' : currentPreset?.keyHint}
            </p>
          )}
        </SettingsField>
      </SettingsCard>

      <SettingsCard>
        <SettingsCardHeader
          title={t('api.sectionModel')}
          icon={Cpu}
          action={
            <div className="flex items-center gap-1 flex-wrap justify-end">
            {supportsModelDiscovery && (
              <button
                type="button"
                onClick={() => {
                  void refreshModelOptions();
                }}
                disabled={isRefreshingModels}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors active:scale-95 bg-surface-hover text-text-secondary hover:bg-surface-active disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshingModels ? 'animate-spin' : ''}`} />
                {isRefreshingModels ? t('api.refreshingModels') : t('api.refreshModels')}
              </button>
            )}
            {isPuraMode && (
              <button
                type="button"
                onClick={() => {
                  void discoverPuraDigitalModels();
                }}
                disabled={isDiscoveringPuraModels}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors active:scale-95 bg-accent-muted text-accent hover:bg-accent-muted/80 disabled:opacity-50"
              >
                <Sparkles className={`w-3 h-3 ${isDiscoveringPuraModels ? 'animate-pulse' : ''}`} />
                {isDiscoveringPuraModels
                  ? t('api.discoveringPuraModels')
                  : t('api.discoverPuraModels')}
              </button>
            )}
            {shouldShowOllamaManualModelToggle && (
              <button
                type="button"
                onClick={toggleCustomModel}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors active:scale-95 ${
                  useCustomModel
                    ? 'bg-accent-muted text-accent'
                    : 'border border-border-muted bg-background text-text-secondary hover:bg-surface-hover'
                }`}
              >
                <Edit3 className="w-3 h-3" />
                {isOllamaMode || isPuraMode
                  ? useCustomModel
                    ? t('api.useDetectedModels')
                    : t('api.manualModel')
                  : useCustomModel
                    ? t('api.usePreset')
                    : t('api.custom')}
              </button>
            )}
            </div>
          }
        />
        {useCustomModel ? (
          <input
            id="api-model-input"
            type="text"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            placeholder={modelInputPlaceholder}
            className="input"
          />
        ) : (
          <select
            id="api-model-input"
            value={modelOptions.length ? model : ''}
            onChange={(e) => setModel(e.target.value)}
            className="input appearance-none cursor-pointer"
          >
            {modelOptions.length ? (
              (modelOptions as ModelOptionItem[]).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))
            ) : (
              <option value="" disabled>
                {t('api.noModelsAvailable')}
              </option>
            )}
          </select>
        )}
        {useCustomModel && <p className="text-xs text-text-muted">{modelInputHint}</p>}

        {(provider === 'ollama' || provider === 'custom') && (
          <SettingsDisclosure title={t('api.advancedModelParams')} description={t('api.contextWindowHint')}>
            <div className="grid grid-cols-2 gap-3">
              <SettingsField label={t('api.contextWindow')}>
                <input
                  id="api-context-window-input"
                  type="number"
                  value={contextWindow}
                  onChange={(e) => setContextWindow(e.target.value)}
                  min={1024}
                  step={1024}
                  className="input py-2.5 text-sm"
                />
              </SettingsField>
              <SettingsField label={t('api.maxOutputTokens')}>
                <input
                  id="api-max-tokens-input"
                  type="number"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(e.target.value)}
                  min={256}
                  step={256}
                  className="input py-2.5 text-sm"
                />
              </SettingsField>
            </div>
          </SettingsDisclosure>
        )}
      </SettingsCard>

      {provider === 'custom' && !isPuraMode && (
        <SettingsCard>
          <CommonProviderSetupsCard
            setups={commonProviderSetups}
            onApplySetup={applyCommonProviderSetup}
          />
        </SettingsCard>
      )}

      <SettingsCard>
        <SettingsToggle
          label={t('api.enableThinking')}
          description={
            isOllamaMode
              ? `${t('api.enableThinkingHint')} ${t('api.enableThinkingOllamaHint')}`
              : t('api.enableThinkingHint')
          }
          enabled={enableThinking}
          onToggle={() => setEnableThinking(!enableThinking)}
        />
      </SettingsCard>

      <SettingsDisclosure title={t('api.sectionDiagnostics')}>
        <ApiDiagnosticsPanel
          result={diagnosticResult}
          isRunning={isDiagnosing}
          onRunDiagnostics={handleDiagnose}
          onRunDeepDiagnostics={isOllamaMode ? handleDeepDiagnose : undefined}
          disabled={requiresApiKey && !apiKey.trim()}
        />
      </SettingsDisclosure>

      <SettingsStickyFooter>
        <button
          onClick={() => void handleSave()}
          disabled={isSaving || (requiresApiKey && !apiKey.trim())}
          className="btn btn-primary w-full py-3 disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('common.saving')}
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              {t('api.saveSettings')}
            </>
          )}
        </button>
      </SettingsStickyFooter>
    </SettingsPage>
  );
}
