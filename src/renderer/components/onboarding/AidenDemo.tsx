import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowUp,
  FileText,
  FolderOpen,
  MousePointer2,
  Paperclip,
  RotateCcw,
  Table2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AidenLogoLoader } from '../AidenLogoLoader';

/** A finite demonstration of Aiden's composer and document preview. */
export function AidenDemo({ scene }: { scene: 'request' | 'delivery' }) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [replay, setReplay] = useState(0);
  const [phase, setPhase] = useState(0);
  const [typed, setTyped] = useState('');
  const prompt = t('onboarding.demoPrompt');
  useEffect(() => {
    setPhase(reducedMotion ? 4 : 0);
    setTyped(reducedMotion ? prompt : '');
    if (reducedMotion) return;
    const timers = [450, 1100, 2200, 3900].map((delay, index) =>
      setTimeout(() => setPhase(index + 1), delay)
    );
    let letters = 0;
    const typing = setInterval(() => {
      letters += 2;
      setTyped(prompt.slice(0, letters));
      if (letters >= prompt.length) clearInterval(typing);
    }, 40);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(typing);
    };
  }, [prompt, reducedMotion, replay, scene]);
  const reveal = (at: number) => ({
    opacity: phase >= at ? 1 : 0,
    y: reducedMotion || phase >= at ? 0 : 8,
  });

  return (
    <div className="onboarding-demo" aria-label={t(`onboarding.${scene}Demo`)}>
      <div className="onboarding-demo-toolbar">
        <span className="flex items-center gap-2">
          <AidenLogoLoader decorative className="h-5 w-5" playOnceThenEveryMs={300000} />
          <span className="font-semibold text-text-primary">Aiden</span>
        </span>
        <span>{t(scene === 'request' ? 'onboarding.newTask' : 'onboarding.nordProject')}</span>
      </div>
      <div key={replay} aria-hidden="true" className="onboarding-demo-body">
        {scene === 'request' ? (
          <>
            <div className="onboarding-file-tray">
              <p className="mb-3 flex items-center gap-2 text-xs text-text-muted">
                <FolderOpen size={14} />
                {t('onboarding.nordFolder')}
              </p>
              {['brief-nord.pdf', 'budget.xlsx'].map((file, index) => (
                <motion.div
                  key={file}
                  animate={{ opacity: phase >= 2 ? 0.45 : 1, x: phase >= 1 ? 0 : -8 }}
                  className="onboarding-source-file"
                >
                  <span className="onboarding-file-icon">
                    {index === 0 ? <FileText size={18} /> : <Table2 size={18} />}
                  </span>
                  <span>{file}</span>
                  <span className="ml-auto text-[10px] text-text-muted">
                    {index === 0 ? 'PDF' : 'XLSX'}
                  </span>
                </motion.div>
              ))}
            </div>
            <div className="onboarding-composer">
              <div className="min-h-[88px] text-[13px] leading-6 text-text-primary">
                {typed}
                <span className={phase < 4 ? 'onboarding-caret' : 'hidden'} />
              </div>
              <motion.div animate={reveal(2)} className="mb-5 flex flex-wrap gap-2">
                {['brief-nord.pdf', 'budget.xlsx'].map((file) => (
                  <span key={file} className="onboarding-attachment">
                    <Paperclip size={12} />
                    {file}
                  </span>
                ))}
              </motion.div>
              <div className="flex items-center justify-between text-text-muted">
                <span className="flex items-center gap-2 text-[11px]">
                  <FolderOpen size={14} />
                  {t('onboarding.nordFolder')}
                </span>
                <motion.span
                  animate={{
                    backgroundColor:
                      phase >= 4 ? 'var(--color-accent)' : 'var(--color-surface-active)',
                    color: phase >= 4 ? '#ffffff' : 'var(--color-text-muted)',
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                >
                  <ArrowUp size={17} />
                </motion.span>
              </div>
            </div>
            {!reducedMotion && (
              <motion.div
                className="onboarding-demo-pointer"
                initial={{ opacity: 0, x: 60, y: 72 }}
                animate={{ opacity: [0, 1, 1, 0], x: [60, 85, 200, 200], y: [72, 72, 210, 210] }}
                transition={{ duration: 1.6, delay: 0.4, times: [0, 0.2, 0.8, 1] }}
              >
                <MousePointer2 size={21} fill="var(--color-text-primary)" />
              </motion.div>
            )}
          </>
        ) : (
          <>
            <div className="onboarding-result-tabs">
              <span className="text-text-muted">{t('onboarding.activity')}</span>
              <span className="border-b-2 border-accent pb-3 text-text-primary">
                {t('onboarding.files')} <span className="ml-1 text-text-muted">1</span>
              </span>
            </div>
            <motion.div animate={reveal(0)} className="onboarding-document">
              <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-3 text-[9px] uppercase tracking-[0.16em] text-slate-500">
                <span>NORD / {t('onboarding.proposal')}</span>
                <span>01 — 02</span>
              </div>
              <p className="text-[10px] uppercase tracking-[0.13em] text-slate-500">
                {t('onboarding.proposal')}
              </p>
              <h3 className="mb-3 mt-1 font-serif text-[24px] leading-tight text-[#102a4d]">
                {t('onboarding.documentTitle')}
              </h3>
              <motion.div animate={reveal(2)}>
                <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#102a4d]">
                  01 / {t('onboarding.objective')}
                </h4>
                <p className="mb-3 text-[11px] leading-5 text-slate-600">
                  {t('onboarding.documentObjective')}
                </p>
              </motion.div>
              <motion.div animate={reveal(3)}>
                <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#102a4d]">
                  02 / {t('onboarding.plan')}
                </h4>
                <div className="grid grid-cols-[1fr_auto] gap-y-1.5 border-y border-slate-200 py-2 text-[11px] text-slate-600">
                  <span>{t('onboarding.planResearch')}</span>
                  <span>€ 800</span>
                  <span>{t('onboarding.planDesign')}</span>
                  <span>€ 2.400</span>
                  <span>{t('onboarding.planDelivery')}</span>
                  <span>€ 1.600</span>
                  <span className="border-t border-slate-200 pt-2 font-semibold text-[#102a4d]">
                    {t('onboarding.total')}
                  </span>
                  <span className="border-t border-slate-200 pt-2 font-semibold text-[#102a4d]">
                    € 4.800
                  </span>
                </div>
              </motion.div>
            </motion.div>
            <motion.div animate={reveal(4)} className="onboarding-output-file">
              <FileText size={16} />
              <span>Proposta Nord.docx</span>
              <span className="ml-auto text-[10px] text-text-muted">
                {t('onboarding.openFile')}
              </span>
            </motion.div>
          </>
        )}
      </div>
      <div className="onboarding-demo-caption">
        <span>{t('onboarding.demoLabel')}</span>
        <button
          onClick={() => setReplay(replay + 1)}
          className="inline-flex items-center gap-1.5 hover:text-text-primary"
        >
          <RotateCcw size={12} />
          {t('onboarding.replay')}
        </button>
      </div>
    </div>
  );
}
