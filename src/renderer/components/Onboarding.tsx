import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  FolderOpen,
  Loader2,
  RefreshCw,
  Plug,
  Monitor,
  Sun,
  Moon,
} from 'lucide-react';
import { AidenLogoLoader } from './AidenLogoLoader';
import { AidenDemo } from './onboarding/AidenDemo';
import { ProviderLogoBadge, protocolTabToLogoId, providerTabToLogoId } from './ProviderLogoBadge';
import { GuidanceInlineHint } from './ProviderGuidance';
import { SettingsSegmentedControl, SettingsToggle } from './settings/settings-ui';
import '../styles/onboarding.css';
import { useTranslation } from 'react-i18next';
import { useApiConfigState } from '../hooks/useApiConfigState';
import { useIPC } from '../hooks/useIPC';
import { useAppStore } from '../store';
import { completeOnboarding } from '../utils/onboarding-setup';
import { PuraDigitalConnection } from './settings/PuraDigitalConnection';
import type { AppConfig, AppTheme, ApiTestInput, ApiTestResult } from '../types';

export function Onboarding({
  initialConfig,
  preview = false,
  onSave,
  onClose,
}: {
  initialConfig: AppConfig;
  preview?: boolean;
  onSave: (config: Partial<AppConfig>) => Promise<void>;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [step, setStep] = useState(0);
  const [setupStep, setSetupStep] = useState(0);
  const [folder, setFolder] = useState(initialConfig.defaultWorkdir || '');
  const [theme, setTheme] = useState<AppTheme>(initialConfig.theme || 'system');
  const originalTheme = useRef(useAppStore.getState().settings.theme);
  const themeCommitted = useRef(false);
  useEffect(() => {
    useAppStore.getState().setSettings({ theme });
  }, [theme]);
  useEffect(() => () => {
    if (!themeCommitted.current) {
      useAppStore.getState().setSettings({ theme: originalTheme.current });
    }
  }, []);
  const [memoryEnabled, setMemoryEnabled] = useState(initialConfig.memoryEnabled ?? true);
  const [folderError, setFolderError] = useState('');
  const workingDir = useAppStore((s) => s.workingDir);
  const { selectFolder } = useIPC();
  const selectedFolder = folder || workingDir || '';
  const api = useApiConfigState({
    initialConfig,
    onSave: async (config) => {
      if (preview) {
        onClose();
        return;
      }
      await completeOnboarding(
        config,
        {
          defaultWorkdir: selectedFolder,
          theme,
          memoryEnabled,
          anonymizationEnabled: api.anonymizationEnabled,
        },
        async (input: ApiTestInput): Promise<ApiTestResult> => {
          if (input.puraAuthMode === 'subscription') {
            const result = await window.electronAPI.puraConnect.testConnection(
              api.activeConfigSetId
            );
            return result.ok
              ? { ok: true, latencyMs: result.latencyMs ?? 0 }
              : {
                  ok: false,
                  errorType: 'unknown',
                  details: result.message || result.error,
                };
          }
          return window.electronAPI.config.test(input);
        },
        async (nextConfig) => {
          // Saving can unmount the onboarding before its promise resolves.
          themeCommitted.current = true;
          try {
            await onSave(nextConfig);
          } catch (error) {
            themeCommitted.current = false;
            throw error;
          }
        },
        t('onboarding.connectionError')
      );
      useAppStore.getState().setWorkingDir(selectedFolder);
      useAppStore.getState().setSettings({ theme });
      onClose();
    },
  });
  const { isLoadingConfig, applyPuraDigitalSetup } = api;
  const initialized = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (isLoadingConfig || initialized.current) return;
    initialized.current = true;
    if (!initialConfig.apiKey && initialConfig.provider !== 'ollama') applyPuraDigitalSetup();
  }, [isLoadingConfig, applyPuraDigitalSetup, initialConfig]);
  useEffect(() => {
    headingRef.current?.focus();
  }, [step, setupStep]);

  const { isPuraMode, discoverPuraDigitalModels } = api;
  const discoveredPura = useRef(false);
  useEffect(() => {
    if (!isPuraMode) {
      discoveredPura.current = false;
      return;
    }
    if (step !== 2 || isLoadingConfig || discoveredPura.current) return;
    discoveredPura.current = true;
    void discoverPuraDigitalModels();
  }, [step, isLoadingConfig, isPuraMode, discoverPuraDigitalModels]);

  const busy =
    api.isLoadingConfig || api.isSaving || api.isRefreshingModels || api.isDiscoveringPuraModels;
  const hasModel = Boolean(api.useCustomModel ? api.customModel.trim() : api.model);
  const canSave = Boolean(
    selectedFolder &&
    (hasModel || api.puraSubscriptionConnected) &&
    (!api.requiresApiKey || api.apiKey.trim())
  );
  const fieldClass = 'input py-2.5 text-sm';
  const activeProviderTab = api.isPuraMode
    ? 'pura'
    : api.provider === 'ollama'
      ? 'ollama'
      : 'custom';
  const providerDisplayName =
    activeProviderTab === 'pura'
      ? t('api.puraDigital')
      : activeProviderTab === 'custom'
        ? t('api.moreModels')
        : api.presets?.ollama?.name || 'Ollama';

  async function chooseFolder() {
    setFolderError('');
    try {
      const path = await selectFolder();
      if (path) setFolder(path);
    } catch {
      setFolderError(t('welcome.selectWorkingFolderFailed'));
    }
  }

  const canConnect = Boolean(
    (hasModel || api.puraSubscriptionConnected) &&
    (!api.requiresApiKey || api.apiKey.trim()) &&
    (api.isPuraMode || api.baseUrl.trim())
  );
  const substeps = ['connection', 'workspace', 'review'];
  const title =
    step < 2 ? t(`onboarding.step${step + 1}Title`) : t(`onboarding.${substeps[setupStep]}Title`);
  const description =
    step < 2 ? t(`onboarding.step${step + 1}Body`) : t(`onboarding.${substeps[setupStep]}Body`);
  function advance() {
    if (step < 2) setStep(step + 1);
    else if (setupStep < 2) setSetupStep(setupStep + 1);
    else void api.handleSave({ silentSuccess: true });
  }
  function back() {
    if (step === 2 && setupStep > 0) setSetupStep(setupStep - 1);
    else setStep(Math.max(0, step - 1));
  }
  const disableNext =
    busy ||
    (step === 2 && (setupStep === 0 ? !canConnect : setupStep === 1 ? !selectedFolder : !canSave));

  return (
    <section className="onboarding-shell app-glass" aria-labelledby="onboarding-title">
      <header className="onboarding-header">
        <div className="flex items-center gap-3">
          <AidenLogoLoader
            decorative
            playOnceThenEveryMs={300000}
            className="h-10 w-10 rounded-xl border border-border-subtle bg-[#263247] p-1.5 [.light_&]:bg-background/60"
          />
          <span className="text-xl font-semibold tracking-[-0.04em]">Aiden</span>
          <span className="ml-2 hidden text-xs text-text-muted sm:block">Pura Digital</span>
        </div>
        <div className="flex items-center gap-4">
          {preview && (
            <button
              onClick={onClose}
              className="text-xs text-text-secondary hover:text-text-primary"
            >
              {t('onboarding.closePreview')}
            </button>
          )}
          <select
            aria-label={t('general.language')}
            className="rounded-lg border border-border-subtle bg-transparent px-3 py-2 text-xs text-text-secondary"
            value={i18n.resolvedLanguage?.split('-')[0] || 'it'}
            onChange={(e) => void i18n.changeLanguage(e.target.value)}
            disabled={busy}
          >
            <option value="it">Italiano</option>
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>{' '}
        </div>
      </header>
      <div className={`onboarding-content ${step === 2 ? 'onboarding-content--setup' : ''}`}>
        <div className="onboarding-copy">
          <nav aria-label={t('onboarding.progressLabel')} className="onboarding-chapters">
            {['intro', 'results', 'setup'].map((chapter, index) => (
              <button
                key={chapter}
                disabled={busy || index > step}
                onClick={() => {
                  setStep(index);
                }}
                aria-current={index === step ? 'step' : undefined}
                className={index === step ? 'onboarding-chapter-current' : ''}
              >
                <span>0{index + 1}</span>
                {t(`onboarding.chapter${index + 1}`)}
              </button>
            ))}
          </nav>
          <h1
            ref={headingRef}
            tabIndex={-1}
            id="onboarding-title"
            className="onboarding-heading outline-none"
          >
            {title}
          </h1>
          <p className="onboarding-description">{description}</p>
          {step < 2 && (
            <p className="onboarding-note">
              {t(step === 0 ? 'onboarding.requestNote' : 'onboarding.deliveryNote')}
            </p>
          )}
          {step === 2 && (
            <ol className="onboarding-setup-nav" aria-label={t('onboarding.setupProgressLabel')}>
              {substeps.map((name, index) => (
                <li key={name}>
                  <button
                    disabled={busy || index > setupStep}
                    aria-current={index === setupStep ? 'step' : undefined}
                    onClick={() => setSetupStep(index)}
                    className={index === setupStep ? 'onboarding-substep-current' : ''}
                  >
                    <span>{index + 1}</span>
                    {t(`onboarding.${name}Label`)}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
        <motion.div
          key={step < 2 ? `intro-${step}` : 'configuration'}
          initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.25 }}
          className="onboarding-stage"
        >
          {step < 2 ? (
            <AidenDemo scene={step === 0 ? 'request' : 'delivery'} />
          ) : (
            <div className="onboarding-setup-card app-glass-elevated">
              <div className="mb-6 flex items-center justify-between border-b border-border-subtle pb-4 text-xs">
                <span className="font-medium text-text-primary">
                  {t(`onboarding.${substeps[setupStep]}Label`)}
                </span>
                <span className="text-text-muted">{setupStep + 1} / 3</span>
              </div>
              {setupStep === 0 && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-text-secondary">{t('api.provider')}</p>
                    <SettingsSegmentedControl
                      value={activeProviderTab}
                      disabled={busy}
                      onChange={(p) => {
                        if (p === 'pura') api.applyPuraDigitalSetup();
                        else if (p === 'custom') api.applyCustomModelsSetup();
                        else api.changeProvider('ollama');
                      }}
                      options={(['pura', 'ollama', 'custom'] as const).map((p) => {
                        const isPuraTab = p === 'pura';
                        const label = isPuraTab
                          ? t('api.puraDigital')
                          : p === 'custom'
                            ? t('api.moreModels')
                            : api.presets?.ollama?.name || 'Ollama';
                        return {
                          value: p,
                          label: (
                            <span className="inline-flex items-center justify-center gap-1.5">
                              <ProviderLogoBadge id={providerTabToLogoId(p)} />
                              <span className="truncate">{label}</span>
                            </span>
                          ),
                        };
                      })}
                    />
                  </div>
                  {api.isPuraMode && (
                    <PuraDigitalConnection
                      configSetId={api.activeConfigSetId}
                      puraAuthMode={api.puraAuthMode}
                      onPuraAuthModeChange={api.setPuraAuthMode}
                      apiKey={api.apiKey}
                      baseUrl={api.baseUrl}
                      model={api.model}
                      customModel={api.customModel}
                      useCustomModel={api.useCustomModel}
                      modelOptions={api.modelOptions}
                      isRefreshingModels={api.isRefreshingModels}
                      isDiscoveringPuraModels={api.isDiscoveringPuraModels}
                      isTesting={api.isTesting}
                      testResult={api.testResult}
                      onApiKeyChange={api.setApiKey}
                      onModelChange={api.setModel}
                      onCustomModelChange={api.setCustomModel}
                      onToggleCustomModel={api.toggleCustomModel}
                      onRefreshModels={() => void api.refreshModelOptions()}
                      onDiscoverPuraModels={() => void api.discoverPuraDigitalModels()}
                      onTestConnection={() => void api.handleTest()}
                      modelInputPlaceholder={api.modelInputPlaceholder}
                      modelInputHint={api.modelInputHint}
                    />
                  )}
                  {!api.isPuraMode && (
                    <>
                      {api.provider === 'custom' && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-text-secondary">
                            {t('api.protocol')}
                          </p>
                          <SettingsSegmentedControl
                            value={api.customProtocol}
                            disabled={busy}
                            onChange={api.changeProtocol}
                            options={(
                              [
                                { id: 'anthropic', label: 'Anthropic' },
                                { id: 'openai', label: 'OpenAI' },
                                { id: 'gemini', label: 'Gemini' },
                              ] as const
                            ).map((mode) => ({
                              value: mode.id,
                              label: (
                                <span className="inline-flex items-center justify-center gap-1.5">
                                  <ProviderLogoBadge id={protocolTabToLogoId(mode.id)} />
                                  {mode.label}
                                </span>
                              ),
                            }))}
                          />
                          <p className="text-xs text-text-muted">{t('api.selectProtocol')}</p>
                          <GuidanceInlineHint
                            text={api.protocolGuidanceText}
                            tone={api.protocolGuidanceTone}
                          />
                        </div>
                      )}
                      {(api.provider === 'custom' || api.isOllamaMode) && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium text-text-secondary">
                              {t('api.baseUrl')}
                            </p>
                            {api.isOllamaMode && (
                              <button
                                type="button"
                                disabled={busy || api.isDiscoveringLocalOllama}
                                onClick={() => void api.discoverLocalOllama()}
                                className="flex items-center gap-1 text-xs text-accent disabled:opacity-50"
                              >
                                <Plug size={12} />
                                {api.isDiscoveringLocalOllama
                                  ? t('api.discoveringLocalOllama')
                                  : t('api.discoverLocalOllama')}
                              </button>
                            )}
                          </div>
                          <input
                            className={fieldClass}
                            value={api.baseUrl}
                            disabled={busy}
                            onChange={(e) => api.setBaseUrl(e.target.value)}
                            placeholder={
                              api.isOllamaMode
                                ? 'http://localhost:11434/v1'
                                : api.customProtocol === 'openai'
                                  ? 'https://api.openai.com/v1'
                                  : api.customProtocol === 'gemini'
                                    ? 'https://generativelanguage.googleapis.com'
                                    : api.currentPreset?.baseUrl || 'https://api.anthropic.com'
                            }
                          />
                          {api.provider === 'custom' && (
                            <GuidanceInlineHint text={api.baseUrlGuidanceText} />
                          )}
                        </div>
                      )}
                      {api.requiresApiKey && (
                        <label className="block space-y-2 text-xs font-medium text-text-secondary">
                          <span>{t('api.apiKey')}</span>
                          <input
                            type="password"
                            autoComplete="off"
                            className={fieldClass}
                            value={api.apiKey}
                            disabled={busy}
                            onChange={(e) => api.setApiKey(e.target.value)}
                            placeholder={
                              api.currentPreset?.keyPlaceholder || t('api.enterApiKey')
                            }
                          />
                          {api.currentPreset?.keyHint && (
                            <p className="font-normal text-text-muted">{api.currentPreset.keyHint}</p>
                          )}
                        </label>
                      )}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label
                            htmlFor="onboarding-model"
                            className="text-xs font-medium text-text-secondary"
                          >
                            {t('api.model')}
                          </label>
                          {api.supportsModelDiscovery && (
                            <button
                              type="button"
                              disabled={busy || (api.requiresApiKey && !api.apiKey.trim())}
                              onClick={() => void api.refreshModelOptions()}
                              className="flex items-center gap-1 text-xs text-accent disabled:opacity-50"
                            >
                              <RefreshCw
                                size={12}
                                className={api.isRefreshingModels ? 'animate-spin' : ''}
                              />
                              {t('api.refreshModels')}
                            </button>
                          )}
                        </div>
                        {api.useCustomModel ? (
                          <input
                            id="onboarding-model"
                            className={fieldClass}
                            value={api.customModel}
                            placeholder={api.modelInputPlaceholder}
                            disabled={busy}
                            onChange={(e) => api.setCustomModel(e.target.value)}
                          />
                        ) : (
                          <select
                            id="onboarding-model"
                            className={fieldClass}
                            value={api.modelOptions.length ? api.model : ''}
                            disabled={busy}
                            onChange={(e) => api.setModel(e.target.value)}
                          >
                            {!api.modelOptions.length && (
                              <option value="">{t('api.noModelsAvailable')}</option>
                            )}
                            {api.modelOptions.map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {api.shouldShowOllamaManualModelToggle && (
                          <button
                            type="button"
                            onClick={api.toggleCustomModel}
                            disabled={busy}
                            className="text-xs text-text-muted underline"
                          >
                            {t(
                              api.isOllamaMode
                                ? api.useCustomModel
                                  ? 'api.useDetectedModels'
                                  : 'api.manualModel'
                                : api.useCustomModel
                                  ? 'api.usePreset'
                                  : 'api.custom'
                            )}
                          </button>
                        )}
                        {api.useCustomModel && (
                          <p className="text-xs text-text-muted">{api.modelInputHint}</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
              {setupStep === 1 && (
                <div className="space-y-5">
                  {' '}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-text-secondary">
                      {t('onboarding.folder')}
                    </p>
                    <button
                      disabled={busy}
                      onClick={() => void chooseFolder()}
                      className={`${fieldClass} flex items-center gap-2 text-left`}
                    >
                      <FolderOpen size={16} className="shrink-0 text-accent" />
                      <span className="truncate">
                        {selectedFolder || t('onboarding.chooseFolder')}
                      </span>
                    </button>
                    <p className="text-xs text-text-muted">{t('onboarding.folderHint')}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-text-secondary">{t('general.theme')}</p>
                    <SettingsSegmentedControl<AppTheme>
                      value={theme}
                      onChange={setTheme}
                      disabled={busy}
                      options={[
                        {
                          value: 'system',
                          label: (
                            <span className="flex items-center gap-1.5">
                              <Monitor size={13} />
                              {t('general.themeSystem')}
                            </span>
                          ),
                        },
                        {
                          value: 'light',
                          label: (
                            <span className="flex items-center gap-1.5">
                              <Sun size={13} />
                              {t('general.themeLight')}
                            </span>
                          ),
                        },
                        {
                          value: 'dark',
                          label: (
                            <span className="flex items-center gap-1.5">
                              <Moon size={13} />
                              {t('general.themeDark')}
                            </span>
                          ),
                        },
                      ]}
                    />
                  </div>
                  <SettingsToggle
                    label={t('onboarding.memoryLabel')}
                    description={t('onboarding.memory')}
                    enabled={memoryEnabled}
                    disabled={busy}
                    onToggle={() => setMemoryEnabled(!memoryEnabled)}
                  />
                  {!api.isOllamaMode && (
                    <SettingsToggle
                      label={t('onboarding.privacyLabel')}
                      description={t('onboarding.privacy')}
                      enabled={api.anonymizationEnabled}
                      disabled={busy}
                      onToggle={() => api.setAnonymizationEnabled(!api.anonymizationEnabled)}
                    />
                  )}
                </div>
              )}
              {setupStep === 2 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <ProviderLogoBadge id={providerTabToLogoId(activeProviderTab)} />
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        {providerDisplayName}
                      </p>
                      {activeProviderTab === 'custom' && (
                        <p className="mt-0.5 text-xs text-text-muted">
                          {t('api.protocol')}: {api.customProtocol}
                        </p>
                      )}
                      <p className="mt-1 break-all text-xs text-text-muted">
                        {api.useCustomModel ? api.customModel : api.model}
                      </p>
                    </div>
                  </div>
                  <div className="border-y border-border-subtle py-4">
                    <p className="mb-2 text-xs text-text-muted">{t('onboarding.folder')}</p>
                    <p className="flex items-start gap-2 break-all text-sm text-text-primary">
                      <FolderOpen size={16} className="mt-0.5 shrink-0" />
                      {selectedFolder}
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-y-3 text-xs">
                    <dt className="text-text-muted">{t('general.theme')}</dt>
                    <dd className="text-right text-text-primary">
                      {t(`general.theme${theme[0].toUpperCase() + theme.slice(1)}`)}
                    </dd>
                    <dt className="text-text-muted">{t('onboarding.memoryLabel')}</dt>
                    <dd className="text-right text-text-primary">
                      {t(memoryEnabled ? 'onboarding.enabled' : 'onboarding.disabled')}
                    </dd>
                    {!api.isOllamaMode && (
                      <>
                        <dt className="text-text-muted">{t('onboarding.privacyLabel')}</dt>
                        <dd className="text-right text-text-primary">
                          {t(
                            api.anonymizationEnabled ? 'onboarding.enabled' : 'onboarding.disabled'
                          )}
                        </dd>
                      </>
                    )}
                  </dl>
                  <p className="rounded-xl border border-border-subtle bg-background/50 p-3 text-xs leading-5 text-text-muted">
                    {t('onboarding.verifyHint')}
                  </p>
                </div>
              )}
              {(api.error || folderError) && (
                <p
                  role="alert"
                  className="mt-4 rounded-xl bg-error/10 p-3 text-xs leading-5 text-error"
                >
                  {api.error || folderError}
                </p>
              )}
            </div>
          )}
        </motion.div>
      </div>
      <footer className="onboarding-footer">
        <div>
          {step === 0 ? (
            <button
              disabled={busy}
              onClick={() => setStep(2)}
              className="text-xs text-text-muted hover:text-text-primary"
            >
              {t('onboarding.skipIntro')}
            </button>
          ) : (
            <button
              disabled={busy}
              onClick={back}
              className="flex items-center gap-2 text-xs text-text-secondary"
            >
              <ArrowLeft size={14} />
              {t('onboarding.back')}
            </button>
          )}
        </div>
        <span className="hidden text-[11px] text-text-muted sm:block">
          {t(preview ? 'onboarding.previewHint' : 'onboarding.onceHint')}
        </span>
        <button
          disabled={disableNext}
          onClick={advance}
          className="btn btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          {api.isSaving ? <Loader2 size={15} className="animate-spin" /> : null}
          {t(
            api.isSaving
              ? 'onboarding.verifying'
              : step === 2 && setupStep === 2
                ? 'onboarding.start'
                : 'onboarding.next'
          )}
          {!api.isSaving && <ArrowRight size={15} />}
        </button>
      </footer>
    </section>
  );
}
