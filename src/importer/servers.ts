import type { ServerSources } from './buildPack';

export const TVERSKOI: ServerSources = {
  id: 'tverskoi',
  name: 'Тверской',
  status: 'active',
  // Every document required in the server pack, in menu order.
  documents: [
    // Кодексы и Конституция
    'const', 'uk', 'koap', 'pdd', 'upk', 'tk', 'ethics',
    // Федеральные конституционные законы
    'fkz1', 'fkz2', 'fkz3', 'fkz4', 'fkz-assembly',
    // Федеральные законы (16-ФЗ на форуме у двух законов: о собраниях и о Росгвардии)
    'fz1', 'fz2', 'fz3', 'fz4', 'fz5', 'fz6', 'fz7', 'fz8', 'fz9', 'fz10', 'fz11', 'fz12', 'fz13', 'fz14', 'fz15', 'fz16', 'fz16-fsvng', 'fz17',
    // Законы Москвы
    'msk-charter', 'msk-health', 'msk-news', 'msk-property',
    // Уставы организаций
    'ch-mvd', 'ch-gibdd', 'ch-fso', 'ch-army', 'ch-army-discipline', 'ch-army-guard', 'ch-army-structure', 'ch-army-id',
    'sk-structure', 'sk-service', 'sk-ethics', 'sk-appeals', 'sk-ranks',
    'ch-gov', 'ch-hospital', 'ch-news',
    // Правила проекта — снимки хранятся один раз, в data/_shared/sources (кроме rules-server: он свой у каждого сервера)
    'rules-main', 'rules-gov', 'rules-crime',
    'rules-leaders', 'rules-martial', 'rules-supply', 'rules-robbery', 'rules-business', 'rules-bank',
    'rules-workshops', 'rules-war', 'rules-fort', 'rules-server', 'rules-software', 'rules-forum',
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
    // Уставы и положения организаций
    'ch-mvd', 'ch-gibdd', 'ch-gibdd-discipline', 'ch-gibdd-osb', 'ch-fsb', 'ch-fsb-usb', 'ch-fso',
    'ch-army', 'ch-army-discipline', 'ch-army-guard',
    'sk-charter', 'ch-gov', 'ch-hospital', 'ch-news', 'ch-news-ads', 'ch-news-edit',
    // Правила проекта — снимки хранятся один раз, в data/_shared/sources (кроме rules-server: он свой у каждого сервера)
    'rules-main', 'rules-gov', 'rules-crime',
    'rules-leaders', 'rules-martial', 'rules-supply', 'rules-robbery', 'rules-business', 'rules-bank',
    'rules-workshops', 'rules-war', 'rules-fort', 'rules-server', 'rules-software', 'rules-forum',
  ],
};

export const KUTUZOVSKIY: ServerSources = {
  id: 'kutuzovskiy',
  name: 'Кутузовский',
  status: 'active',
  documents: [
    // Кодексы и Конституция
    'const', 'uk', 'koap', 'pdd', 'upk', 'tk', 'ethics',
    // Федеральные конституционные законы
    'fkz-court', 'fkz-gov', 'fkz-ministries', 'fkz-duma', 'fkz-emergency',
    // Федеральные законы
    'fz-police', 'fz-gibdd', 'fz-fsb', 'fz-fso', 'fz-sk', 'fz-prosecutor', 'fz-army', 'fz-weapons',
    'fz-secrets', 'fz-health', 'fz-advocacy', 'fz-service', 'fz-immunity', 'fz-territory', 'fz-parties', 'fz-business',
    // Уставы и положения организаций
    'ch-mvd', 'ch-mvd-units', 'ch-gibdd', 'ch-fsb', 'ch-fso', 'ch-army', 'ch-army-discipline', 'ch-army-guard',
    'sk-main', 'sk-ranks', 'sk-appeals', 'ch-hospital', 'ch-news', 'ch-news-edit',
    // Правила проекта — снимки хранятся один раз, в data/_shared/sources (кроме rules-server: он свой у каждого сервера)
    'rules-main', 'rules-gov', 'rules-crime',
    'rules-leaders', 'rules-martial', 'rules-supply', 'rules-robbery', 'rules-business', 'rules-bank',
    'rules-workshops', 'rules-war', 'rules-fort', 'rules-server', 'rules-software', 'rules-forum',
  ],
};

/** Every server the importer builds a pack for. */
export const SERVERS: ServerSources[] = [TVERSKOI, ARBATSKIY, KUTUZOVSKIY];

