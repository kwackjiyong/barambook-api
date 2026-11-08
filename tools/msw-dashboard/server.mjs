// 바람클래식 플레이 기록 로컬 대시보드.
//   node tools/msw-dashboard/server.mjs
// 키는 환경변수 MSW_ANALYTICS_KEY나 tools/msw-dashboard/.key 파일(커밋 안 됨)에서 읽는다.
// 브라우저는 이 로컬 서버(127.0.0.1)만 부르고, 키는 이 서버가 헤더로 붙여 API에 넘긴다.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const keyFile = join(here, '.key');
const key =
  process.env.MSW_ANALYTICS_KEY ||
  (existsSync(keyFile) ? readFileSync(keyFile, 'utf8').trim() : '');
const base = (
  process.env.MSW_ANALYTICS_BASE || 'https://barambook.com/data/msw-analytics'
).replace(/\/$/, '');
const port = Number(process.env.PORT || 4317);
const allowed = new Set(['summary', 'daily', 'players', 'events']);

if (!key) {
  console.error(
    `키가 없습니다. MSW_ANALYTICS_KEY 환경변수를 주거나 ${keyFile} 에 키 한 줄을 넣어 주세요.`,
  );
  process.exit(1);
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const html = await readFile(join(here, 'index.html'));
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(html);
      return;
    }
    const route = url.pathname.match(/^\/api\/([a-z-]+)$/)?.[1];
    const isRebuild = route === 'rebuild-daily' && req.method === 'POST';
    if (!route || (!allowed.has(route) && !isRebuild)) {
      res.writeHead(404).end();
      return;
    }
    url.searchParams.delete('key');
    const upstream = await fetch(`${base}/${route}${url.search}`, {
      method: isRebuild ? 'POST' : 'GET',
      headers: { 'x-msw-analytics-key': key },
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      'content-type':
        upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch (error) {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: String(error) }));
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`바람클래식 플레이 기록: http://127.0.0.1:${port}  (API ${base})`);
});
