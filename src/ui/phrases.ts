import { useCallback, useEffect, useState } from 'react';
import type { Organization } from '../core';
import type { PlatformAdapter } from '../platform/types';
import type { PlayerCard } from './player';

/**
 * A phrase for the game's chat, kept ready (issue #40): one click or key puts it into the clipboard, and the
 * player pastes it into the chat themselves. The assistant never types into the game — that is what keeps it
 * a program that does not interact with the game.
 */
export interface Phrase {
  id: string;
  /** What it is for, on its button: «Представиться». */
  title: string;
  /** What is pasted; {должность}, {имя} and {организация} come from the player's profile. */
  text: string;
}

export const PHRASES_MAX = 20;
export const PHRASE_TITLE_MAX = 40;
export const PHRASE_TEXT_MAX = 300;
/** The first nine have keys of their own, when the player turns them on. */
export const PHRASE_KEYS = 9;

/** Settings key: the player's own list for a faction of a server; absent — the faction's ready set. */
export const phrasesKey = (server: string, organization: string) => `phrases:${server}:${organization}`;
/** Settings key: what is held with a digit to copy a phrase over the game — «Alt», «Ctrl+Alt», «Ctrl+Shift»; '' — no keys. */
export const PHRASE_KEYS_SETTING = 'phrases.keys';
export const PHRASE_MODIFIERS = ['Alt', 'Ctrl+Alt', 'Ctrl+Shift'] as const;

/**
 * Ready sets say nothing of what the law gives or takes — that differs by server and is the laws' to say:
 * only how an officer speaks. They are a start; the player rewrites them to their charter.
 */
const FORCE: Phrase[] = [
  { id: 'hello', title: 'Представиться', text: 'Здравствуйте. {должность} {имя}, {организация}.' },
  { id: 'papers', title: 'Документы', text: 'Предъявите, пожалуйста, документы, удостоверяющие личность.' },
  { id: 'reason', title: 'Причина обращения', text: 'Причина обращения: ' },
  { id: 'hands', title: 'Руки на виду', text: 'Держите руки на виду и не делайте резких движений.' },
  { id: 'detained', title: 'Задержание', text: 'Вы задержаны. Сохраняйте спокойствие и следуйте моим указаниям.' },
  { id: 'follow', title: 'Пройти со мной', text: 'Пройдёмте со мной для дальнейшего разбирательства.' },
  { id: 'wait', title: 'Ожидайте', text: 'Ожидайте, пожалуйста. Идёт проверка.' },
  { id: 'free', title: 'Свободны', text: 'Проверка окончена, вы свободны. Всего доброго.' },
];

const GIBDD: Phrase[] = [
  { id: 'hello', title: 'Представиться', text: 'Здравствуйте. {должность} {имя}, {организация}.' },
  { id: 'stop', title: 'Требование остановиться', text: 'Водитель, прижмитесь к обочине и остановите транспортное средство.' },
  { id: 'papers', title: 'Документы', text: 'Предъявите, пожалуйста, водительское удостоверение и документы на транспортное средство.' },
  { id: 'reason', title: 'Причина остановки', text: 'Причина остановки: ' },
  { id: 'out', title: 'Выйти из машины', text: 'Заглушите двигатель и выйдите, пожалуйста, из транспортного средства.' },
  { id: 'inspect', title: 'Осмотр машины', text: 'Будет проведён осмотр транспортного средства. Откройте, пожалуйста, багажник.' },
  { id: 'fine', title: 'Штраф', text: 'За данное нарушение вам будет выписан штраф.' },
  { id: 'wait', title: 'Ожидайте', text: 'Ожидайте, пожалуйста. Идёт проверка документов.' },
  { id: 'free', title: 'Счастливого пути', text: 'Проверка окончена. Счастливого пути, соблюдайте правила дорожного движения.' },
];

/** The ready set of an organisation: the traffic police have their own, the other forces of the state share one. */
export function defaultPhrases(organization?: Organization): Phrase[] {
  if (!organization) return [];
  if (organization.id === 'gibdd') return GIBDD;
  return organization.force ? FORCE : [];
}

/** The phrase as it is pasted: the profile's words in, what the profile does not have left out without a gap. */
export function fillPhrase(text: string, who: { player?: PlayerCard; organization?: string }): string {
  const words: Record<string, string | undefined> = { должность: who.player?.position, имя: who.player?.gameName, организация: who.organization };
  return text
    .replace(/\{(должность|имя|организация)\}/g, (_, word: string) => words[word]?.trim() ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ ([,.!?;:])/g, '$1')
    .replace(/([.!?]) ?, /g, '$1 ')
    .replace(/,(?=[.!?])/g, '')
    .replace(/^[ ,]+/, '');
}

/** A list as it may be kept: trimmed, cut to length, the empty ones dropped. */
export function cleanPhrases(list: Phrase[]): Phrase[] {
  return list
    .map((p) => ({ id: p.id, title: p.title.trim().slice(0, PHRASE_TITLE_MAX), text: p.text.slice(0, PHRASE_TEXT_MAX) }))
    .filter((p) => p.title && p.text.trim())
    .slice(0, PHRASES_MAX);
}

const isPhrase = (value: unknown): value is Phrase =>
  !!value && typeof value === 'object' && typeof (value as Phrase).id === 'string' && typeof (value as Phrase).title === 'string' && typeof (value as Phrase).text === 'string';

export interface PhrasesControl {
  phrases: Phrase[];
  /** The player changed the ready set: there is something to go back from. */
  custom: boolean;
  save(list: Phrase[]): void;
  /** Back to the faction's ready set. */
  reset(): void;
}

/** The phrases of the player's faction on their server: their own list, or the faction's ready set. */
export function usePhrases(platform: Pick<PlatformAdapter, 'readSetting' | 'writeSetting'>, server: string, organization?: Organization): PhrasesControl {
  const key = organization ? phrasesKey(server, organization.id) : null;
  const [own, setOwn] = useState<Phrase[] | null>(null);
  useEffect(() => {
    setOwn(null);
    if (!key) return;
    let active = true;
    void platform.readSetting<unknown>(key).then((saved) => {
      if (active && Array.isArray(saved)) setOwn(cleanPhrases(saved.filter(isPhrase)));
    });
    return () => {
      active = false;
    };
  }, [platform, key]);

  const save = useCallback(
    (list: Phrase[]) => {
      if (!key) return;
      const clean = cleanPhrases(list);
      setOwn(clean);
      void platform.writeSetting(key, clean);
    },
    [platform, key],
  );
  const reset = useCallback(() => {
    if (!key) return;
    setOwn(null);
    void platform.writeSetting(key, null);
  }, [platform, key]);

  return { phrases: own ?? defaultPhrases(organization), custom: own !== null, save, reset };
}
