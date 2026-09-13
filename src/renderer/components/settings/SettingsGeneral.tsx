import { useState, useEffect } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store';
import { SettingsLogs } from './SettingsLogs';
import { SettingsMemory } from './SettingsMemory';
import { UI_ZOOM_PRESETS } from '../../../shared/ui-zoom';
import {
  SettingsPage,
  SettingsCard,
  SettingsCardHeader,
  SettingsToggle,
  SettingsSegmentedControl,
  SettingsOptionList,
} from './shared';

export function SettingsGeneral({ isActive }: { isActive: boolean }) {
  const { i18n, t } = useTranslation();
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const currentLang = i18n.language.startsWith('zh')
    ? 'zh'
    : i18n.language.startsWith('it')
      ? 'it'
      : 'en';
  const [appVer, setAppVer] = useState('');
  useEffect(() => {
    try {
      const v = window.electronAPI?.getVersion?.();
      if (v instanceof Promise) v.then(setAppVer);
      else if (v) setAppVer(v);
    } catch {
      /* ignore */
    }
  }, []);

  const languages = [
    { code: 'it' as const, label: 'Italiano' },
    { code: 'en' as const, label: 'English' },
    { code: 'zh' as const, label: '中文' },
  ];

  const themeOptions = [
    {
      value: 'light' as const,
      label: (
        <span className="inline-flex items-center gap-1.5">
          <Sun className="w-3.5 h-3.5" />
          {t('general.themeLight')}
        </span>
      ),
    },
    {
      value: 'dark' as const,
      label: (
        <span className="inline-flex items-center gap-1.5">
          <Moon className="w-3.5 h-3.5" />
          {t('general.themeDark')}
        </span>
      ),
    },
    {
      value: 'system' as const,
      label: (
        <span className="inline-flex items-center gap-1.5">
          <Monitor className="w-3.5 h-3.5" />
          {t('general.themeSystem', 'System')}
        </span>
      ),
    },
  ];

  const zoomOptions = UI_ZOOM_PRESETS.map((preset) => ({
    value: String(preset.value),
    label: preset.label,
  }));

  return (
    <SettingsPage>
      <SettingsCard>
        <SettingsCardHeader title={t('general.appearance')} description={t('general.appearanceDesc')} />
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-medium text-text-muted">{t('general.theme')}</p>
            <SettingsSegmentedControl
              options={themeOptions}
              value={settings.theme}
              onChange={(value) => updateSettings({ theme: value })}
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-text-muted">{t('general.zoom')}</p>
            <SettingsSegmentedControl
              options={zoomOptions}
              value={String(settings.uiZoom)}
              onChange={(value) => updateSettings({ uiZoom: Number(value) })}
            />
            <p className="text-xs leading-5 text-text-muted">{t('general.zoomDesc')}</p>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard>
        <SettingsCardHeader title={t('general.language')} />
        <SettingsOptionList
          options={languages.map((lang) => ({ value: lang.code, label: lang.label }))}
          value={currentLang}
          onChange={(code) => i18n.changeLanguage(code)}
        />
      </SettingsCard>

      <SettingsCard>
        <SettingsCardHeader title={t('general.system')} />
        <div className="space-y-4">
          <SettingsToggle
            label={t('general.alwaysOn')}
            description={t('general.alwaysOnDesc')}
            enabled={settings.alwaysOn}
            onToggle={() => updateSettings({ alwaysOn: !settings.alwaysOn })}
          />
          <SettingsToggle
            label={t('general.launchAtStartup')}
            description={t('general.launchAtStartupDesc')}
            enabled={settings.launchAtStartup}
            onToggle={() => updateSettings({ launchAtStartup: !settings.launchAtStartup })}
          />
        </div>
      </SettingsCard>

      <SettingsCard>
        <SettingsMemory compact />
      </SettingsCard>

      <SettingsLogs isActive={isActive} />

      {appVer && (
        <p className="text-xs text-text-muted text-center pt-2">Aiden v{appVer} — Pura Digital</p>
      )}
    </SettingsPage>
  );
}
