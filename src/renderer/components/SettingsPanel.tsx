import { useState, useEffect } from 'react';
import { X, Settings, Shield, Briefcase, Clock3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWindowSize } from '../hooks/useWindowSize';
import { RemoteControlPanel } from './RemoteControlPanel';
import { useAppStore } from '../store';
import { SettingsAPI } from './settings/SettingsAPI';
import { SettingsSandbox } from './settings/SettingsSandbox';
import { SettingsCustomize } from './settings/SettingsCustomize';
import { SettingsSchedule } from './settings/SettingsSchedule';
import { SettingsGeneral } from './settings/SettingsGeneral';
import { ApiSystemIcon, WalkieTalkieIcon } from './settings/SettingsNavIcons';

interface SettingsPanelProps {
  onClose: () => void;
  initialTab?: TabId;
}

type TabId = 'api' | 'sandbox' | 'customize' | 'schedule' | 'remote' | 'general';

const VALID_TABS = new Set<TabId>(['api', 'sandbox', 'customize', 'schedule', 'remote', 'general']);

const TAB_ALIASES: Record<string, TabId> = {
  connectors: 'customize',
  skills: 'customize',
  memory: 'general',
  logs: 'general',
};

function resolveTabId(tab: string | null | undefined, fallback: TabId): TabId {
  if (tab && VALID_TABS.has(tab as TabId)) {
    return tab as TabId;
  }
  if (tab && TAB_ALIASES[tab]) {
    return TAB_ALIASES[tab];
  }
  return fallback;
}

export function SettingsPanel({ onClose, initialTab = 'api' }: SettingsPanelProps) {
  const { t } = useTranslation();
  const { width } = useWindowSize();
  const compactSidebar = width < 900;
  const storeTab = useAppStore((s) => s.settingsTab);
  const setSettingsTab = useAppStore((s) => s.setSettingsTab);
  const resolvedInitial = resolveTabId(storeTab, initialTab);

  const [activeTab, setActiveTab] = useState<TabId>(resolvedInitial);
  const [viewedTabs, setViewedTabs] = useState<Set<TabId>>(new Set([resolvedInitial]));
  const [appVersion, setAppVersion] = useState('');
  useEffect(() => {
    try {
      const v = window.electronAPI?.getVersion?.();
      if (v instanceof Promise) v.then(setAppVersion);
      else if (v) setAppVersion(v);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (storeTab) {
      const resolved = resolveTabId(storeTab, initialTab);
      setActiveTab(resolved);
      setSettingsTab(null);
    }
  }, [storeTab, setSettingsTab, initialTab]);

  useEffect(() => {
    setViewedTabs((prev) => (prev.has(activeTab) ? prev : new Set([...prev, activeTab])));
  }, [activeTab]);

  const tabs = [
    {
      id: 'general' as TabId,
      label: t('settings.general'),
      icon: Settings,
      description: t('settings.generalDesc'),
    },
    {
      id: 'api' as TabId,
      label: t('settings.apiSettings'),
      icon: ApiSystemIcon,
      description: t('settings.apiSettingsDesc'),
    },
    {
      id: 'customize' as TabId,
      label: t('settings.customize'),
      icon: Briefcase,
      description: t('settings.customizeDesc'),
    },
    {
      id: 'schedule' as TabId,
      label: t('settings.schedule'),
      icon: Clock3,
      description: t('settings.scheduleDesc'),
    },
    {
      id: 'remote' as TabId,
      label: t('settings.remote'),
      icon: WalkieTalkieIcon,
      description: t('settings.remoteDesc'),
    },
    {
      id: 'sandbox' as TabId,
      label: t('settings.sandbox'),
      icon: Shield,
      description: t('settings.sandboxDesc'),
    },
  ];
  const activeTabMeta = tabs.find((tab) => tab.id === activeTab);

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <div
        className={`${compactSidebar ? 'w-12' : 'w-44 lg:w-48'} bg-background-secondary/88 border-r border-border-muted flex flex-col flex-shrink-0`}
      >
        {!compactSidebar && (
          <div className="px-3 pt-3 pb-2 border-b border-border-muted">
            <p className="text-[11px] uppercase tracking-[0.14em] text-text-muted">
              {t('settings.title')}
            </p>
          </div>
        )}
        <div className={`flex-1 ${compactSidebar ? 'p-1 space-y-0.5' : 'p-1.5 space-y-0.5'}`}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={compactSidebar ? tab.label : undefined}
              className={`w-full flex items-center ${compactSidebar ? 'justify-center p-1.5' : 'gap-2 px-2 py-1.5'} rounded-md text-left transition-colors active:scale-[0.98] ${
                activeTab === tab.id
                  ? 'bg-surface-hover text-text-primary font-medium'
                  : 'hover:bg-surface-hover/60 text-text-secondary hover:text-text-primary'
              }`}
            >
              <tab.icon
                className={`flex-shrink-0 ${compactSidebar ? 'w-3.5 h-3.5' : 'w-3.5 h-3.5'}`}
              />
              {!compactSidebar && (
                <span className="flex-1 min-w-0 text-[13px] truncate">{tab.label}</span>
              )}
            </button>
          ))}
        </div>
        <div className={`${compactSidebar ? 'p-1' : 'p-2'} border-t border-border-muted`}>
          <button
            onClick={onClose}
            className={`w-full ${compactSidebar ? 'p-1.5' : 'px-2 py-1.5'} rounded-md hover:bg-surface-hover transition-colors text-text-secondary text-[13px]`}
            title={compactSidebar ? t('common.close') : undefined}
          >
            {compactSidebar ? <X className="w-3.5 h-3.5 mx-auto" /> : t('common.close')}
          </button>
          {!compactSidebar && appVersion && (
            <p className="text-[10px] text-text-muted text-center mt-1.5 select-text">
              v{appVersion}
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="flex items-center justify-between px-4 lg:px-8 py-4 border-b border-border-muted flex-shrink-0 bg-background/88 backdrop-blur-sm">
          <div>
            <h3 className="text-[1.15rem] font-semibold tracking-[-0.02em] text-text-primary">
              {activeTabMeta?.label}
            </h3>
            {activeTabMeta?.description && (
              <p className="mt-1 text-sm text-text-muted max-w-[36rem]">
                {activeTabMeta.description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 lg:px-8 lg:py-8">
          <div className="w-full min-w-0">
            <div>
              <div className={activeTab === 'api' ? '' : 'hidden'}>
                {viewedTabs.has('api') && <SettingsAPI />}
              </div>
              <div className={activeTab === 'sandbox' ? '' : 'hidden'}>
                {viewedTabs.has('sandbox') && <SettingsSandbox />}
              </div>
              <div className={activeTab === 'customize' ? '' : 'hidden'}>
                {viewedTabs.has('customize') && (
                  <SettingsCustomize isActive={activeTab === 'customize'} />
                )}
              </div>
              <div className={activeTab === 'schedule' ? '' : 'hidden'}>
                {viewedTabs.has('schedule') && (
                  <SettingsSchedule isActive={activeTab === 'schedule'} />
                )}
              </div>
              <div className={activeTab === 'remote' ? '' : 'hidden'}>
                {viewedTabs.has('remote') && (
                  <RemoteControlPanel isActive={activeTab === 'remote'} />
                )}
              </div>
              <div className={activeTab === 'general' ? '' : 'hidden'}>
                {viewedTabs.has('general') && (
                  <SettingsGeneral isActive={activeTab === 'general'} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
