import { readFile, mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
const metadata = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
if (manifest.version !== metadata.version) throw new Error('Manifest and package versions differ.');
const files = ['manifest.json', 'i18n.js', '_locales/en/messages.json', '_locales/zh_CN/messages.json', 'background.js', 'content.js', 'offscreen.html', 'offscreen.js', 'popup.html', 'popup.js', 'popup.css', 'LICENSE', 'PRIVACY.md', ...Object.values(manifest.icons)];
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const local = [];
const central = [];
let offset = 0;
for (const filename of files.sort()) {
  const data = await readFile(new URL(filename, root));
  const name = Buffer.from(filename);
  const crc = crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6); header.writeUInt16LE(33, 12);
  header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  local.push(header, name, data);
  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0x0800, 8); entry.writeUInt16LE(33, 14);
  entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42);
  central.push(entry, name);
  offset += header.length + name.length + data.length;
}
const directory = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
await mkdir(new URL('dist/', root), { recursive: true });
const filename = `scrollkeep-${manifest.version}.zip`;
await writeFile(new URL(`dist/${filename}`, root), Buffer.concat([...local, directory, end]));
console.log(`Built dist/${filename}: ${files.length} explicitly selected runtime files; backups and personal files excluded.`);
