// Guard against a native build that embedded an earlier frontend build.
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('dist/index.html', root), 'utf8');
const binary = readFileSync(new URL('src-tauri/target/release/ro-helper.exe', root));
const assets = [...html.matchAll(/(?:src|href)="\/assets\/([^\"]+)"/g)].map((match) => match[1]);
if (assets.length === 0 || assets.some((asset) => !binary.includes(Buffer.from(asset)))) {
  throw new Error('The executable does not contain the current frontend. Rebuild after npm run build.');
}
if (!binary.includes(Buffer.from('com.skyze.rohelper.workspace'))) {
  throw new Error('The executable must use the isolated workspace profile.');
}
console.log('Workspace executable contains the current frontend and its own application identifier.');
