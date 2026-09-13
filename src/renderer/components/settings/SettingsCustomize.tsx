import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsConnectors } from './SettingsConnectors';
import { SettingsSkills } from './SettingsSkills';
import { SettingsPage, SettingsSubNav } from './shared';

type CustomizeSection = 'connectors' | 'skills';

export function SettingsCustomize({ isActive }: { isActive: boolean }) {
  const { t } = useTranslation();
  const [section, setSection] = useState<CustomizeSection>('connectors');

  return (
    <SettingsPage>
      <SettingsSubNav
        items={[
          { id: 'connectors', label: t('settings.subNav.connectors') },
          { id: 'skills', label: t('settings.subNav.skills') },
        ]}
        active={section}
        onChange={setSection}
      />
      {section === 'connectors' && <SettingsConnectors isActive={isActive} />}
      {section === 'skills' && <SettingsSkills isActive={isActive} />}
    </SettingsPage>
  );
}
