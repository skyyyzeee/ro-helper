import { useRef, useState, type ClipboardEvent } from 'react';
import { MEMO_TEXT_MAX } from '../account/roles';
import { MEMO_COLORS, MEMO_COLOR_NAMES, MemoText, memoFromHtml, type MemoColor } from './memoText';

/** As much as the memos table holds, markup included. */
export const MEMO_MAX = MEMO_TEXT_MAX;

type Change = (text: string, start: number, end: number) => { text: string; start: number; end: number };

/** Markers a line starts with: a heading, a list item, a centred line. */
const LINE_MARK = /^(#{1,2} |[-•] |\d+[.)] |-> )/;

/**
 * The leader's editor of a memo: the text with buttons for its layout — as in Word, but kept as markup — what
 * the faction will see right under it, and a document pasted from Word or Google Docs keeping its layout.
 */
export function MemoEditor({ value, onChange, placeholder }: { value: string; onChange: (text: string) => void; placeholder: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [colors, setColors] = useState(false);
  const [cut, setCut] = useState(false);

  const edit = (change: Change) => {
    const field = ref.current;
    if (!field) return;
    const next = change(value, field.selectionStart, field.selectionEnd);
    if (next.text.length > MEMO_MAX) return;
    onChange(next.text);
    setCut(false);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(next.start, next.end);
    });
  };

  /** Wraps the selection, or a word to type over, in markers. */
  const wrap = (open: string, close = open) =>
    edit((text, start, end) => {
      const words = text.slice(start, end) || 'текст';
      return { text: text.slice(0, start) + open + words + close + text.slice(end), start: start + open.length, end: start + open.length + words.length };
    });

  /** Marks every line the selection touches, in place of the mark it had. */
  const lines = (mark: (line: string, i: number) => string) =>
    edit((text, start, end) => {
      const from = text.lastIndexOf('\n', start - 1) + 1;
      const to = text.indexOf('\n', end) < 0 ? text.length : text.indexOf('\n', end);
      const block = text
        .slice(from, to)
        .split('\n')
        .map((line, i) => mark(line.replace(LINE_MARK, '').replace(/ <-$/, ''), i))
        .join('\n');
      return { text: text.slice(0, from) + block + text.slice(to), start: from, end: from + block.length };
    });

  /** A block of its own lines: a rule or a table. */
  const insert = (block: string) =>
    edit((text, start, end) => {
      const before = start && text[start - 1] !== '\n' ? '\n' : '';
      const piece = `${before}${block}\n`;
      return { text: text.slice(0, start) + piece + text.slice(end), start: start + piece.length, end: start + piece.length };
    });

  const color = (name: MemoColor) => {
    setColors(false);
    wrap(`{${name}}`, '{/}');
  };

  const paste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData('text/html');
    const markup = html ? memoFromHtml(html) : '';
    if (!markup) return; // Plain text pastes as it is.
    e.preventDefault();
    const field = e.currentTarget;
    const { selectionStart: start, selectionEnd: end } = field;
    const room = MEMO_MAX - (value.length - (end - start));
    const piece = markup.slice(0, Math.max(0, room));
    onChange(value.slice(0, start) + piece + value.slice(end));
    setCut(piece.length < markup.length);
    requestAnimationFrame(() => field.setSelectionRange(start + piece.length, start + piece.length));
  };

  const tool = (label: string, title: string, run: () => void, className = '') => (
    <button className={`memo-ed__tool ${className}`} type="button" aria-label={title} title={title} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {label}
    </button>
  );

  return (
    <div className="memo-ed">
      <div className="memo-ed__bar" role="toolbar" aria-label="Оформление памятки">
        {tool('Ж', 'Жирный', () => wrap('**'), 'memo-ed__b')}
        {tool('К', 'Курсив', () => wrap('*'), 'memo-ed__i')}
        {tool('Ч', 'Подчёркнутый', () => wrap('__'), 'memo-ed__u')}
        {tool('З', 'Зачёркнутый', () => wrap('~~'), 'memo-ed__s')}
        <span className="memo-ed__sep" />
        {tool('H1', 'Заголовок', () => lines((line) => `# ${line}`))}
        {tool('H2', 'Подзаголовок', () => lines((line) => `## ${line}`))}
        {tool('•', 'Список', () => lines((line) => `- ${line}`))}
        {tool('1.', 'Нумерованный список', () => lines((line, i) => `${i + 1}. ${line}`))}
        {tool('≡', 'По центру', () => lines((line) => `-> ${line} <-`))}
        <span className="memo-ed__sep" />
        <span className="memo-ed__colors">
          {tool('А', 'Цвет текста', () => setColors((open) => !open), 'memo-ed__color')}
          {colors && (
            <span className="memo-ed__swatches" role="group" aria-label="Цвета">
              {MEMO_COLORS.map((name) => (
                <button
                  key={name}
                  className={`memo-ed__swatch mt-bg--${name}`}
                  type="button"
                  aria-label={MEMO_COLOR_NAMES[name]}
                  title={MEMO_COLOR_NAMES[name]}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => color(name)}
                />
              ))}
            </span>
          )}
        </span>
        {tool('—', 'Линия', () => insert('---'))}
        {tool('▦', 'Таблица', () => insert('| Что | Когда |\n|---|---|\n| Сбор | 20:00 |'))}
      </div>
      <textarea
        ref={ref}
        className="memos__input"
        aria-label="Текст памятки"
        placeholder={placeholder}
        maxLength={MEMO_MAX}
        rows={5}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setCut(false);
        }}
        onPaste={paste}
      />
      <div className="memo-ed__foot">
        <span>Вставьте текст из Word или Google Docs — оформление сохранится.</span>
        <span className="sp" />
        <span className={value.length > MEMO_MAX * 0.9 ? 'memo-ed__count memo-ed__count--full' : 'memo-ed__count'}>
          {value.length} / {MEMO_MAX}
        </span>
      </div>
      {cut && (
        <p className="memo-ed__cut" role="status">
          Документ не поместился целиком: в памятку входит {MEMO_MAX} знаков вместе с оформлением.
        </p>
      )}
      {value.trim() && (
        <section className="memo memo-ed__preview" aria-label="Как увидят бойцы">
          <b>Как увидят бойцы</b>
          <MemoText text={value} />
        </section>
      )}
    </div>
  );
}
