// Recording a spoken question for the AI: the microphone as 16 kHz mono samples — recognised on the computer itself
// (localSpeech.ts), or sent as WAV, a format Gemini takes for sure (the browser's own recorder gives WebM).

/** Speech needs no more; it keeps the recording small. */
const SAMPLE_RATE = 16000;
/** A question is short: the recording stops by itself after this. */
export const MAX_SECONDS = 60;

/** Whether this window can record at all: tests and old systems cannot. */
export function canRecord(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== 'undefined';
}

/** What the microphone heard: mono samples, chunk by chunk, and how many a second. */
export interface RecordedAudio {
  chunks: Float32Array[];
  sampleRate: number;
}

/** A recording as a WAV file in base64, for a speech service on the internet. */
export const wavBase64 = (audio: RecordedAudio) => toBase64(encodeWav(audio.chunks, audio.sampleRate));

export interface Recording {
  /** Stops and gives what was recorded. */
  stop(): Promise<RecordedAudio>;
  /** Stops and throws the recording away. */
  cancel(): void;
}

/** Starts recording from the microphone; asks for it the first time. */
export async function startRecording(onLimit: () => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  const source = context.createMediaStreamSource(stream);
  // ScriptProcessor is old but everywhere and needs no separate worklet file in the bundle.
  const processor = context.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (event) => chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  source.connect(processor);
  processor.connect(context.destination);
  const limit = setTimeout(onLimit, MAX_SECONDS * 1000);

  const close = () => {
    clearTimeout(limit);
    processor.disconnect();
    source.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    void context.close();
  };
  return {
    async stop() {
      close();
      return { chunks, sampleRate: context.sampleRate };
    },
    cancel: close,
  };
}

/** Samples as a 16-bit PCM mono WAV file. */
export function encodeWav(chunks: Float32Array[], sampleRate: number): Uint8Array {
  const length = chunks.reduce((n, chunk) => n + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true); // size of the format block
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per sample
  view.setUint16(34, 16, true); // bits per sample
  text(36, 'data');
  view.setUint32(40, length * 2, true);
  let offset = 44;
  for (const chunk of chunks) {
    for (const sample of chunk) {
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }
  }
  return new Uint8Array(buffer);
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
