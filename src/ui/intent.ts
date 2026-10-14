import { intentDocuments, type Intent, type ServerPack } from '../core';

/** Where an intent sent the search, as the results' line says it: «УК, КоАП», «УПК, 6-ФЗ, Устав и др.». */
export function intentWhere(pack: ServerPack, intent: Intent): string {
  const ids = new Set(intentDocuments(pack, intent));
  const names = [...new Set(pack.documents.filter((document) => ids.has(document.id)).map((document) => document.short))];
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} и др.` : names.join(', ');
}
