import archiveyeLogo from '../assets/logo_archiveye.svg';

const PRESET_LOGOS: Record<string, string> = {
  archiveye: archiveyeLogo,
};

const badgeFrameClass =
  'inline-flex h-8 w-10 shrink-0 items-center justify-center rounded-md bg-white px-1.5 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]';

interface McpPresetLogoProps {
  presetKey: string;
  className?: string;
}

export function McpPresetLogo({ presetKey, className }: McpPresetLogoProps) {
  const src = PRESET_LOGOS[presetKey];
  if (!src) return null;

  return (
    <span className={[badgeFrameClass, className].filter(Boolean).join(' ')}>
      <img src={src} alt="" className="h-3.5 w-auto max-w-[2rem] object-contain" />
    </span>
  );
}
