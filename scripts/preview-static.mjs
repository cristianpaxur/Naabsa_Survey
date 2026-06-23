// Servidor estático mínimo para inspeção visual do preview do PDF.
// Serve .tmp_preview.html em "/" e demais arquivos do repo por caminho.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const PORT = 4599;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.css': 'text/css',
  '.js': 'text/javascript',
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (path === '/' || path === '') path = '/.tmp_preview.html';
    const file = join(ROOT, path);
    const buf = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(PORT, () => console.log(`preview-static on http://localhost:${PORT}`));
