/** Hidden workspace folder for Aiden-generated outputs and session artifacts. */
export const AIDEN_DIR_NAME = '.aiden';

/** Default directory for generated deliverables (slides, exports, renders). */
export const AIDEN_ARTIFACTS_DIR_NAME = 'artifacts';

export function getAidenDirRelative(): string {
  return AIDEN_DIR_NAME;
}

export function getAidenArtifactsDirRelative(): string {
  return `${AIDEN_DIR_NAME}/${AIDEN_ARTIFACTS_DIR_NAME}`;
}

export function joinAidenArtifactsDir(workspaceRoot: string): string {
  return `${workspaceRoot.replace(/[/\\]+$/, '')}/${getAidenArtifactsDirRelative()}`;
}
