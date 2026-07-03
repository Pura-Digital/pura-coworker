import { Minus, Square, X, Copy } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import appLogo from '../assets/logo.png';

const isMac = typeof window !== 'undefined' && window.electronAPI?.platform === 'darwin';

function TitlebarBrand() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 shrink-0 titlebar-no-drag">
      <img
        src={appLogo}
        alt={t('common.appLogoAlt')}
        className="w-7 h-7 rounded-lg object-cover border border-border-subtle bg-background/60"
      />
      <span className="text-sm font-semibold tracking-[-0.02em] text-text-primary">Aiden</span>
    </div>
  );
}

export function Titlebar() {
  const { t } = useTranslation();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const api = window.electronAPI?.window;
    if (!api?.getChromeState || !api.onChromeState) return;

    void api.getChromeState().then((s) => setIsFullscreen(s.isFullscreen));
    return api.onChromeState((s) => setIsFullscreen(s.isFullscreen));
  }, []);

  const handleMinimize = () => {
    window.electronAPI?.window.minimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.window.maximize();
    setIsMaximized(!isMaximized);
  };

  const handleClose = () => {
    window.electronAPI?.window.close();
  };

  const windowControls = (
    <div className="flex items-center titlebar-no-drag h-full shrink-0">
      <button
        onClick={handleMinimize}
        className="w-12 h-full flex items-center justify-center hover:bg-surface transition-colors"
        title={t('window.minimize')}
      >
        <Minus className="w-4 h-4 text-text-secondary" />
      </button>
      <button
        onClick={handleMaximize}
        className="w-12 h-full flex items-center justify-center hover:bg-surface transition-colors"
        title={isMaximized ? t('window.restore') : t('window.maximize')}
      >
        {isMaximized ? (
          <Copy className="w-3.5 h-3.5 text-text-secondary" />
        ) : (
          <Square className="w-3.5 h-3.5 text-text-secondary" />
        )}
      </button>
      <button
        onClick={handleClose}
        className="w-12 h-full flex items-center justify-center hover:bg-red-500 transition-colors group"
        title={t('window.close')}
      >
        <X className="w-4 h-4 text-text-secondary group-hover:text-white" />
      </button>
    </div>
  );

  const macPadForTrafficLights = isMac && !isFullscreen;

  return (
    <div
      className={`h-10 bg-background-secondary border-b border-border flex items-center shrink-0 ${
        macPadForTrafficLights ? 'pl-20 titlebar-drag' : isMac ? 'pl-3 titlebar-drag' : 'titlebar-drag'
      }`}
    >
      {isMac ? (
        <>
          <div className="pr-3 shrink-0">
            <TitlebarBrand />
          </div>
          <div className="flex-1 min-w-0 h-full" />
        </>
      ) : (
        <>
          <div className="flex items-center h-full pl-3 pr-2 shrink-0">
            <TitlebarBrand />
          </div>
          <div className="flex-1 min-w-0 h-full" />
          {windowControls}
        </>
      )}
    </div>
  );
}
