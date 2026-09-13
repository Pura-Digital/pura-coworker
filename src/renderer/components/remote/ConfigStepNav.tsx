/**
 * ConfigStepNav — tab navigation for the three configuration steps
 */

import { useTranslation } from 'react-i18next';
import { MessageSquare, Link2, Settings2, CheckCircle2 } from 'lucide-react';
import type { ConfigStep } from './types';

interface Props {
  activeStep: ConfigStep;
  isTelegramConfigured: boolean;
  isConnectionConfigured: boolean;
  onStepChange: (step: ConfigStep) => void;
}

export function ConfigStepNav({
  activeStep,
  isTelegramConfigured,
  isConnectionConfigured,
  onStepChange,
}: Props) {
  const { t } = useTranslation();

  const steps: { id: ConfigStep; labelKey: string; icon: React.ElementType; done: boolean }[] = [
    {
      id: 'telegram',
      labelKey: 'remote.stepTelegram',
      icon: MessageSquare,
      done: isTelegramConfigured,
    },
    {
      id: 'connection',
      labelKey: 'remote.stepConnection',
      icon: Link2,
      done: isConnectionConfigured,
    },
    {
      id: 'advanced',
      labelKey: 'remote.stepAdvanced',
      icon: Settings2,
      done: true,
    },
  ];

  return (
    <div className="settings-segment-track w-full" role="tablist">
      {steps.map((step) => {
        const selected = activeStep === step.id;
        return (
        <button
          key={step.id}
          onClick={() => onStepChange(step.id)}
          role="tab"
          aria-selected={selected}
          data-selected={selected ? 'true' : 'false'}
          className="settings-segment-option flex-1 min-w-[7rem] flex items-center justify-center gap-2"
        >
          {step.done && activeStep !== step.id ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
          ) : (
            <step.icon className="w-3.5 h-3.5" />
          )}
          <span>{t(step.labelKey)}</span>
        </button>
        );
      })}
    </div>
  );
}
