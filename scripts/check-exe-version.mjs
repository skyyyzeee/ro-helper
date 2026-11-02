// The exe the Tauri JS CLI builds can carry a stale version in its Windows resources (the CLI resolves
// «../package.json» from a cache of its own — seen 2026-10-31: the app at 2.26.0, the exe stamped 2.19.1,
// forever asking to update). `cargo build --release` stamps it right. This check reads the binary and looks
// for the package.json version in its version strings, so a stale build is caught before anyone runs it.
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const exe = new URL('src-tauri/target/release/ro-helper.exe', root);

let binary;
try {
  binary = readFileSync(exe);
} catch {
  console.error(`Нет собранного exe: ${exe.pathname} — сначала cargo build --release в src-tauri.`);
  process.exit(1);
}

// Windows version resources are UTF-16LE; the config JSON the app carries is UTF-8. Either proves the stamp.
const stamp = binary.includes(Buffer.from(version, 'utf16le')) || binary.includes(Buffer.from(version, 'utf8'));
if (!stamp) {
  console.error(
    `В exe зашита не та версия: ждали ${version} из package.json. ` +
      'Это кэш Tauri CLI — пересоберите напрямую: cd src-tauri && cargo clean -p ro-helper && cargo build --release.',
  );
  process.exit(1);
}
console.log(`Версия exe совпадает с package.json (${version}).`);
