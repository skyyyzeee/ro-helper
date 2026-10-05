import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoText, memoFromHtml, memoPlain, nearestColor } from './memoText';

describe('the memo markup', () => {
  it('lays a memo out: headings, emphasis, colour, lists, a centred line, a table', () => {
    const { container } = render(
      <MemoText
        text={[
          '# Рейд на склад',
          '-> Сбор у ГУВД <-',
          'Форма — **ОМОН**, *без* __масок__, {red}оружие{/} ~~не~~ брать.',
          'Вторая строка.',
          '',
          '- рация',
          '- бронежилет',
          '1. построение',
          '2. выезд',
          '---',
          '| Время | Что |',
          '|---|---|',
          '| 20:00 | сбор |',
        ].join('\n')}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Рейд на склад' })).toBeInTheDocument();
    expect(container.querySelector('.mt__center')?.textContent).toBe('Сбор у ГУВД');
    expect(container.querySelector('strong')?.textContent).toBe('ОМОН');
    expect(container.querySelector('em')?.textContent).toBe('без');
    expect(container.querySelector('u')?.textContent).toBe('масок');
    expect(container.querySelector('s')?.textContent).toBe('не');
    expect(container.querySelector('.mt--red')?.textContent).toBe('оружие');
    expect(container.querySelectorAll('br')).toHaveLength(1);
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(container.querySelector('ol')?.textContent).toBe('построениевыезд');
    expect(container.querySelector('hr')).not.toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Время' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'сбор' })).toBeInTheDocument();
  });

  it('leaves a plain memo as it was, and runs nothing written as HTML', () => {
    const { container } = render(<MemoText text={'Сбор в 20:00.\nФорма — ОМОН. <img src=x onerror=alert(1)>'} />);
    expect(container.textContent).toBe('Сбор в 20:00.Форма — ОМОН. <img src=x onerror=alert(1)>');
    expect(container.querySelector('img')).toBeNull();
  });

  it('is told over the game in plain words', () => {
    expect(memoPlain('# Рейд\n-> **Сбор** у {red}ГУВД{/} <-\n- *рация*\n---\n| a | b |\n|---|---|')).toBe('Рейд\nСбор у ГУВД\n- рация\na · b');
  });

  it('takes a document copied out of Google Docs', () => {
    const html =
      '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><h1><span style="font-weight:700">Рейд</span></h1>' +
      '<p style="text-align:center"><span>Сбор у ГУВД</span></p>' +
      '<p><span>Форма — </span><span style="font-weight:700">ОМОН</span><span>, </span><span style="font-style:italic">без масок</span><span>, </span><span style="color:#ff0000">оружие</span></p>' +
      '<ul><li><p><span>рация</span></p></li><li><p><span>бронежилет</span></p></li></ul>' +
      '<table><tr><td><p><span>Время</span></p></td><td><p><span>Что</span></p></td></tr><tr><td><p>20:00</p></td><td><p>сбор</p></td></tr></table></b>';
    expect(memoFromHtml(html)).toBe(
      ['# Рейд', '-> Сбор у ГУВД <-', 'Форма — **ОМОН**, *без масок*, {red}оружие{/}', '- рация', '- бронежилет', '| Время | Что |', '|---|---|', '| 20:00 | сбор |'].join('\n'),
    );
  });

  it('takes a document copied out of Word, its bullets drawn as text', () => {
    const html =
      '<html><head><style>p{}</style></head><body><p class=MsoTitle>Памятка</p>' +
      '<p class=MsoListParagraphCxSpFirst><span style="mso-list:Ignore">·<span>&nbsp;&nbsp;</span></span><b>Рация</b> на 1</p>' +
      '<p class=MsoListParagraphCxSpLast><span style="mso-list:Ignore">·</span><u>Жилет</u></p></body></html>';
    expect(memoFromHtml(html)).toBe('# Памятка\n- **Рация** на 1\n- __Жилет__');
  });

  it('takes the nearest colour of the palette, and leaves black and grey to the text', () => {
    expect(nearestColor('rgb(255, 0, 0)')).toBe('red');
    expect(nearestColor('#00b050')).toBe('green');
    expect(nearestColor('#0070c0')).toBe('blue');
    expect(nearestColor('#000000')).toBeNull();
    expect(nearestColor('rgb(89, 89, 89)')).toBeNull();
    expect(nearestColor('')).toBeNull();
  });
});
