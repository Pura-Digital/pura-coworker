#!/usr/bin/env node

/**
 * Prepare/bundle GUI helper tools for packaging.
 *
 * Currently:
 * - macOS: bundles `cliclick` into `resources/tools/darwin-{arch}/bin/cliclick`
 *
 * This makes packaged apps work without requiring end users to install Homebrew tools.
 */

const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const CLICLICK_REPO = 'https://github.com/BlueM/cliclick.git';
const CLICLICK_TAG = '5.1';
const BREW_FORMULA_API = 'https://formulae.brew.sh/api/formula/cliclick.json';
const ARM64_BOTTLE_TAGS = [
  'arm64_tahoe',
  'arm64_sequoia',
  'arm64_sonoma',
  'arm64_ventura',
  'arm64_monterey',
  'arm64_big_sur',
  'arm64_golden_gate',
];
const X64_BOTTLE_TAGS = ['sonoma', 'ventura', 'monterey', 'big_sur'];
const args = process.argv.slice(2);
const WANTS_ALL =
  process.env.COLAV_PREPARE_ALL_GUI_TOOLS === '1' || args.includes('--all');

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function tryExecFile(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

function detectBinaryArch(filePath) {
  const out = tryExecFile('/usr/bin/file', ['-b', filePath]);
  if (!out) return null;

  const hasArm64 = out.includes('arm64');
  const hasX64 = out.includes('x86_64');
  const isUniversal = out.includes('universal') || (hasArm64 && hasX64);

  if (isUniversal) return 'universal';
  if (hasArm64) return 'arm64';
  if (hasX64) return 'x64';
  return null;
}

function copyExecutable(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
  console.log(`✓ Bundled: ${src} -> ${dest}`);
}

function requestBuffer(url, headers = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error(`Too many redirects for ${url}`));
      return;
    }

    const requestUrl = new URL(url);
    const client = requestUrl.protocol === 'http:' ? require('http') : https;

    client
      .get(requestUrl, { headers }, (response) => {
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
          const nextUrl = new URL(response.headers.location, requestUrl).toString();
          const nextHost = new URL(nextUrl).host;
          const nextHeaders = nextHost === requestUrl.host ? headers : {};
          requestBuffer(nextUrl, nextHeaders, redirectCount + 1).then(resolve).catch(reject);
          response.resume();
          return;
        }

        if (status !== 200) {
          reject(new Error(`HTTP ${status} for ${url}`));
          response.resume();
          return;
        }

        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

async function fetchJson(url) {
  const buffer = await requestBuffer(url);
  return JSON.parse(buffer.toString('utf8'));
}

async function getGhcrBlob(url) {
  const tokenResponse = await fetchJson(
    'https://ghcr.io/token?scope=repository:homebrew/core/cliclick:pull'
  );
  const token = tokenResponse.token;
  if (!token) {
    throw new Error('Failed to obtain GHCR token for cliclick bottle');
  }

  return requestBuffer(url, {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.oci.image.layer.v1.tar+gzip',
  });
}

function findBottleEntry(files, targetArch) {
  const preferredTags = targetArch === 'arm64' ? ARM64_BOTTLE_TAGS : X64_BOTTLE_TAGS;
  for (const tag of preferredTags) {
    if (files[tag]) {
      return { tag, ...files[tag] };
    }
  }
  return null;
}

async function downloadCliclickFromHomebrewBottle(targetArch, outputPath) {
  const formula = await fetchJson(BREW_FORMULA_API);
  const files = formula?.bottle?.stable?.files;
  if (!files) {
    throw new Error('Homebrew API did not return cliclick bottle metadata');
  }

  const bottle = findBottleEntry(files, targetArch);
  if (!bottle?.url) {
    throw new Error(`No Homebrew bottle found for cliclick (${targetArch})`);
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cliclick-bottle-'));
  console.log(
    `[prepare:gui-tools] Downloading cliclick (${targetArch}) bottle (${bottle.tag})`
  );

  try {
    const archive = await getGhcrBlob(bottle.url);
    const archivePath = path.join(workDir, 'bottle.tar.gz');
    fs.writeFileSync(archivePath, archive);
    execSync(`tar -xzf "${archivePath}"`, { cwd: workDir, stdio: 'inherit' });

    const matches = execSync(`find "${workDir}" -name cliclick -type f`, {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);

    if (matches.length === 0) {
      throw new Error('cliclick binary not found inside Homebrew bottle');
    }

    const binaryPath = matches[0];
    const builtArch = detectBinaryArch(binaryPath);
    if (builtArch !== targetArch && builtArch !== 'universal') {
      throw new Error(`Homebrew bottle arch mismatch: expected ${targetArch}, got ${builtArch ?? 'unknown'}`);
    }

    copyExecutable(binaryPath, outputPath);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function buildCliclickFromSource(targetArch, outputPath) {
  if (process.platform !== 'darwin') {
    throw new Error(`Cannot build cliclick for ${targetArch} on non-macOS host`);
  }

  const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cliclick-build-'));
  console.log(`[prepare:gui-tools] Building cliclick (${targetArch}) from source in ${buildDir}`);

  try {
    execSync(`git clone --depth 1 --branch ${CLICLICK_TAG} ${CLICLICK_REPO} "${buildDir}"`, {
      stdio: 'inherit',
    });

    // Homebrew uses MACOSX_DEPLOYMENT_TARGET=14.0 on Sequoia+ to avoid
    // CGWindowListCreateImage being unavailable in the macOS 15 SDK.
    const deploymentTarget = 'MACOSX_DEPLOYMENT_TARGET=14.0';
    const makeCmd = targetArch === 'x64'
      ? `${deploymentTarget} SDKROOT=$(xcrun --sdk macosx --show-sdk-path) arch -x86_64 make`
      : `${deploymentTarget} make`;

    execSync(makeCmd, { cwd: buildDir, stdio: 'inherit', shell: '/bin/bash' });

    const builtBinary = path.join(buildDir, 'cliclick');
    if (!exists(builtBinary)) {
      throw new Error(`cliclick build finished but binary not found at ${builtBinary}`);
    }

    const builtArch = detectBinaryArch(builtBinary);
    if (builtArch !== targetArch && builtArch !== 'universal') {
      throw new Error(`Expected cliclick ${targetArch}, got ${builtArch ?? 'unknown'}`);
    }

    copyExecutable(builtBinary, outputPath);
  } finally {
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
}

async function ensureCliclick(targetArch, outputPath) {
  if (exists(outputPath)) {
    return;
  }

  try {
    await downloadCliclickFromHomebrewBottle(targetArch, outputPath);
    return;
  } catch (bottleError) {
    console.warn(
      `[prepare:gui-tools] Homebrew bottle download failed for ${targetArch}: ${bottleError.message}`
    );
  }

  buildCliclickFromSource(targetArch, outputPath);
}

async function main() {
  if (process.platform !== 'darwin') {
    console.log('[prepare:gui-tools] Non-macOS platform, skipping.');
    return;
  }

  const projectRoot = path.join(__dirname, '..');
  const toolsRoot = path.join(projectRoot, 'resources', 'tools');
  const outDirs = {
    arm64: path.join(toolsRoot, 'darwin-arm64', 'bin'),
    x64: path.join(toolsRoot, 'darwin-x64', 'bin'),
  };

  ensureDir(outDirs.arm64);
  ensureDir(outDirs.x64);

  const outputArm = path.join(outDirs.arm64, 'cliclick');
  const outputX64 = path.join(outDirs.x64, 'cliclick');

  let bundledArm = exists(outputArm);
  let bundledX64 = exists(outputX64);

  if (bundledArm && bundledX64) {
    console.log('[prepare:gui-tools] cliclick already present for both arm64 and x64.');
    return;
  }

  const candidates = new Set([
    '/opt/homebrew/bin/cliclick',
    '/usr/local/bin/cliclick',
  ]);

  const whichPath = tryExecFile('/usr/bin/which', ['cliclick']);
  if (whichPath) candidates.add(whichPath);

  const found = [...candidates].filter(exists);

  if (found.length === 0 && !WANTS_ALL) {
    const msg =
      '\n[prepare:gui-tools] ERROR: `cliclick` was not found on this build machine.\n' +
      'Install it once and rebuild:\n' +
      '  brew install cliclick\n\n' +
      'Or place binaries manually:\n' +
      `  ${outputArm}\n` +
      `  ${outputX64}\n`;
    console.error(msg);
    process.exitCode = 1;
    return;
  }

  for (const src of found) {
    const arch = detectBinaryArch(src);
    if (!arch) continue;

    if (arch === 'universal') {
      if (!bundledArm) copyExecutable(src, outputArm);
      if (!bundledX64) copyExecutable(src, outputX64);
      bundledArm = true;
      bundledX64 = true;
      break;
    }

    if (arch === 'arm64' && !bundledArm) {
      copyExecutable(src, outputArm);
      bundledArm = true;
    }

    if (arch === 'x64' && !bundledX64) {
      copyExecutable(src, outputX64);
      bundledX64 = true;
    }
  }

  if (WANTS_ALL) {
    try {
      if (!bundledArm) {
        await ensureCliclick('arm64', outputArm);
        bundledArm = true;
      }
      if (!bundledX64) {
        await ensureCliclick('x64', outputX64);
        bundledX64 = true;
      }
    } catch (error) {
      console.error('[prepare:gui-tools] ERROR:', error?.message || error);
      process.exitCode = 1;
      return;
    }
  }

  const currentArch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const currentOk = currentArch === 'arm64' ? bundledArm : bundledX64;

  if (!currentOk) {
    const msg =
      `\n[prepare:gui-tools] ERROR: Found cliclick, but none matched current arch (${process.arch}).\n` +
      'Please install the correct Homebrew (arm64 under /opt/homebrew, x64 under /usr/local) or provide the binary manually.\n';
    console.error(msg);
    process.exitCode = 1;
    return;
  }

  if (WANTS_ALL && (!bundledArm || !bundledX64)) {
    console.error(
      '[prepare:gui-tools] ERROR: --all requires cliclick for both arm64 and x64, but one or both are still missing.'
    );
    process.exitCode = 1;
    return;
  }

  if (!bundledArm || !bundledX64) {
    console.warn(
      `[prepare:gui-tools] Warning: cliclick bundled for ${bundledArm ? 'arm64' : ''}${bundledArm && bundledX64 ? ' & ' : ''}${bundledX64 ? 'x64' : ''}. ` +
        'If you build DMGs for both arch, run with --all or install both Homebrew prefixes.'
    );
  }
}

main().catch((error) => {
  console.error('[prepare:gui-tools] ERROR:', error?.message || error);
  process.exitCode = 1;
});
