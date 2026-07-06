import { app } from 'electron';
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater';
import type { UpdaterSnapshot } from '../../shared/updater-types';
import { INITIAL_UPDATER_SNAPSHOT } from '../../shared/updater-types';
import type { ServerEvent } from '../../renderer/types';
import { log, logError, logWarn } from '../utils/logger';

type MenuRefreshHandler = () => void;

export class AutoUpdaterManager {
  private sendToRenderer: (event: ServerEvent) => void = () => {};
  private refreshMenus: MenuRefreshHandler = () => {};
  private snapshot: UpdaterSnapshot = { ...INITIAL_UPDATER_SNAPSHOT };
  private initialized = false;
  private userInitiatedCheck = false;

  configure(options: {
    sendToRenderer: (event: ServerEvent) => void;
    refreshMenus: MenuRefreshHandler;
  }): void {
    this.sendToRenderer = options.sendToRenderer;
    this.refreshMenus = options.refreshMenus;
  }

  getSnapshot(): UpdaterSnapshot {
    return this.snapshot;
  }

  getMenuLabel(): string {
    switch (this.snapshot.phase) {
      case 'downloaded':
        return 'Restart to Update';
      case 'downloading':
        return 'Downloading Update…';
      case 'available':
        return this.snapshot.version
          ? `Download Update (v${this.snapshot.version})…`
          : 'Download Update…';
      default:
        return 'Check for Updates…';
    }
  }

  isMenuEnabled(): boolean {
    return this.snapshot.phase !== 'downloading' && this.snapshot.phase !== 'disabled';
  }

  async initialize(isDev: boolean): Promise<void> {
    if (isDev || !app.isPackaged) {
      this.setSnapshot({ phase: 'disabled' });
      return;
    }

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = {
      info: (...args: unknown[]) => log('[AutoUpdater]', ...args),
      warn: (...args: unknown[]) => logWarn('[AutoUpdater]', ...args),
      error: (...args: unknown[]) => logError('[AutoUpdater]', ...args),
      debug: (...args: unknown[]) => log('[AutoUpdater]', ...args),
    };

    autoUpdater.on('checking-for-update', () => {
      this.setSnapshot({ phase: 'checking', error: null });
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.userInitiatedCheck = false;
      this.setSnapshot({
        phase: 'available',
        version: info.version,
        progress: null,
        transferred: null,
        total: null,
        error: null,
      });
    });

    autoUpdater.on('update-not-available', () => {
      if (this.userInitiatedCheck) {
        this.userInitiatedCheck = false;
        this.setSnapshot({
          phase: 'up-to-date',
          version: app.getVersion(),
          progress: null,
          transferred: null,
          total: null,
          error: null,
        });
        return;
      }

      this.setSnapshot({
        phase: 'idle',
        version: null,
        progress: null,
        transferred: null,
        total: null,
        error: null,
      });
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.setSnapshot({
        phase: 'downloading',
        progress: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        error: null,
      });
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.setSnapshot({
        phase: 'downloaded',
        version: info.version,
        progress: 100,
        error: null,
      });
    });

    autoUpdater.on('error', (error: Error) => {
      this.userInitiatedCheck = false;
      const message = error?.message || String(error);
      logError('[AutoUpdater] Error:', message);
      this.setSnapshot({
        phase: 'error',
        error: message,
      });
    });

    this.initialized = true;
    void this.checkForUpdates();
  }

  handleMenuAction(): void {
    switch (this.snapshot.phase) {
      case 'downloaded':
        this.quitAndInstall();
        break;
      case 'available':
        void this.downloadUpdate();
        break;
      default:
        void this.checkForUpdates({ userInitiated: true });
        break;
    }
  }

  async checkForUpdates(options?: { userInitiated?: boolean }): Promise<void> {
    if (!this.initialized) {
      return;
    }
    if (options?.userInitiated) {
      this.userInitiatedCheck = true;
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.userInitiatedCheck = false;
      const message = error instanceof Error ? error.message : String(error);
      logError('[AutoUpdater] Check failed:', message);
      this.setSnapshot({ phase: 'error', error: message });
    }
  }

  async downloadUpdate(): Promise<void> {
    if (!this.initialized) {
      return;
    }
    if (this.snapshot.phase !== 'available' && this.snapshot.phase !== 'error') {
      return;
    }
    try {
      this.setSnapshot({ phase: 'downloading', progress: 0, error: null });
      await autoUpdater.downloadUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError('[AutoUpdater] Download failed:', message);
      this.setSnapshot({ phase: 'error', error: message });
    }
  }

  quitAndInstall(): void {
    if (!this.initialized || this.snapshot.phase !== 'downloaded') {
      return;
    }
    autoUpdater.quitAndInstall(false, true);
  }

  private setSnapshot(partial: Partial<UpdaterSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    this.sendToRenderer({
      type: 'updater.status',
      payload: this.snapshot,
    });
    this.refreshMenus();
  }
}

export const autoUpdaterManager = new AutoUpdaterManager();
