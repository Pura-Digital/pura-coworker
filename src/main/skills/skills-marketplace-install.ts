import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Skill } from '../../renderer/types';
import {
  marketplaceDownloadUrl,
  parseMarketplaceInstallRef,
  resolveSkillsMarketplaceBaseUrl,
  type SkillsMarketplaceDownloadResponse,
} from '../../shared/skills-marketplace';
import type { SkillsManager } from './skills-manager';
import { log, logError } from '../utils/logger';

function sanitizeRelativePath(relativePath: string): string {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  if (!normalized || normalized.startsWith('..') || path.isAbsolute(normalized)) {
    throw new Error(`Unsafe path in skill bundle: ${relativePath}`);
  }
  return normalized;
}

async function fetchSkillBundle(installRef: string): Promise<SkillsMarketplaceDownloadResponse> {
  const { owner, repo, skillSlug } = parseMarketplaceInstallRef(installRef);
  const url = marketplaceDownloadUrl(owner, repo, skillSlug, resolveSkillsMarketplaceBaseUrl());
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to download skill (${response.status})`);
  }

  return (await response.json()) as SkillsMarketplaceDownloadResponse;
}

function writeSkillBundleToDirectory(
  bundle: SkillsMarketplaceDownloadResponse,
  targetRoot: string
): void {
  if (!bundle.files?.length) {
    throw new Error('Skill download returned no files');
  }

  fs.mkdirSync(targetRoot, { recursive: true });

  for (const file of bundle.files) {
    const relativePath = sanitizeRelativePath(file.path);
    const destination = path.join(targetRoot, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, file.contents, 'utf-8');
  }

  const skillMdPath = path.join(targetRoot, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    throw new Error('Downloaded skill bundle is missing SKILL.md');
  }
}

export async function installSkillFromMarketplace(
  skillsManager: SkillsManager,
  installRef: string
): Promise<Skill> {
  const trimmed = installRef.trim();
  if (!trimmed) {
    throw new Error('Skill reference is required');
  }

  log(`[SkillsMarketplace] Installing skill: ${trimmed}`);
  const bundle = await fetchSkillBundle(trimmed);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pura-skill-'));

  try {
    writeSkillBundleToDirectory(bundle, tempRoot);
    return await skillsManager.installSkill(tempRoot);
  } catch (error) {
    logError('[SkillsMarketplace] Install failed:', error);
    throw error;
  } finally {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}
