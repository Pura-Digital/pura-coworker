import { useCallback, useRef, useState } from 'react';

export type PuraVoiceUiStatus = 'idle' | 'connecting' | 'connected' | 'listening' | 'error';

const REALTIME_TARGET_HZ = 24000;

function downsampleBuffer(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) {
    return input;
  }
  const ratio = fromRate / toRate;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const idx = Math.min(input.length - 1, Math.floor(i * ratio));
    out[i] = input[idx] ?? 0;
  }
  return out;
}

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

export function usePuraRealtimeVoice() {
  const [status, setStatus] = useState<PuraVoiceUiStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [micVolume, setMicVolume] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const muteRef = useRef<GainNode | null>(null);

  const stopMicPipeline = useCallback(() => {
    try {
      procRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    procRef.current = null;
    try {
      muteRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    muteRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setMicVolume(0);
  }, []);

  const closeWs = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }
  }, []);

  const disconnectAll = useCallback(() => {
    stopMicPipeline();
    closeWs();
    setStatus('idle');
    setErrorMessage(null);
  }, [closeWs, stopMicPipeline]);

  const connectRealtime = useCallback(async () => {
    stopMicPipeline();
    closeWs();
    const api = window.electronAPI?.puraDigital?.createRealtimeSession;
    if (!api) {
      setErrorMessage('Electron IPC unavailable');
      setStatus('error');
      return;
    }
    setErrorMessage(null);
    setStatus('connecting');
    const result = await api();
    if (!result.ok) {
      setErrorMessage(result.message ?? result.error);
      setStatus('error');
      return;
    }

    const ws = new WebSocket(result.websocketUrl, [
      'realtime',
      `openai-insecure-api-key.${result.clientSecret}`,
    ]);
    wsRef.current = ws;

    ws.onerror = () => {
      setErrorMessage('WebSocket error');
      setStatus('error');
      stopMicPipeline();
    };

    ws.onclose = () => {
      wsRef.current = null;
      stopMicPipeline();
      setStatus((prev) => (prev === 'error' ? prev : 'idle'));
    };

    ws.onopen = () => {
      setStatus('connected');
      try {
        ws.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              modalities: ['text', 'audio'],
              instructions:
                'You are a concise voice assistant inside Aiden. Prefer short spoken replies.',
              voice: 'alloy',
              turn_detection: { type: 'server_vad' },
            },
          })
        );
      } catch {
        /* ignore */
      }
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') {
        return;
      }
      try {
        const msg = JSON.parse(ev.data) as { type?: string; error?: { message?: string } };
        if (msg.type === 'error' && msg.error?.message) {
          setErrorMessage(msg.error.message);
          setStatus('error');
        }
      } catch {
        /* ignore binary / parse errors */
      }
    };
  }, [closeWs, stopMicPipeline]);

  const stopMic = useCallback(() => {
    stopMicPipeline();
    setStatus((s) => (s === 'listening' ? 'connected' : s));
  }, [stopMicPipeline]);

  const startMic = useCallback(async () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setErrorMessage('Not connected');
      setStatus('error');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
      setStatus('error');
      return;
    }

    streamRef.current = stream;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const bufferSize = 4096;
    // ScriptProcessor is deprecated but widely supported in Electron/Chromium for raw PCM tap.
    const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
    procRef.current = processor;

    processor.onaudioprocess = (e) => {
      const w = wsRef.current;
      if (!w || w.readyState !== WebSocket.OPEN) {
        return;
      }
      const inputData = e.inputBuffer.getChannelData(0);

      // Calculate volume (RMS)
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      setMicVolume(Math.min(1, rms * 10)); // Scale up a bit

      const down = downsampleBuffer(inputData, ctx.sampleRate, REALTIME_TARGET_HZ);
      const pcm = floatTo16BitPCM(down);
      const audio = arrayBufferToBase64(pcm);
      try {
        w.send(JSON.stringify({ type: 'input_audio_buffer.append', audio }));
      } catch {
        /* ignore */
      }
    };

    const mute = ctx.createGain();
    mute.gain.value = 0;
    muteRef.current = mute;
    source.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);

    setStatus('listening');
  }, []);

  const toggleMic = useCallback(async () => {
    if (status === 'listening') {
      stopMic();
      return;
    }
    if (status === 'connected') {
      await startMic();
    }
  }, [startMic, status, stopMic]);

  return {
    status,
    errorMessage,
    micVolume,
    connectRealtime,
    disconnectAll,
    toggleMic,
  };
}
