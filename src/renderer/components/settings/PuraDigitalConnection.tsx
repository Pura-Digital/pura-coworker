import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectPuraLLM } from '@pura-ai/react';
import { CheckCircle, Cpu, Edit3, Key, Loader2, Plug, RefreshCw, Sparkles } from 'lucide-react';
import type { PuraAuthMode } from '../../../shared/pura-connect';
import {
  getPuraBrowserConnectionOptions,
  getPuraConnectClientOptions,
  isPuraConnectConfigured,
} from '../../config/puraConnect';
import { usePuraLlm } from '../../hooks/usePuraLlm';
import { PuraUsagePanel } from './PuraUsagePanel';
import {
  SettingsCard,
  SettingsCardHeader,
  SettingsField,
  SettingsSegmentedControl,
} from './shared';

type ModelOptionItem = { id: string; name: string };

export function PuraDigitalConnection({
  configSetId,
  puraAuthMode,
  onPuraAuthModeChange,
  apiKey,
  baseUrl,
  model,
  customModel,
  useCustomModel,
  modelOptions,
  isRefreshingModels,
  isDiscoveringPuraModels,
  isTesting,
  testResult,
  onApiKeyChange,
  onModelChange,
  onCustomModelChange,
  onToggleCustomModel,
  onRefreshModels,
  onDiscoverPuraModels,
  onTestConnection,
  modelInputPlaceholder,
  modelInputHint,
}: {
  configSetId: string;
  puraAuthMode: PuraAuthMode;
  onPuraAuthModeChange: (mode: PuraAuthMode) => void;
  apiKey: string;
  baseUrl: string;
  model: string;
  customModel: string;
  useCustomModel: boolean;
  modelOptions: ModelOptionItem[];
  isRefreshingModels: boolean;
  isDiscoveringPuraModels: boolean;
  isTesting: boolean;
  testResult: { ok: boolean } | null;
  onApiKeyChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onCustomModelChange: (value: string) => void;
  onToggleCustomModel: () => void;
  onRefreshModels: () => void;
  onDiscoverPuraModels: () => void;
  onTestConnection: () => void;
  modelInputPlaceholder: string;
  modelInputHint: string;
}) {
  const { t, i18n } = useTranslation();
  const { connection, busy, error, connect, disconnect, usageRefreshKey } =
    usePuraLlm(configSetId);
  const [protocolRegistered, setProtocolRegistered] = useState<boolean | null>(null);
  const puraConnectUiReady = isPuraConnectConfigured();
  const locale = i18n.language?.startsWith('en') ? 'en' : 'it';
  const connectOptions = getPuraConnectClientOptions();
  const browserOptions = getPuraBrowserConnectionOptions(locale);
  const isDesktopConnect = Boolean(window.electronAPI?.puraConnect?.startConnection);

  useEffect(() => {
    void window.electronAPI?.puraConnect?.isProtocolRegistered?.().then(setProtocolRegistered);
  }, []);

  const tab = puraAuthMode;
  const connectionStatusBadge = (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        connection.connected ? 'bg-success/15 text-success' : 'bg-surface-hover text-text-muted'
      }`}
    >
      {connection.connected
        ? t('api.puraConnect.connectedBadge')
        : t('api.puraConnect.disconnectedBadge')}
    </span>
  );

  return (
    <>
      <SettingsCard>
        <SettingsSegmentedControl
          options={[
            { value: 'subscription' as const, label: t('api.puraConnect.tabSubscription') },
            { value: 'apiKey' as const, label: t('api.puraConnect.tabApiKey') },
          ]}
          value={tab}
          onChange={onPuraAuthModeChange}
        />
      </SettingsCard>

      {tab === 'subscription' ? (
        <SettingsCard>
          <SettingsCardHeader
            title={t('api.puraConnect.connectionTitle')}
            icon={Plug}
            badge={connectionStatusBadge}
          />
          {!puraConnectUiReady ? (
            <p className="text-sm text-text-muted">{t('api.puraConnect.notConfigured')}</p>
          ) : (
            <div className="space-y-3">
              {protocolRegistered === false ? (
                <p className="text-xs text-warning">{t('api.puraConnect.protocolUnavailable')}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                {connection.connected ? (
                  <button
                    type="button"
                    className="btn btn-secondary text-xs"
                    disabled={busy}
                    onClick={() => void disconnect()}
                  >
                    {t('api.puraConnect.disconnect')}
                  </button>
                ) : (
                  <div
                    className="inline-flex"
                    onClickCapture={
                      isDesktopConnect
                        ? (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (!busy && protocolRegistered !== false) {
                              void connect();
                            }
                          }
                        : undefined
                    }
                  >
                    <ConnectPuraLLM
                      options={{
                        apiBase: connectOptions.apiBase,
                        clientId: connectOptions.clientId,
                        redirectUri: browserOptions.redirectUri,
                        locale,
                      }}
                      disabled={busy || protocolRegistered === false}
                      aria-busy={busy}
                      onError={(err) => {
                        const message = err instanceof Error ? err.message : String(err);
                        console.error('[Pura Connect]', message);
                      }}
                    />
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-secondary text-xs"
                  disabled={isTesting || !connection.connected}
                  onClick={() => void onTestConnection()}
                >
                  {isTesting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    t('api.testConnection')
                  )}
                </button>
              </div>
              {connection.connected && connection.puraUserId ? (
                <p className="text-xs text-text-muted">
                  {t('api.puraConnect.connectedDescription', { id: connection.puraUserId })}
                </p>
              ) : (
                <p className="text-xs text-text-muted">{t('api.puraConnect.disconnectedHint')}</p>
              )}
              {error ? (
                <p className="text-xs text-error" role="alert">
                  {error}
                </p>
              ) : null}
              {testResult?.ok ? (
                <p className="text-xs text-success flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  {t('api.puraConnect.testSuccess')}
                </p>
              ) : null}
              {connection.connected ? (
                <PuraUsagePanel configSetId={configSetId} refreshKey={usageRefreshKey} />
              ) : null}
            </div>
          )}
        </SettingsCard>
      ) : (
        <>
          <SettingsCard>
            <SettingsCardHeader title={t('api.sectionConnection')} icon={Key} />
            <SettingsField label={t('api.baseUrl')} description={t('api.puraDigitalUrlHint')}>
              <input type="text" value={baseUrl} readOnly className="input opacity-70 cursor-not-allowed" />
            </SettingsField>
            <SettingsField label={t('api.apiKey')} description={t('api.apiKeyDescription')}>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                className="input"
              />
              <p className="text-xs text-text-muted mt-1">platform.puradigital.it</p>
            </SettingsField>
          </SettingsCard>

          <SettingsCard>
            <SettingsCardHeader
              title={t('api.sectionModel')}
              icon={Cpu}
              action={
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void onDiscoverPuraModels()}
                    disabled={isDiscoveringPuraModels}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-accent-muted text-accent"
                  >
                    <Sparkles className={`w-3 h-3 ${isDiscoveringPuraModels ? 'animate-pulse' : ''}`} />
                    {isDiscoveringPuraModels
                      ? t('api.discoveringPuraModels')
                      : t('api.discoverPuraModels')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onRefreshModels()}
                    disabled={isRefreshingModels}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-surface-hover"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefreshingModels ? 'animate-spin' : ''}`} />
                    {t('api.refreshModels')}
                  </button>
                  <button type="button" onClick={onToggleCustomModel} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border">
                    <Edit3 className="w-3 h-3" />
                    {useCustomModel ? t('api.useDetectedModels') : t('api.manualModel')}
                  </button>
                </div>
              }
            />
            {useCustomModel ? (
              <input
                type="text"
                value={customModel}
                onChange={(e) => onCustomModelChange(e.target.value)}
                placeholder={modelInputPlaceholder}
                className="input"
              />
            ) : (
              <select
                value={modelOptions.length ? model : ''}
                onChange={(e) => onModelChange(e.target.value)}
                className="input appearance-none cursor-pointer"
              >
                {modelOptions.length ? (
                  modelOptions.map((m) => (
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
            {useCustomModel ? <p className="text-xs text-text-muted">{modelInputHint}</p> : null}
          </SettingsCard>
        </>
      )}
    </>
  );
}
