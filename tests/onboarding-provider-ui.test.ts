import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const onboardingPath = path.resolve(process.cwd(), 'src/renderer/components/Onboarding.tsx');

describe('onboarding provider selection', () => {
  it('matches config sets: Pura Digital, Ollama, and Più modelli with protocol', () => {
    const source = fs.readFileSync(onboardingPath, 'utf8');

    expect(source).toContain("(['pura', 'ollama', 'custom'] as const)");
    expect(source).toContain('applyPuraDigitalSetup');
    expect(source).toContain('applyCustomModelsSetup');
    expect(source).toContain('protocolTabToLogoId');
    expect(source).toContain('changeProtocol');

    expect(source).not.toContain('value="openai"');
    expect(source).not.toContain('value="openrouter"');
    expect(source).not.toContain('changeProvider(e.target.value as ProviderType)');
  });
});
