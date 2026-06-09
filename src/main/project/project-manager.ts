/**
 * @module main/project/project-manager
 *
 * Manages the lifecycle of Projects — named workspaces that group chat sessions
 * with optional dedicated MCP connectors and skill overrides.
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import { app } from 'electron';
import { join } from 'path';
import type { DatabaseInstance, ProjectRow, SessionRow } from '../db/database';
import type { Session } from '../../renderer/types';
import type { IpcProject, IpcProjectCreateInput, IpcProjectUpdateInput, McpServerConfig } from '../../shared/ipc-types';
import { log } from '../utils/logger';

function rowToProject(row: ProjectRow): IpcProject {
  return {
    id: row.id,
    name: row.name,
    workDir: row.work_dir,
    description: row.description ?? undefined,
    mcpServers: safeParseJson<McpServerConfig[]>(row.mcp_servers, []),
    mcpMode: (row.mcp_mode as IpcProject['mcpMode']) ?? undefined,
    skillIds: safeParseJson<string[]>(row.skill_ids, []),
    skillsMode: (row.skills_mode as IpcProject['skillsMode']) ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeParseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export class ProjectManager {
  private db: DatabaseInstance;

  constructor(db: DatabaseInstance) {
    this.db = db;
  }

  private getDefaultWorkDir(): string {
    return join(app.getPath('userData'), 'default_working_dir');
  }

  private validateWorkDir(workDir: string): void {
    const defaultWorkDir = this.getDefaultWorkDir();
    if (!workDir || workDir.trim() === '') {
      throw new Error('Working directory is required for a project.');
    }
    const normalized = workDir.replace(/\\/g, '/').replace(/\/+$/, '');
    const normalizedDefault = defaultWorkDir.replace(/\\/g, '/').replace(/\/+$/, '');
    if (normalized === normalizedDefault) {
      throw new Error('Projects cannot use the app default working directory. Please choose a custom directory.');
    }
    if (!fs.existsSync(workDir)) {
      throw new Error(`Working directory does not exist: ${workDir}`);
    }
    const stat = fs.statSync(workDir);
    if (!stat.isDirectory()) {
      throw new Error(`Working directory path is not a directory: ${workDir}`);
    }
  }

  createProject(input: IpcProjectCreateInput): IpcProject {
    this.validateWorkDir(input.workDir);

    const now = Date.now();
    const row: ProjectRow = {
      id: uuidv4(),
      name: input.name.trim(),
      work_dir: input.workDir,
      description: input.description?.trim() ?? null,
      mcp_servers: '[]',
      mcp_mode: null,
      skill_ids: '[]',
      skills_mode: null,
      created_at: now,
      updated_at: now,
    };

    this.db.projects.create(row);
    log('[ProjectManager] Created project:', row.id, row.name);
    return rowToProject(row);
  }

  listProjects(): IpcProject[] {
    return this.db.projects.getAll().map(rowToProject);
  }

  getProject(id: string): IpcProject | null {
    const row = this.db.projects.get(id);
    return row ? rowToProject(row) : null;
  }

  updateProject(id: string, updates: IpcProjectUpdateInput): IpcProject {
    const existing = this.db.projects.get(id);
    if (!existing) {
      throw new Error(`Project not found: ${id}`);
    }

    const patch: Partial<ProjectRow> = {};
    if (updates.name !== undefined) patch.name = updates.name.trim();
    if (updates.description !== undefined) patch.description = updates.description?.trim() ?? null;
    if (updates.mcpServers !== undefined) patch.mcp_servers = JSON.stringify(updates.mcpServers);
    if ('mcpMode' in updates) patch.mcp_mode = updates.mcpMode ?? null;
    if (updates.skillIds !== undefined) patch.skill_ids = JSON.stringify(updates.skillIds);
    if ('skillsMode' in updates) patch.skills_mode = updates.skillsMode ?? null;

    this.db.projects.update(id, patch);
    log('[ProjectManager] Updated project:', id);

    const updated = this.db.projects.get(id)!;
    return rowToProject(updated);
  }

  deleteProject(id: string): void {
    const existing = this.db.projects.get(id);
    if (!existing) {
      throw new Error(`Project not found: ${id}`);
    }
    this.db.projects.delete(id);
    log('[ProjectManager] Deleted project:', id);
  }

  moveSessionToProject(sessionId: string, projectId: string | null): void {
    if (projectId !== null) {
      const project = this.db.projects.get(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
    }
    this.db.sessions.update(sessionId, { project_id: projectId } as Partial<SessionRow>);
    log('[ProjectManager] Moved session', sessionId, 'to project', projectId);
  }

  getProjectSessions(projectId: string): Session[] {
    const rows = this.db.projects.getSessionsByProjectId(projectId);
    return rows.map((row) => {
      let mountedPaths: Session['mountedPaths'] = [];
      let allowedTools: string[] = [];
      try { mountedPaths = JSON.parse(row.mounted_paths); } catch { /* empty */ }
      try { allowedTools = JSON.parse(row.allowed_tools); } catch { /* empty */ }
      return {
        id: row.id,
        title: row.title,
        claudeSessionId: row.claude_session_id || undefined,
        openaiThreadId: row.openai_thread_id || undefined,
        status: row.status as Session['status'],
        cwd: row.cwd || undefined,
        mountedPaths,
        allowedTools,
        memoryEnabled: row.memory_enabled === 1,
        model: row.model || undefined,
        projectId: row.project_id || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }

  /**
   * Resolve MCP servers to use for a project session, applying merge/replace logic.
   * @param projectId - the project id
   * @param globalEnabledServers - the globally-enabled MCP servers
   */
  resolveProjectMcpServers(
    projectId: string,
    globalEnabledServers: McpServerConfig[]
  ): McpServerConfig[] {
    const project = this.db.projects.get(projectId);
    if (!project) return globalEnabledServers;

    const projectServers = safeParseJson<McpServerConfig[]>(project.mcp_servers, []);
    const mode = project.mcp_mode;

    if (!mode || projectServers.length === 0) {
      return globalEnabledServers;
    }
    if (mode === 'replace') {
      return projectServers.filter((s) => s.enabled);
    }
    // merge: deduplicate by id — project servers override global ones with same id
    const merged = new Map<string, McpServerConfig>();
    for (const s of globalEnabledServers) merged.set(s.id, s);
    for (const s of projectServers) merged.set(s.id, s);
    return Array.from(merged.values()).filter((s) => s.enabled);
  }

  /**
   * Resolve skill IDs to use for a project session, applying merge/replace logic.
   * @param projectId - the project id
   * @param globalEnabledSkillIds - IDs of globally-enabled skills
   */
  resolveProjectSkillIds(projectId: string, globalEnabledSkillIds: string[]): string[] {
    const project = this.db.projects.get(projectId);
    if (!project) return globalEnabledSkillIds;

    const projectSkillIds = safeParseJson<string[]>(project.skill_ids, []);
    const mode = project.skills_mode;

    if (!mode || projectSkillIds.length === 0) {
      return globalEnabledSkillIds;
    }
    if (mode === 'replace') {
      return projectSkillIds;
    }
    // merge: union of global + project, deduplicated
    const merged = new Set([...globalEnabledSkillIds, ...projectSkillIds]);
    return Array.from(merged);
  }
}

let projectManagerInstance: ProjectManager | null = null;

export function initProjectManager(db: DatabaseInstance): ProjectManager {
  projectManagerInstance = new ProjectManager(db);
  return projectManagerInstance;
}

export function getProjectManager(): ProjectManager {
  if (!projectManagerInstance) {
    throw new Error('ProjectManager not initialized. Call initProjectManager() first.');
  }
  return projectManagerInstance;
}

export function tryGetProjectManager(): ProjectManager | null {
  return projectManagerInstance;
}
