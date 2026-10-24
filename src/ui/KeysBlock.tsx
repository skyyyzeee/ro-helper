import { Dropdown } from './Dropdown';
import { HotkeyField } from './HotkeyField';
import { clashes, type KeyUse } from './keymap';
import { NOTE_TITLE, type Note } from './notes';
import { DEFAULT_NOTES_NEXT_HOTKEY, DEFAULT_NOTES_PREV_HOTKEY, DEFAULT_NOTE_HOTKEY, DEFAULT_QUICK_HOTKEY, DEFAULT_TIMER_HOTKEY, DEFAULT_VOICE_HOTKEY } from './overlaySettings';
import { PHRASE_KEYS, PHRASE_MODIFIERS } from './phrases';
import { formatHotkey } from './profile';

/** The notes' keys: show and hide, turn on and back, and each note's own. */
export interface NotesKeys {
  notes: Note[];
  onNotes: (notes: Note[]) => void;
  hotkey: string;
  onHotkey: (accelerator: string) => void;
  next: string;
  onNext: (accelerator: string) => void;
  prev: string;
  onPrev: (accelerator: string) => void;
}

export interface KeysBlockProps {
  hotkey: string;
  onHotkey: (accelerator: string) => void;
  voiceHotkey: string;
  onVoiceHotkey: (accelerator: string) => void;
  quickHotkey: string;
  onQuickHotkey: (accelerator: string) => void;
  /** Absent for those who detain no one. */
  timerHotkey?: string;
  onTimerHotkey?: (accelerator: string) => void;
  notes?: NotesKeys;
  /** The faction's phrases for the chat: the keys before 1…9, empty when off, and how many phrases there are. */
  phrases?: { keys: string; onKeys: (keys: string) => void; count: number };
  onCapturing: (capturing: boolean) => void;
}

/** A note's own key, unless the player sets another: Alt+1…9 for the first nine, as a player asked; then Ctrl+Alt+1… */
export const noteFallback = (index: number) => (index < 9 ? `Alt+${index + 1}` : `Ctrl+Alt+${(index - 8) % 10}`);
const noteLabel = (note: Note) => `Заметка «${note.title.trim() || NOTE_TITLE}»`;

/**
 * Every key of the assistant on one list, in the order the overlay registers them (`Overlay.tsx`): a key set for two
 * things works for the first only, and the later one says so.
 */
export function keyUses({ hotkey, voiceHotkey, quickHotkey, timerHotkey, notes, phrases }: Omit<KeysBlockProps, 'onCapturing' | 'onHotkey' | 'onVoiceHotkey' | 'onQuickHotkey'>): KeyUse[] {
  const phraseCount = phrases?.keys ? Math.min(PHRASE_KEYS, phrases.count) : 0;
  return [
    { id: 'overlay', label: 'Открыть и скрыть ассистент', hotkey },
    { id: 'voice', label: 'Вопрос голосом', hotkey: voiceHotkey },
    { id: 'quick', label: 'Быстрый поиск', hotkey: quickHotkey },
    ...(timerHotkey !== undefined ? [{ id: 'timer', label: 'Таймер задержания', hotkey: timerHotkey }] : []),
    ...Array.from({ length: phraseCount }, (_, i) => ({ id: `phrase-${i + 1}`, label: `Фраза ${i + 1}`, hotkey: `${phrases!.keys}+${i + 1}` })),
    ...(notes
      ? [
          { id: 'note', label: 'Заметки: показать и спрятать', hotkey: notes.hotkey },
          { id: 'notes-next', label: 'Следующая заметка', hotkey: notes.next },
          { id: 'notes-prev', label: 'Предыдущая заметка', hotkey: notes.prev },
          ...notes.notes.map((note) => ({ id: `note:${note.id}`, label: noteLabel(note), hotkey: note.hotkey ?? '' })),
        ]
      : []),
  ];
}

/** «Клавиши»: every key of the assistant, each changed or turned off on its line. */
export function KeysBlock(props: KeysBlockProps) {
  const { hotkey, onHotkey, voiceHotkey, onVoiceHotkey, quickHotkey, onQuickHotkey, timerHotkey, onTimerHotkey, notes, phrases, onCapturing } = props;
  const clash = clashes(keyUses(props));
  const field = (id: string, label: string, value: string, change: (accelerator: string) => void, fallback?: string) => (
    <HotkeyField key={id} compact name={id} label={label} hotkey={value} onHotkey={change} fallback={fallback} clash={clash.get(id)} onCapturing={onCapturing} />
  );
  const setNoteKey = (id: string, accelerator: string) => notes?.onNotes(notes.notes.map((n) => (n.id === id ? { ...n, hotkey: accelerator || undefined } : n)));
  return (
    <>
      <h4 className="set__sub">Ассистент</h4>
      {field('overlay', 'Открыть и скрыть ассистент', hotkey, onHotkey)}
      {field('voice', 'Вопрос голосом (держать)', voiceHotkey, onVoiceHotkey, DEFAULT_VOICE_HOTKEY)}
      {field('quick', 'Быстрый поиск', quickHotkey, onQuickHotkey, DEFAULT_QUICK_HOTKEY)}
      {timerHotkey !== undefined && onTimerHotkey && field('timer', 'Таймер задержания', timerHotkey, onTimerHotkey, DEFAULT_TIMER_HOTKEY)}

      {phrases && (
        <>
          <h4 className="set__sub">Фразы для чата</h4>
          <div className="set__row">
            <span className="set__label keys__label">Копировать фразу 1…{PHRASE_KEYS}</span>
            <span className="sp" />
            <Dropdown
              variant="pill"
              label="Клавиши заготовок"
              value={phrases.keys}
              onChange={phrases.onKeys}
              options={[{ value: '', label: 'Выключены' }, ...PHRASE_MODIFIERS.map((m) => ({ value: m, label: `${formatHotkey(m)} + 1…${PHRASE_KEYS}` }))]}
            />
          </div>
        </>
      )}
      {notes && (
        <>
          <h4 className="set__sub">Заметки поверх игры</h4>
          {field('note', 'Заметки: показать и спрятать', notes.hotkey, notes.onHotkey, DEFAULT_NOTE_HOTKEY)}
          {field('notes-next', 'Следующая заметка', notes.next, notes.onNext, DEFAULT_NOTES_NEXT_HOTKEY)}
          {field('notes-prev', 'Предыдущая заметка', notes.prev, notes.onPrev, DEFAULT_NOTES_PREV_HOTKEY)}
          {notes.notes.map((note, i) => field(`note:${note.id}`, noteLabel(note), note.hotkey ?? '', (accelerator) => setNoteKey(note.id, accelerator), noteFallback(i)))}
          <p className="set__hint">
            Листать можно и не открывая ассистента: клавиша заметки показывает её поверх игры, ещё раз — прячет. Если заметки уже на экране, «следующая» и
            «предыдущая» перелистывают их. Писать заметки — в «Закреплённых».
          </p>
        </>
      )}

      <p className="set__hint">Сочетания работают поверх игры. Если одно сочетание задано двум действиям, сработает то, что выше в списке.</p>
    </>
  );
}
