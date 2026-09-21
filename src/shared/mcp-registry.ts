import type { McpServerConfig } from './ipc-types';

export const MCP_REGISTRY_BASE_URL = 'https://registry.modelcontextprotocol.io';

export type McpRegistryPackageArgument = {
  type?: string;
  value?: string;
  valueHint?: string;
  description?: string;
  default?: string;
  isRequired?: boolean;
  isRepeated?: boolean;
};

export type McpRegistryPackage = {
  registryType?: string;
  identifier?: string;
  version?: string;
  transport?: { type?: string };
  packageArguments?: McpRegistryPackageArgument[];
  environmentVariables?: Array<{
    name: string;
    description?: string;
    isRequired?: boolean;
    isSecret?: boolean;
    default?: string;
  }>;
};

export type McpRegistryRemote = {
  type?: string;
  url?: string;
};

export type McpRegistryServerJson = {
  name: string;
  title?: string;
  description?: string;
  version?: string;
  websiteUrl?: string;
  repository?: { url?: string };
  packages?: McpRegistryPackage[];
  remotes?: McpRegistryRemote[];
};

export type McpRegistryListEntry = {
  server: McpRegistryServerJson;
};

export type McpRegistryListResponse = {
  servers: McpRegistryListEntry[];
  metadata?: {
    count?: number;
    nextCursor?: string | null;
  };
};

export type McpMarketplaceArgField = {
  key: string;
  label: string;
  description?: string;
  isRequired: boolean;
  defaultValue?: string;
  isPath: boolean;
  isSecret: boolean;
};

export type McpMarketplaceItem = {
  registryName: string;
  title: string;
  description: string;
  version: string;
  connectionType: 'local' | 'remote';
  sourceLabel: 'community';
  websiteUrl?: string;
  repositoryUrl?: string;
  requiresConfiguration: boolean;
  requiredEnv: string[];
  optionalEnv: string[];
  envDescription: Record<string, string>;
  envSecrets: Record<string, boolean>;
  requiredArgs: McpMarketplaceArgField[];
  optionalArgs: McpMarketplaceArgField[];
  packageIdentifier?: string;
  npmPackage?: McpRegistryPackage;
  config: Omit<McpServerConfig, 'id' | 'enabled'>;
};

export type McpMarketplaceConfiguration = {
  env: Record<string, string>;
  args: Record<string, string>;
  displayName?: string;
};

const KNOWN_ACRONYMS = new Set(['mcp', 'api', 'ai', 'cc', 'ae']);

function humanizeRegistryName(name: string): string {
  const segment = name.split('/').pop() || name;
  return segment
    .split(/[-_]/g)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (KNOWN_ACRONYMS.has(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function pickNpmPackage(packages: McpRegistryPackage[] | undefined): McpRegistryPackage | null {
  if (!packages?.length) return null;
  const npm = packages.find((pkg) => pkg.registryType === 'npm' && pkg.identifier);
  return npm ?? null;
}

function pickRemote(remotes: McpRegistryRemote[] | undefined): McpRegistryRemote | null {
  if (!remotes?.length) return null;
  return (
    remotes.find((remote) => remote.type === 'streamable-http' && remote.url) ??
    remotes.find((remote) => remote.type === 'sse' && remote.url) ??
    remotes.find((remote) => remote.url) ??
    null
  );
}

function isPathLikeHint(value: string): boolean {
  const hint = value.toLowerCase();
  return (
    hint.includes('path') ||
    hint.includes('dir') ||
    hint.includes('folder') ||
    hint.includes('file') ||
    hint.includes('directory')
  );
}

function extractArgFields(
  packageArguments: McpRegistryPackageArgument[] | undefined
): { requiredArgs: McpMarketplaceArgField[]; optionalArgs: McpMarketplaceArgField[] } {
  const requiredArgs: McpMarketplaceArgField[] = [];
  const optionalArgs: McpMarketplaceArgField[] = [];

  for (const [index, arg] of (packageArguments ?? []).entries()) {
    if (arg.type !== 'positional' || arg.value) continue;

    const label = arg.valueHint || arg.description || `Argument ${index + 1}`;
    const field: McpMarketplaceArgField = {
      key: String(index),
      label,
      description: arg.description,
      isRequired: Boolean(arg.isRequired && !arg.default),
      defaultValue: arg.default,
      isPath: isPathLikeHint(arg.valueHint || arg.description || ''),
      isSecret: false,
    };

    if (field.isRequired) {
      requiredArgs.push(field);
    } else {
      optionalArgs.push(field);
    }
  }

  return { requiredArgs, optionalArgs };
}

export function buildNpmArgs(
  pkg: McpRegistryPackage,
  argValues: Record<string, string> = {}
): string[] {
  const version = pkg.version ? `@${pkg.version}` : '';
  const args = ['-y', `${pkg.identifier}${version}`];

  for (const [index, arg] of (pkg.packageArguments ?? []).entries()) {
    if (arg.type !== 'positional') continue;

    if (arg.value) {
      args.push(arg.value);
      continue;
    }

    const userValue = argValues[String(index)]?.trim();
    if (userValue) {
      args.push(userValue);
      continue;
    }

    if (arg.default) {
      args.push(arg.default);
    }
  }

  return args;
}

export function registryEntryToMarketplaceItem(entry: McpRegistryListEntry): McpMarketplaceItem | null {
  const server = entry.server;
  if (!server?.name) return null;

  const title = server.title?.trim() || humanizeRegistryName(server.name);
  const description = server.description?.trim() || '';
  const version = server.version?.trim() || 'latest';
  const remote = pickRemote(server.remotes);
  const npmPackage = pickNpmPackage(server.packages);

  const requiredEnv: string[] = [];
  const optionalEnv: string[] = [];
  const envDescription: Record<string, string> = {};
  const envSecrets: Record<string, boolean> = {};

  if (remote?.url) {
    const remoteType = remote.type === 'sse' ? 'sse' : 'streamable-http';
    return {
      registryName: server.name,
      title,
      description,
      version,
      connectionType: 'remote',
      sourceLabel: 'community',
      websiteUrl: server.websiteUrl,
      repositoryUrl: server.repository?.url,
      requiresConfiguration: false,
      requiredEnv,
      optionalEnv,
      envDescription,
      envSecrets,
      requiredArgs: [],
      optionalArgs: [],
      config: {
        name: title,
        type: remoteType,
        url: remote.url,
      },
    };
  }

  if (npmPackage?.identifier) {
    const { requiredArgs, optionalArgs } = extractArgFields(npmPackage.packageArguments);

    for (const envVar of npmPackage.environmentVariables ?? []) {
      if (!envVar.name) continue;
      if (envVar.description) {
        envDescription[envVar.name] = envVar.description;
      }
      if (envVar.isSecret) {
        envSecrets[envVar.name] = true;
      }
      if (envVar.isRequired && !envVar.default) {
        requiredEnv.push(envVar.name);
      } else {
        optionalEnv.push(envVar.name);
      }
    }

    const requiresConfiguration = requiredEnv.length > 0 || requiredArgs.length > 0;

    const env: Record<string, string> = {};
    for (const envVar of npmPackage.environmentVariables ?? []) {
      if (envVar.name && envVar.default) {
        env[envVar.name] = envVar.default;
      }
    }

    return {
      registryName: server.name,
      title,
      description,
      version,
      connectionType: 'local',
      sourceLabel: 'community',
      websiteUrl: server.websiteUrl,
      repositoryUrl: server.repository?.url,
      requiresConfiguration,
      requiredEnv,
      optionalEnv,
      envDescription,
      envSecrets,
      requiredArgs,
      optionalArgs,
      packageIdentifier: npmPackage.identifier,
      npmPackage,
      config: {
        name: title,
        type: 'stdio',
        command: 'npx',
        args: buildNpmArgs(npmPackage),
        env: Object.keys(env).length > 0 ? env : undefined,
      },
    };
  }

  return null;
}

export function applyMarketplaceConfiguration(
  item: McpMarketplaceItem,
  configuration: McpMarketplaceConfiguration
): Omit<McpServerConfig, 'id' | 'enabled'> {
  const displayName = configuration.displayName?.trim();

  if (item.config.type !== 'stdio' || !item.npmPackage) {
    return {
      ...item.config,
      ...(displayName ? { name: displayName } : {}),
    };
  }

  const env: Record<string, string> = { ...(item.config.env ?? {}) };
  for (const [key, value] of Object.entries(configuration.env)) {
    const trimmed = value.trim();
    if (trimmed) {
      env[key] = trimmed;
    }
  }

  const args = buildNpmArgs(item.npmPackage, configuration.args);

  return {
    ...item.config,
    name: displayName || item.config.name,
    args,
    env: Object.keys(env).length > 0 ? env : undefined,
  };
}

/** @deprecated Use applyMarketplaceConfiguration */
export function applyMarketplaceEnvOverrides(
  item: McpMarketplaceItem,
  envOverrides: Record<string, string>
): Omit<McpServerConfig, 'id' | 'enabled'> {
  return applyMarketplaceConfiguration(item, { env: envOverrides, args: {} });
}

export function marketplaceConfigurationIsValid(
  item: McpMarketplaceItem,
  configuration: McpMarketplaceConfiguration
): boolean {
  const missingEnv = item.requiredEnv.some((key) => !configuration.env[key]?.trim());
  if (missingEnv) return false;

  const missingArgs = item.requiredArgs.some((arg) => !configuration.args[arg.key]?.trim());
  if (missingArgs) return false;

  return true;
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[_\-./]+/g, ' ').trim();
}

function tokenizeSearchQuery(query: string): string[] {
  return normalizeSearchText(query).split(/\s+/).filter(Boolean);
}

export function scoreMarketplaceItem(item: McpMarketplaceItem, query: string): number {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 1;

  const tokens = tokenizeSearchQuery(query);
  const title = normalizeSearchText(item.title);
  const description = normalizeSearchText(item.description);
  const registryName = normalizeSearchText(item.registryName);
  const packageIdentifier = normalizeSearchText(item.packageIdentifier ?? '');
  const repositoryUrl = normalizeSearchText(item.repositoryUrl ?? '');

  for (const token of tokens) {
    const inTitle = title.includes(token);
    const inDescription = description.includes(token);
    const inName = registryName.includes(token);
    const inPackage = packageIdentifier.includes(token);
    const inRepository = repositoryUrl.includes(token);
    if (!inTitle && !inDescription && !inName && !inPackage && !inRepository) {
      return 0;
    }
  }

  let score = 0;
  if (title === normalizedQuery) score += 120;
  if (registryName === normalizedQuery) score += 110;
  if (packageIdentifier === normalizedQuery) score += 105;
  if (title.startsWith(normalizedQuery)) score += 80;
  if (registryName.startsWith(normalizedQuery)) score += 70;
  if (packageIdentifier.startsWith(normalizedQuery)) score += 65;
  if (title.includes(normalizedQuery)) score += 50;
  if (registryName.includes(normalizedQuery)) score += 40;
  if (packageIdentifier.includes(normalizedQuery)) score += 35;
  if (description.includes(normalizedQuery)) score += 20;
  if (repositoryUrl.includes(normalizedQuery)) score += 10;

  for (const token of tokens) {
    if (title.startsWith(token)) score += 12;
    if (title.includes(token)) score += 8;
    if (registryName.includes(token)) score += 6;
    if (packageIdentifier.includes(token)) score += 6;
    if (description.includes(token)) score += 3;
  }

  return score;
}

export function filterMarketplaceItems(
  items: McpMarketplaceItem[],
  query: string
): McpMarketplaceItem[] {
  const trimmed = query.trim();
  if (!trimmed) return items;

  return items
    .map((item) => ({ item, score: scoreMarketplaceItem(item, trimmed) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .map((entry) => entry.item);
}
