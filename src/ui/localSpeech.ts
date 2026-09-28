// Speech to text on the player's own computer, with Vosk: free, whatever the number of questions, and nothing
// recorded leaves the computer. The Russian model (~45 MB) comes from the AI server once and is kept in the
// app's cache; the recognition itself runs in a worker, beside the game.
/** The small Russian Vosk model on an AI server, repacked for the browser by its installer (server/install.sh). */
export const modelUrl = (server: string) => `${server}/models/vosk-model-small-ru.tar.gz`;
const CACHE = 'ro-helper-models-v1';

type Model = Awaited<ReturnType<typeof import('vosk-browser')['createModel']>>;
type VoskModule = typeof import('vosk-browser');
let loading: Promise<Model> | null = null;

/** The model as a local address: from the cache, or downloaded now and kept there for the next time. */
async function modelBlobUrl(url: string, onDownload?: () => void): Promise<string> {
  const cache = typeof caches !== 'undefined' ? await caches.open(CACHE).catch(() => null) : null;
  let response = await cache?.match(url);
  if (!response) {
    onDownload?.();
    const fetched = await fetch(url);
    if (!fetched.ok) throw new Error(`Не скачалась модель распознавания речи (код ${fetched.status}).`);
    await cache?.put(url, fetched.clone()).catch(() => undefined);
    response = fetched;
  }
  return URL.createObjectURL(await response.blob());
}

/** Loads the model once per start of the app; a failed load is tried again next time. */
function model(server: string, onDownload?: () => void): Promise<Model> {
  loading ??= (async () => {
    // An old CommonJS bundle: its functions sit on `default` once imported as a module.
    const imported = (await import('vosk-browser')) as VoskModule & { default?: VoskModule };
    const Vosk = imported.default ?? imported;
    const url = await modelBlobUrl(modelUrl(server), onDownload);
    // Not createModel: it never settles when the model cannot be unpacked. The events say either way.
    return new Promise<Model>((resolve, reject) => {
      // Log level -1: only errors.
      const loaded = new Vosk.Model(url, -1);
      const fail = (why: string) => {
        clearTimeout(timer);
        loaded.terminate();
        reject(new Error(why));
      };
      const timer = setTimeout(() => fail('модель распознавания речи не загрузилась за минуту'), 60_000);
      loaded.on('load', (message) => {
        if (!(message as { result?: boolean }).result) return fail('модель распознавания речи не загрузилась');
        clearTimeout(timer);
        resolve(loaded);
      });
      loaded.on('error', () => fail('модель распознавания речи повреждена — она скачается заново при следующем вопросе'));
    }).finally(() => URL.revokeObjectURL(url));
  })().catch(async (error) => {
    loading = null;
    // A broken copy in the cache would fail every time: the next question downloads it again.
    if (typeof caches !== 'undefined') await caches.open(CACHE).then((cache) => cache.delete(modelUrl(server))).catch(() => undefined);
    throw error;
  });
  return loading;
}

/** Whether the model is already on this computer: the first question then takes no download. */
export async function modelReady(server: string): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  const cache = await caches.open(CACHE).catch(() => null);
  return !!(await cache?.match(modelUrl(server)));
}

/**
 * What was said in a recording, as text; empty when nothing was heard. `onDownload` is told when the model has to
 * be downloaded first, so the player knows why the first question takes a while.
 */
export async function recognize(server: string, chunks: Float32Array[], sampleRate: number, onDownload?: () => void): Promise<string> {
  const vosk = await model(server, onDownload);
  const recognizer = new vosk.KaldiRecognizer(sampleRate);
  try {
    const text = new Promise<string>((resolve) => {
      // Every chunk of audio is answered by one event — a result where a phrase ended, a partial one elsewhere —
      // and the final result comes after them all: the one past the chunks ends the recognition.
      const heard: string[] = [];
      let events = 0;
      const onEvent = (message: unknown) => {
        const result = (message as { result?: { text?: string } }).result;
        const said = (result?.text ?? '').trim();
        if (said) heard.push(said);
        events += 1;
        if (events > chunks.length) resolve(heard.join(' '));
      };
      recognizer.on('result', onEvent);
      recognizer.on('partialresult', () => {
        events += 1;
        if (events > chunks.length) resolve(heard.join(' '));
      });
      for (const chunk of chunks) recognizer.acceptWaveformFloat(chunk, sampleRate);
      recognizer.retrieveFinalResult();
    });
    const said = await Promise.race([text, new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Распознавание речи не ответило.')), 30_000))]);
    // Vosk writes all in lower case, without punctuation: a capital letter and a question mark read better.
    return said ? said.charAt(0).toUpperCase() + said.slice(1) : '';
  } finally {
    recognizer.remove();
  }
}
