import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

const contextPanelPath = path.resolve(process.cwd(), 'src/renderer/components/ContextPanel.tsx');
const artifactStepsPath = path.resolve(process.cwd(), 'src/renderer/utils/artifact-steps.ts');

describe('ContextPanel recent workspace files integration', () => {
  it('loads recent workspace files through electron artifacts API', () => {
    const source = fs.readFileSync(contextPanelPath, 'utf8');
    expect(source).toContain('window.electronAPI?.artifacts?.listRecentFiles');
    expect(source).toContain('setRecentWorkspaceFiles');
  });

  it('merges recent workspace files into the displayed artifacts list', () => {
    const source = fs.readFileSync(contextPanelPath, 'utf8');
    expect(source).toContain('getArtifactCatalog(steps, recentWorkspaceFiles, currentWorkingDir)');

    const artifactSource = fs.readFileSync(artifactStepsPath, 'utf8');
    expect(artifactSource).toContain('for (const file of recentFiles)');
  });
});
