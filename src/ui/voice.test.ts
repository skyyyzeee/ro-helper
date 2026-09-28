import { describe, expect, it } from 'vitest';
import { encodeWav, toBase64 } from './voice';

describe('the voice recording', () => {
  it('is a 16-bit mono PCM WAV of the samples, clipped to their range', () => {
    const wav = encodeWav([new Float32Array([0, 0.5]), new Float32Array([-1, 2])], 16000);
    const view = new DataView(wav.buffer);
    const text = (from: number) => String.fromCharCode(...wav.subarray(from, from + 4));
    expect(wav.length).toBe(44 + 4 * 2);
    expect([text(0), text(8), text(12), text(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(40, true)).toBe(8);
    expect([44, 46, 48, 50].map((at) => view.getInt16(at, true))).toEqual([0, 16383, -32768, 32767]);
  });

  it('goes to Gemini as base64', () => {
    expect(toBase64(new Uint8Array([82, 73, 70, 70]))).toBe('UklGRg==');
  });
});
