export type AnonymizationAction = 'retry' | 'exclude' | 'cancel' | 'proceed' | 'restart';
export interface AnonymizationStatus {
  model: 'missing' | 'downloading' | 'ready' | 'error';
  service: 'stopped' | 'starting' | 'ready' | 'error';
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
}
export interface AnonymizationDecision {
  id: string;
  chatId: string;
  kind: 'complex' | 'service';
  reason: string;
  actions: AnonymizationAction[];
  state: 'waiting' | 'restarting';
  recovery?: 'system-storage';
  restartApp?: boolean;
  scope?: 'request';
}
export type AnonymizationEvent =
  | { type: 'status'; status: AnonymizationStatus }
  | { type: 'decision'; decision: AnonymizationDecision }
  | { type: 'resolved'; id: string };
export interface AnonymizationAPI {
  status(): Promise<AnonymizationStatus>;
  download(): Promise<void>;
  cancelDownload(): Promise<void>;
  decisions(): Promise<AnonymizationDecision[]>;
  decide(id: string, action: AnonymizationAction): Promise<void>;
  onEvent(callback: (event: AnonymizationEvent) => void): () => void;
}
