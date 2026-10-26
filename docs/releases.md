# Releases and macOS ARM64 runners

Pushing a version tag starts `.github/workflows/release.yml`. The tag must match
`v` followed by the version in `package.json`.

## Rebuild an existing release

Use **Actions → Release → Run workflow**, select `main`, and enter the existing
release tag. Every job checks out that tag, and uploads target that same release.
The workflow definition comes from `main`, so runner fixes can be applied without
moving an existing tag or changing the application version.

The manual `arm64_runner` input overrides the repository default. For example:

```sh
gh workflow run release.yml --ref main \
  -f release_tag=v3.5.1 \
  -f arm64_runner=pura-release-arm64
```

## Configure a permanent runner

Automatic tag releases read the Actions repository variable `MACOS_ARM64_RUNNER`.
If unset, they use GitHub-hosted `macos-26`. Intel workers use `macos-15-intel`.

For a dedicated Apple Silicon Mac:

1. Register a repository runner with the custom label `pura-release-arm64`.
2. Install ARM64 Python 3.11+ (available as `python`), Xcode Command Line Tools,
   and Homebrew. Use a relocatable Python build whose shared library supports
   macOS 14 or older, such as python-build-standalone. A locally compiled Python
   can silently raise the application's minimum OS version; setting
   `MACOSX_DEPLOYMENT_TARGET` does not change an existing Python library.
   Ensure Node.js, Git, and the runner can access the network.
3. Keep the runner online under a dedicated build account. Allow enough disk space
   for two application bundles, Python/PyTorch runtimes, dependencies, and archives.
4. Set `MACOS_ARM64_RUNNER=pura-release-arm64` in the repository's Actions variables
   only after the dedicated runner is available.

That runner processes the ARM64 anonymization worker and the final macOS build.
Signing and notarization still use the repository's existing Actions secrets.
The workflow uses installed Python on this runner because `setup-python` assumes
the GitHub-hosted `/Users/runner/hostedtoolcache` location on macOS.

A personal Mac registered temporarily for an emergency release is not the permanent
runner. Deregister it after the release and leave the repository variable unset
until dedicated infrastructure is provisioned.

## Diagnose a queued job

An empty runner name and no executed steps mean the job has not started. Changing
application code or build scripts cannot fix runner allocation. Inspect the job's
annotations for capacity notices. Changing from one macOS ARM64 image to another
does not guarantee capacity; a dedicated runner avoids that shared hosted queue.

Runtime builds must complete before the final packaging jobs start. The ARM64
worker is built natively because it bundles architecture-specific Python and
PyTorch binaries; the final macOS job packages both ARM64 and Intel applications.

Runtimes travel between jobs inside `tar.gz` archives. Uploading their directories
directly loses executable permissions and framework symbolic links, which can
cause `codesign` to reject `Python.framework` as an ambiguous bundle.
