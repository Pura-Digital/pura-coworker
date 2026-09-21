#!/usr/bin/env node

/**
 * Generate release/latest-mac.yml for electron-updater from built mac artifacts.
 *
 * electron-builder normally writes this file, but multi-arch mac builds in CI can
 * finish without it. This script is a deterministic fallback used before upload.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const RELEASE_DIR = path.join(PROJECT_ROOT, 'release');
const PRODUCT_NAME = 'Aiden';

function hashFile(filePath) {
  const hash = crypto.createHash('sha512');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('base64');
}

function archFromArtifactName(name) {
  if (name.includes('-mac-arm64.')) return 'arm64';
  if (name.includes('-mac-x64.')) return 'x64';
  return null;
}

function yamlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildYaml({ version, files, primary }) {
  const lines = [`version: ${version}`, 'files:'];
  for (const file of files) {
    lines.push(`  - url: ${file.url}`);
    lines.push(`    sha512: ${file.sha512}`);
    lines.push(`    size: ${file.size}`);
    if (file.arch) {
      lines.push(`    arch: ${file.arch}`);
    }
  }
  lines.push(`path: ${primary.url}`);
  lines.push(`sha512: ${primary.sha512}`);
  lines.push(`releaseDate: ${yamlQuote(new Date().toISOString())}`);
  return `${lines.join('\n')}\n`;
}

function main() {
  const version = require(path.join(PROJECT_ROOT, 'package.json')).version;
  if (!fs.existsSync(RELEASE_DIR)) {
    throw new Error(`Release directory not found: ${RELEASE_DIR}`);
  }

  const artifacts = fs
    .readdirSync(RELEASE_DIR)
    .filter((name) => {
      const prefix = `${PRODUCT_NAME}-${version}-mac-`;
      return name.startsWith(prefix) && (name.endsWith('.zip') || name.endsWith('.dmg'));
    })
    .sort();

  if (artifacts.length === 0) {
    throw new Error(`No macOS artifacts found for ${PRODUCT_NAME} ${version} in ${RELEASE_DIR}`);
  }

  const files = artifacts.map((name) => {
    const filePath = path.join(RELEASE_DIR, name);
    const stat = fs.statSync(filePath);
    const entry = {
      url: name,
      sha512: hashFile(filePath),
      size: stat.size,
      arch: archFromArtifactName(name),
    };
    return entry;
  });

  const primary =
    files.find((file) => file.url.endsWith('.zip') && file.arch === 'arm64') ||
    files.find((file) => file.url.endsWith('.zip')) ||
    files[0];

  const outputPath = path.join(RELEASE_DIR, 'latest-mac.yml');
  const yaml = buildYaml({ version, files, primary: primary });
  fs.writeFileSync(outputPath, yaml, 'utf8');

  console.log(`✓ Wrote ${outputPath}`);
  console.log(`  artifacts: ${artifacts.join(', ')}`);
}

main();
