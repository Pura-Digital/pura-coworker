import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ExternalLink,
  Loader2,
  Mic,
  MicOff,
  PlugZap,
  Sparkles,
  Unplug,
  Settings,
} from 'lucide-react';
import { useAppStore } from '../store';
import { useAppConfig } from '../store/selectors';
import { useIPC } from '../hooks/useIPC';
import { usePuraRealtimeVoice, PuraVoiceUiStatus } from '../hooks/usePuraRealtimeVoice';
import { isPuraDigitalFromAppConfig } from '../../shared/pura-digital';

const PLATFORM_URL = 'https://platform.puradigital.it';

function PuraVoiceIcon({ status, volume }: { status: PuraVoiceUiStatus; volume: number }) {
  const isDisconnected = status === 'idle' || status === 'error';
  const isIdle = status === 'connected' || status === 'connecting';
  const isListening = status === 'listening';

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-surface border border-border-subtle shadow-sm transition-colors duration-300">
      <AnimatePresence mode="wait">
        {isDisconnected && (
          <motion.div
            key="disconnected"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-surface-muted"
          >
            {/* Liquid effect inside the fixed circle */}
            <motion.div
              className="absolute inset-[-30%] bg-gradient-to-br from-accent/30 to-transparent"
              animate={{
                rotate: [0, 180, 360],
                borderRadius: [
                  '40% 60% 70% 30% / 40% 50% 60% 50%',
                  '70% 30% 50% 50% / 30% 30% 70% 70%',
                  '40% 60% 70% 30% / 40% 50% 60% 50%',
                ],
              }}
              transition={{ duration: 6, ease: 'linear', repeat: Infinity }}
            />
            <motion.div
              className="absolute inset-[-30%] bg-gradient-to-tl from-accent/30 to-transparent"
              animate={{
                rotate: [360, 180, 0],
                borderRadius: [
                  '70% 30% 50% 50% / 30% 30% 70% 70%',
                  '40% 60% 70% 30% / 40% 50% 60% 50%',
                  '70% 30% 50% 50% / 30% 30% 70% 70%',
                ],
              }}
              transition={{ duration: 8, ease: 'linear', repeat: Infinity }}
            />
            <Unplug className="relative z-10 h-5 w-5 text-text-secondary/80" />
          </motion.div>
        )}

        {isIdle && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-accent/10"
          >
            {/* Tremor effect */}
            <motion.div
              className="absolute inset-0 rounded-full bg-accent/20"
              animate={{
                x: [-1, 1, -1, 1, 0],
                y: [-1, 1, 1, -1, 0],
              }}
              transition={{
                duration: 0.4,
                repeat: Infinity,
                repeatType: 'mirror',
                repeatDelay: 3,
              }}
            />
            {status === 'connecting' ? (
              <Loader2 className="relative z-10 h-5 w-5 text-accent animate-spin" />
            ) : (
              <Mic className="relative z-10 h-5 w-5 text-accent" />
            )}
          </motion.div>
        )}

        {isListening && (
          <motion.div
            key="listening"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-accent"
          >
            {/* Sound reactive effect */}
            <motion.div
              className="absolute inset-0 rounded-full bg-white/30"
              animate={{ scale: 1 + volume * 0.6 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            />
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-white/50"
              animate={{ scale: 1 + volume * 1.5, opacity: Math.max(0, 1 - volume * 2) }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            />
            <Mic className="relative z-10 h-5 w-5 text-white" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function PuraVoiceFloatingButton() {
  const { t } = useTranslation();
  const { isElectron } = useIPC();
  const appConfig = useAppConfig();
  const isPura = isPuraDigitalFromAppConfig(appConfig);

  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const setSettingsTab = useAppStore((s) => s.setSettingsTab);

  const { status, errorMessage, micVolume, connectRealtime, disconnectAll, toggleMic } =
    usePuraRealtimeVoice();

  const [isOpen, setIsOpen] = useState(false);

  const openPlatform = () => {
    void window.electronAPI?.openExternal(PLATFORM_URL);
  };

  const openApiSettings = () => {
    setSettingsTab('api');
    setShowSettings(true);
  };

  if (!isElectron) {
    return null;
  }

  // Framer motion variants for the popover panel
  const panelVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95, pointerEvents: 'none' as const },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      pointerEvents: 'auto' as const,
      transition: { type: 'spring', damping: 25, stiffness: 300 },
    },
    exit: {
      opacity: 0,
      y: 15,
      scale: 0.95,
      pointerEvents: 'none' as const,
      transition: { duration: 0.2 },
    },
  };

  return (
    <div
      className="fixed bottom-6 right-6 z-[200] flex flex-col items-end gap-3"
      aria-live="polite"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
    >
      <AnimatePresence>
        {isOpen && (
          <motion.div
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="w-[min(20rem,calc(100vw-3rem))] overflow-hidden rounded-2xl border border-border-subtle bg-surface/95 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.15)] backdrop-blur-xl"
            id="pura-voice-fab-panel"
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                <span className="text-sm font-semibold leading-tight text-text-primary">
                  {t('puraVoiceFab.title')}
                </span>
              </div>
              <p className="text-xs leading-snug text-text-muted">{t('puraVoiceFab.badge')}</p>

              {isPura ? (
                <>
                  <p className="text-xs leading-snug text-text-secondary">
                    {t('puraVoiceFab.hintPura')}
                  </p>
                  {errorMessage && status === 'error' && (
                    <p className="text-xs leading-snug text-error">
                      {t('puraVoiceFab.errorPrefix')}: {errorMessage}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {status === 'idle' || status === 'error' ? (
                      <button
                        type="button"
                        onClick={() => void connectRealtime()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-accent-hover"
                      >
                        <PlugZap className="h-3.5 w-3.5" aria-hidden />
                        {t('puraVoiceFab.connect')}
                      </button>
                    ) : null}
                    {status === 'connecting' ? (
                      <span className="inline-flex items-center gap-2 text-xs text-text-muted px-1 py-1.5">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        {t('puraVoiceFab.connecting')}
                      </span>
                    ) : null}
                    {status === 'connected' || status === 'listening' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void toggleMic()}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm transition ${
                            status === 'listening'
                              ? 'bg-success/20 text-success hover:bg-success/30'
                              : 'bg-surface-active text-text-primary hover:bg-surface-hover'
                          }`}
                        >
                          {status === 'listening' ? (
                            <MicOff className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <Mic className="h-3.5 w-3.5" aria-hidden />
                          )}
                          {status === 'listening'
                            ? t('puraVoiceFab.toggleMicStop')
                            : t('puraVoiceFab.toggleMicStart')}
                        </button>
                        <button
                          type="button"
                          onClick={disconnectAll}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-muted px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-surface-hover"
                        >
                          <Unplug className="h-3.5 w-3.5" aria-hidden />
                          {t('puraVoiceFab.disconnect')}
                        </button>
                      </>
                    ) : null}
                    {status === 'listening' ? (
                      <span className="w-full text-xs font-medium text-accent pt-1">
                        {t('puraVoiceFab.listening')}
                      </span>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs leading-snug text-text-secondary">
                    {t('puraVoiceFab.hintSwitch')}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      onClick={openPlatform}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-accent-hover"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      {t('puraVoiceFab.openPlatform')}
                    </button>
                    <button
                      type="button"
                      onClick={openApiSettings}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-muted px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-surface-hover"
                    >
                      <Settings className="h-3.5 w-3.5" aria-hidden />
                      {t('puraVoiceFab.openApiSettings')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        className="pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent shadow-lg"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label={t('puraVoiceFab.fabAria')}
        aria-expanded={isOpen}
        aria-controls="pura-voice-fab-panel"
        onClick={() => setIsOpen(!isOpen)}
      >
        <PuraVoiceIcon status={status} volume={micVolume} />
      </motion.button>
    </div>
  );
}
