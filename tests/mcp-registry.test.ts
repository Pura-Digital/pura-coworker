import { describe, expect, it } from 'vitest';
import {
  applyMarketplaceConfiguration,
  buildNpmArgs,
  filterMarketplaceItems,
  registryEntryToMarketplaceItem,
} from '../src/shared/mcp-registry';
import type { McpMarketplaceItem } from '../src/shared/mcp-registry';

describe('mcp registry conversion', () => {
  it('maps remote registry entries to streamable-http connectors', () => {
    const item = registryEntryToMarketplaceItem({
      server: {
        name: 'ac.inference.sh/mcp',
        title: 'inference.sh',
        description: 'Run AI apps',
        version: '2.0.0',
        remotes: [{ type: 'streamable-http', url: 'https://api.inference.sh/mcp' }],
      },
    });

    expect(item).toMatchObject({
      registryName: 'ac.inference.sh/mcp',
      title: 'inference.sh',
      connectionType: 'remote',
      sourceLabel: 'community',
      config: {
        name: 'inference.sh',
        type: 'streamable-http',
        url: 'https://api.inference.sh/mcp',
      },
    });
  });

  it('maps npm packages to local stdio connectors', () => {
    const item = registryEntryToMarketplaceItem({
      server: {
        name: 'io.modelcontextprotocol.anonymous/brave-search',
        title: 'Brave Search',
        description: 'Brave Search MCP',
        version: '1.0.2',
        packages: [
          {
            registryType: 'npm',
            identifier: '@modelcontextprotocol/server-brave-search',
            version: '1.0.2',
            transport: { type: 'stdio' },
            environmentVariables: [
              {
                name: 'BRAVE_API_KEY',
                description: 'Brave Search API Key',
                isRequired: true,
                isSecret: true,
              },
            ],
          },
        ],
      },
    });

    expect(item).toMatchObject({
      title: 'Brave Search',
      connectionType: 'local',
      sourceLabel: 'community',
      requiresConfiguration: true,
      requiredEnv: ['BRAVE_API_KEY'],
      config: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search@1.0.2'],
      },
    });
  });

  it('maps registry names without title (e.g. Adobe MCP)', () => {
    const item = registryEntryToMarketplaceItem({
      server: {
        name: 'io.github.AJSMonty/adobe-mcp',
        description:
          'Drive Adobe CC (AE, Photoshop, Illustrator, Premiere, Character Animator) from any MCP client',
        version: '1.1.1',
        packages: [
          {
            registryType: 'npm',
            identifier: '@ajsmonty/adobe-mcp',
            version: '1.1.1',
            transport: { type: 'stdio' },
          },
        ],
      },
    });

    expect(item).toMatchObject({
      title: 'Adobe MCP',
      packageIdentifier: '@ajsmonty/adobe-mcp',
    });
    expect(filterMarketplaceItems(item ? [item] : [], 'adobe').map((entry) => entry.title)).toEqual([
      'Adobe MCP',
    ]);
  });

  it('includes required positional args instead of excluding the server', () => {
    const item = registryEntryToMarketplaceItem({
      server: {
        name: 'io.github.modelcontextprotocol/filesystem',
        title: 'Filesystem',
        version: '1.0.2',
        packages: [
          {
            registryType: 'npm',
            identifier: '@modelcontextprotocol/server-filesystem',
            version: '1.0.2',
            transport: { type: 'stdio' },
            packageArguments: [
              {
                type: 'positional',
                valueHint: 'target_dir',
                description: 'Path to access',
                isRequired: true,
              },
            ],
          },
        ],
      },
    });

    expect(item).toMatchObject({
      title: 'Filesystem',
      requiresConfiguration: true,
      requiredArgs: [
        {
          key: '0',
          label: 'target_dir',
          isRequired: true,
          isPath: true,
        },
      ],
    });
  });

  it('applies env and arg overrides before saving marketplace connectors', () => {
    const item = registryEntryToMarketplaceItem({
      server: {
        name: 'io.github.modelcontextprotocol/filesystem',
        title: 'Filesystem',
        version: '1.0.2',
        packages: [
          {
            registryType: 'npm',
            identifier: '@modelcontextprotocol/server-filesystem',
            version: '1.0.2',
            transport: { type: 'stdio' },
            packageArguments: [
              {
                type: 'positional',
                valueHint: 'target_dir',
                isRequired: true,
              },
            ],
          },
        ],
      },
    });

    expect(item).not.toBeNull();
    const config = applyMarketplaceConfiguration(item!, {
      env: {},
      args: { '0': '/tmp/workspace' },
      displayName: 'My Filesystem',
    });
    expect(config.name).toBe('My Filesystem');
    expect(config.args).toEqual([
      '-y',
      '@modelcontextprotocol/server-filesystem@1.0.2',
      '/tmp/workspace',
    ]);
  });

  it('builds npm args with fixed and user-provided positional values', () => {
    const args = buildNpmArgs(
      {
        identifier: '@example/server',
        version: '1.0.0',
        packageArguments: [
          { type: 'positional', value: 'mcp' },
          { type: 'positional', value: 'start' },
          { type: 'positional', valueHint: 'target_dir', isRequired: true },
        ],
      },
      { '2': '/Users/test/Desktop' }
    );

    expect(args).toEqual(['-y', '@example/server@1.0.0', 'mcp', 'start', '/Users/test/Desktop']);
  });
});

describe('mcp marketplace search', () => {
  const items: McpMarketplaceItem[] = [
    {
      registryName: 'io.github.modelcontextprotocol/filesystem',
      title: 'Filesystem',
      description: 'Filesystem operations for local folders',
      version: '1.0.0',
      connectionType: 'local',
      sourceLabel: 'community',
      requiresConfiguration: false,
      requiredEnv: [],
      optionalEnv: [],
      envDescription: {},
      envSecrets: {},
      requiredArgs: [],
      optionalArgs: [],
      config: { name: 'Filesystem', type: 'stdio', command: 'npx', args: [] },
    },
    {
      registryName: 'ac.inference.sh/mcp',
      title: 'inference.sh',
      description: 'Run AI apps remotely',
      version: '2.0.0',
      connectionType: 'remote',
      sourceLabel: 'community',
      requiresConfiguration: false,
      requiredEnv: [],
      optionalEnv: [],
      envDescription: {},
      envSecrets: {},
      requiredArgs: [],
      optionalArgs: [],
      config: {
        name: 'inference.sh',
        type: 'streamable-http',
        url: 'https://api.inference.sh/mcp',
      },
    },
  ];

  it('matches title and description locally with scoring', () => {
    const results = filterMarketplaceItems(items, 'filesystem folder');
    expect(results.map((item) => item.title)).toEqual(['Filesystem']);
  });

  it('matches registry name tokens', () => {
    const results = filterMarketplaceItems(items, 'inference');
    expect(results.map((item) => item.title)).toEqual(['inference.sh']);
  });
});
