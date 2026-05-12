import { Layers } from 'lucide-react';
import openrouterLogo from '../assets/openrouter_logo.svg';
import anthropicLogo from '../assets/anthropic_logo.svg';
import openaiLogo from '../assets/openai_logo.svg';
import googleLogo from '../assets/google_logo.svg';
import ollamaLogo from '../assets/ollama_logo.svg';
import puraLogo from '../assets/puradigital_logo.svg';

/** Visual id for the shared white “chip” (SVG path or built-in icon). */
export type ProviderLogoId =
  | 'openrouter'
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'ollama'
  | 'pura'
  | 'custom';

const LOGO_SRC: Partial<Record<ProviderLogoId, string>> = {
  openrouter: openrouterLogo,
  anthropic: anthropicLogo,
  openai: openaiLogo,
  gemini: googleLogo,
  ollama: ollamaLogo,
  pura: puraLogo,
};

export function providerTabToLogoId(tab: string): ProviderLogoId | null {
  if (tab === 'custom') return 'custom';
  if (tab === 'pura') return 'pura';
  if (tab in LOGO_SRC) return tab as ProviderLogoId;
  return null;
}

/** Custom-protocol tabs reuse the same assets (Gemini → Google logo). */
export function protocolTabToLogoId(id: 'anthropic' | 'openai' | 'gemini'): ProviderLogoId {
  return id;
}

interface ProviderLogoBadgeProps {
  id: ProviderLogoId | null;
  className?: string;
}

const badgeFrameClass =
  'inline-flex h-8 min-w-[1.75rem] shrink-0 items-center justify-center rounded-md bg-white px-1.5 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]';

/**
 * Provider mark on a light neutral plate so SVG colors stay legible on dark and light UI.
 */
export function ProviderLogoBadge({ id, className }: ProviderLogoBadgeProps) {
  if (!id) return null;
  if (id === 'custom') {
    return (
      <span className={`${badgeFrameClass} ${className ?? ''}`} aria-hidden>
        <Layers className="h-3.5 w-3.5 text-slate-600" strokeWidth={2} />
      </span>
    );
  }
  const src = LOGO_SRC[id];
  if (!src) return null;
  return (
    <span className={`${badgeFrameClass} ${className ?? ''}`} aria-hidden>
      <img
        src={src}
        alt=""
        className="h-[15px] w-auto max-w-[4.25rem] object-contain object-center"
      />
    </span>
  );
}
