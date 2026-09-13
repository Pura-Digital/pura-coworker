/**
 * Remote Control Settings Panel
 * Composes sub-components for Telegram bot remote control configuration.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2 } from 'lucide-react';
import { GatewayControlCard } from './remote/GatewayControlCard';
import { PairingRequestsSection } from './remote/PairingRequestsSection';
import { PairingGuideCard } from './remote/PairingGuideCard';
import { ConfigStepNav } from './remote/ConfigStepNav';
import { TelegramConfigStep } from './remote/TelegramConfigStep';
import { ConnectionConfigStep } from './remote/ConnectionConfigStep';
import { AdvancedConfigStep } from './remote/AdvancedConfigStep';
import { AuthorizedUsersSection } from './remote/AuthorizedUsersSection';
import { QuickStartGuide } from './remote/QuickStartGuide';
import type {
  GatewayStatus,
  PairedUser,
  PairingRequest,
  RemoteConfig,
  TunnelStatus,
  ConfigStep,
  LocalizedBanner,
} from './remote/types';
import {
  SettingsPage,
  SettingsCard,
  SettingsCardHeader,
  SettingsAlert,
  SettingsStickyFooter,
  SettingsDisclosure,
} from './settings/shared';

const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

export function RemoteControlPanel({ isActive }: { isActive: boolean }) {
  const { t } = useTranslation();

  // Remote state
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [, setConfig] = useState<RemoteConfig | null>(null);
  const [pairedUsers, setPairedUsers] = useState<PairedUser[]>([]);
  const [pendingPairings, setPendingPairings] = useState<PairingRequest[]>([]);
  const [isTogglingGateway, setIsTogglingGateway] = useState(false);
  const [error, setError] = useState<LocalizedBanner | null>(null);
  const [success, setSuccess] = useState<LocalizedBanner | null>(null);
  const [activeStep, setActiveStep] = useState<ConfigStep>('telegram');

  // Form state
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramDmPolicy, setTelegramDmPolicy] = useState('pairing');
  const [gatewayPort, setGatewayPort] = useState(18789);
  const [defaultWorkingDirectory, setDefaultWorkingDirectory] = useState('');
  const [autoApproveSafeTools, setAutoApproveSafeTools] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [useLongConnection, setUseLongConnection] = useState(true);
  const [tunnelEnabled, setTunnelEnabled] = useState(false);
  const [ngrokAuthToken, setNgrokAuthToken] = useState('');
  const [tunnelStatus, setTunnelStatus] = useState<TunnelStatus | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isActive) return;
    loadData();
    const interval = setInterval(refreshStatus, 5000);
    return () => clearInterval(interval);
  }, [isActive]);

  async function loadData() {
    if (!isElectron) return;
    setIsLoading(true);
    try {
      const [
        configResult,
        statusResult,
        usersResult,
        pairingsResult,
        tunnelStatusResult,
        webhookUrlResult,
      ] = await Promise.all([
        window.electronAPI.remote.getConfig(),
        window.electronAPI.remote.getStatus(),
        window.electronAPI.remote.getPairedUsers(),
        window.electronAPI.remote.getPendingPairings(),
        window.electronAPI.remote.getTunnelStatus(),
        window.electronAPI.remote.getWebhookUrl(),
      ]);

      setConfig(configResult);
      setStatus(statusResult);
      setPairedUsers(usersResult);
      setPendingPairings(pairingsResult);
      setTunnelStatus(tunnelStatusResult);
      setWebhookUrl(webhookUrlResult);

      if (configResult) {
        setGatewayPort(configResult.gateway?.port || 18789);
        setDefaultWorkingDirectory(configResult.gateway?.defaultWorkingDirectory || '');
        setAutoApproveSafeTools(configResult.gateway?.autoApproveSafeTools !== false);
        setTunnelEnabled(configResult.gateway?.tunnel?.enabled || false);
        setNgrokAuthToken(configResult.gateway?.tunnel?.ngrok?.authToken || '');
        if (configResult.channels?.telegram) {
          setTelegramBotToken(configResult.channels.telegram.botToken || '');
          setTelegramDmPolicy(configResult.channels.telegram.dm?.policy || 'pairing');
          setUseLongConnection(!configResult.channels.telegram.webhookUrl);
        }
      }
    } catch (err) {
      console.error('Failed to load remote config:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshStatus() {
    if (!isElectron) return;
    try {
      const [statusResult, pairingsResult, tunnelStatusResult, webhookUrlResult] =
        await Promise.all([
          window.electronAPI.remote.getStatus(),
          window.electronAPI.remote.getPendingPairings(),
          window.electronAPI.remote.getTunnelStatus(),
          window.electronAPI.remote.getWebhookUrl(),
        ]);
      setStatus(statusResult);
      setPendingPairings(pairingsResult);
      setTunnelStatus(tunnelStatusResult);
      setWebhookUrl(webhookUrlResult);
    } catch (err) {
      console.error('Failed to refresh status:', err);
    }
  }

  async function toggleGateway() {
    if (!isElectron || isTogglingGateway) return;
    setIsTogglingGateway(true);
    setError(null);
    try {
      const newEnabled = !status?.running;
      await window.electronAPI.remote.setEnabled(newEnabled);
      await refreshStatus();
      setSuccess({ key: newEnabled ? 'remote.started' : 'remote.stopped' });
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError({ key: 'remote.actionFailed' });
    } finally {
      setIsTogglingGateway(false);
    }
  }

  async function saveConfig() {
    if (!isElectron) return;
    setIsSaving(true);
    setError(null);
    try {
      await window.electronAPI.remote.updateGatewayConfig({
        port: gatewayPort,
        defaultWorkingDirectory: defaultWorkingDirectory || undefined,
        autoApproveSafeTools,
        tunnel:
          tunnelEnabled && ngrokAuthToken
            ? {
                enabled: true,
                type: 'ngrok',
                ngrok: { authToken: ngrokAuthToken, region: 'us' },
              }
            : { enabled: false, type: 'ngrok' },
      });

      if (telegramBotToken) {
        await window.electronAPI.remote.updateTelegramConfig({
          type: 'telegram',
          botToken: telegramBotToken,
          webhookUrl: useLongConnection ? undefined : webhookUrl || undefined,
          dm: { policy: telegramDmPolicy as 'open' | 'pairing' | 'allowlist' },
        });
      }

      setSuccess({ key: 'remote.configSaved' });
      setTimeout(() => setSuccess(null), 3000);
      await loadData();
    } catch (err) {
      setError({ key: 'remote.saveFailed' });
    } finally {
      setIsSaving(false);
    }
  }

  async function approvePairing(request: PairingRequest) {
    if (!isElectron) return;
    try {
      await window.electronAPI.remote.approvePairing(request.channelType, request.userId);
      setSuccess({ key: 'remote.pairingApproved' });
      setTimeout(() => setSuccess(null), 3000);
      await loadData();
    } catch (err) {
      setError({ key: 'remote.approveFailed' });
    }
  }

  async function rejectPairing(request: PairingRequest) {
    if (!isElectron) return;
    try {
      const result = await window.electronAPI.remote.rejectPairing(
        request.channelType,
        request.userId
      );
      if (!result.success) {
        setError(result.error ? { text: result.error } : { key: 'remote.rejectFailed' });
        return;
      }
      setSuccess({ key: 'remote.pairingRejected' });
      setTimeout(() => setSuccess(null), 3000);
      await loadData();
    } catch (err) {
      setError({ key: 'remote.rejectFailed' });
    }
  }

  async function revokePairing(user: PairedUser) {
    if (!isElectron) return;
    try {
      await window.electronAPI.remote.revokePairing(user.channelType, user.userId);
      setSuccess({ key: 'remote.userRemoved' });
      setTimeout(() => setSuccess(null), 3000);
      await loadData();
    } catch (err) {
      setError({ key: 'remote.revokeFailed' });
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setSuccess({ key: 'remote.copied' });
    setTimeout(() => setSuccess(null), 2000);
  }

  const isTelegramConfigured = !!telegramBotToken;
  const isConnectionConfigured =
    useLongConnection || (tunnelEnabled && !!ngrokAuthToken) || !!tunnelStatus?.connected;
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <SettingsPage>
      {error && (
        <SettingsAlert variant="error">
          {error.key ? t(error.key) : error.text}
        </SettingsAlert>
      )}
      {success && (
        <SettingsAlert variant="success">
          {success.key ? t(success.key) : success.text}
        </SettingsAlert>
      )}

      <GatewayControlCard
        status={status}
        pairedUsers={pairedUsers}
        pendingPairings={pendingPairings}
        isTogglingGateway={isTogglingGateway}
        isTelegramConfigured={isTelegramConfigured}
        onToggle={toggleGateway}
      />

      {status?.running && telegramDmPolicy === 'pairing' && <PairingGuideCard />}

      <PairingRequestsSection
        pendingPairings={pendingPairings}
        showEmpty={status?.running && telegramDmPolicy === 'pairing'}
        onApprove={approvePairing}
        onReject={rejectPairing}
      />

      <ConfigStepNav
        activeStep={activeStep}
        isTelegramConfigured={isTelegramConfigured}
        isConnectionConfigured={isConnectionConfigured}
        onStepChange={setActiveStep}
      />

      <SettingsCard>
        <SettingsCardHeader title={t('remote.sectionConfig')} />
        {activeStep === 'telegram' && (
          <TelegramConfigStep
            telegramBotToken={telegramBotToken}
            telegramDmPolicy={telegramDmPolicy}
            onBotTokenChange={setTelegramBotToken}
            onDmPolicyChange={setTelegramDmPolicy}
          />
        )}
        {activeStep === 'connection' && (
          <ConnectionConfigStep
            useLongConnection={useLongConnection}
            tunnelEnabled={tunnelEnabled}
            ngrokAuthToken={ngrokAuthToken}
            gatewayPort={gatewayPort}
            tunnelStatus={tunnelStatus}
            webhookUrl={webhookUrl}
            onLongConnectionChange={setUseLongConnection}
            onTunnelEnabledChange={setTunnelEnabled}
            onNgrokAuthTokenChange={setNgrokAuthToken}
            onCopy={copyToClipboard}
          />
        )}
        {activeStep === 'advanced' && (
          <AdvancedConfigStep
            defaultWorkingDirectory={defaultWorkingDirectory}
            gatewayPort={gatewayPort}
            autoApproveSafeTools={autoApproveSafeTools}
            onWorkingDirectoryChange={setDefaultWorkingDirectory}
            onGatewayPortChange={setGatewayPort}
            onAutoApproveChange={setAutoApproveSafeTools}
          />
        )}

      </SettingsCard>

      <SettingsCard>
        <AuthorizedUsersSection pairedUsers={pairedUsers} onRevoke={revokePairing} />
      </SettingsCard>

      <SettingsDisclosure title={t('remote.quickStartTitle', 'Quick start guide')}>
        <QuickStartGuide />
      </SettingsDisclosure>

      <SettingsStickyFooter>
        <button onClick={saveConfig} disabled={isSaving} className="btn btn-primary w-full py-3">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {t('remote.saveConfig')}
        </button>
      </SettingsStickyFooter>
    </SettingsPage>
  );
}
