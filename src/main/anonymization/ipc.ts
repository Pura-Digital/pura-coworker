import { closeVisionConsentBroker } from './vision-consent';
import { app, BrowserWindow, ipcMain } from 'electron';
import { getAnonymizationGateway } from './gateway';
import type { AnonymizationAction, AnonymizationEvent } from '../../shared/anonymization-types';

export function registerAnonymizationIpc(): void {
  const gateway = getAnonymizationGateway();
  gateway.on('event', (event: AnonymizationEvent) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send('anonymization.event', event);
    }
  });
  ipcMain.handle('anonymization.status', async () => {
    await gateway.service.initialize();
    return gateway.service.status();
  });
  ipcMain.handle('anonymization.download', () => gateway.service.download());
  ipcMain.handle('anonymization.cancelDownload', () => gateway.service.cancelDownload());
  ipcMain.handle('anonymization.decisions', () => gateway.decisions());
  ipcMain.handle('anonymization.decide', (_event, id: unknown, action: unknown) => {
    if (
      typeof id !== 'string' ||
      !['retry', 'exclude', 'cancel', 'proceed', 'restart'].includes(String(action))
    )
      throw new Error('Invalid anonymization decision');
    return gateway.decide(id, action as AnonymizationAction);
  });
  app.on('before-quit', () => {
    closeVisionConsentBroker();
    gateway.dispose();
  });
}
