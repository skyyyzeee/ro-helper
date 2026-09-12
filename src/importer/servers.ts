import type { ServerSources } from './buildPack';

export const TVERSKOI: ServerSources = {
  id: 'tverskoi',
  name: 'Тверской',
  status: 'active',
  // Every document of the server, in menu order. Only those with a saved snapshot go into the pack;
  // the rest are here so organisations can already refer to them.
  documents: [
    // Кодексы и Конституция
    'const', 'uk', 'koap', 'pdd', 'upk', 'tk', 'ethics',
    // Федеральные конституционные законы
    'fkz1', 'fkz2', 'fkz3', 'fkz4',
    // Федеральные законы (15-ФЗ — это ПДД)
    'fz1', 'fz2', 'fz3', 'fz4', 'fz5', 'fz6', 'fz7', 'fz8', 'fz9', 'fz10', 'fz11', 'fz12', 'fz13', 'fz14', 'fz16',
    // Законы Москвы
    'msk-charter', 'msk-health', 'msk-news', 'msk-property',
    // Уставы организаций
    'ch-mvd', 'ch-gibdd', 'ch-fso', 'ch-army', 'ch-army-discipline', 'ch-army-guard',
    'sk-main', 'sk-gsu', 'sk-inspections', 'sk-uniform', 'sk-ethics', 'sk-kso', 'sk-appeals', 'sk-ranks',
    'ch-hospital', 'ch-news',
    // Правила проекта
    'rules-main', 'rules-gov', 'rules-crime',
  ],
};

export const ARBATSKIY: ServerSources = {
  id: 'arbatskiy',
  name: 'Арбатский',
  status: 'active',
  documents: [
    // Кодексы и Конституция
    'const', 'uk', 'koap', 'pdd', 'upk', 'tk', 'ethics',
    // Федеральные конституционные законы
    'fkz-court', 'fkz-gov', 'fkz-prosecutor', 'fkz-emergency',
    // Федеральные законы
    'fz-police', 'fz-fsb', 'fz-fso', 'fz-army', 'fz-sk', 'fz-weapons', 'fz-docs', 'fz-territory',
    'fz-immunity', 'fz-advocacy', 'fz-business', 'fz-media', 'fz-health',
  ],
};

/** Every server the importer builds a pack for. */
export const SERVERS: ServerSources[] = [TVERSKOI, ARBATSKIY];

