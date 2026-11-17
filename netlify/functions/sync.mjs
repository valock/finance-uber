// API do app: ativar conexão, enviar e restaurar os dados
//   POST /api/setup   { keyHash, readHash }      → cria a conexão (só uma vez)
//   PUT  /api/sync    Authorization: Bearer <chave>, corpo { db, device }
//   GET  /api/sync    Authorization: Bearer <chave> → { db, meta }
import { isHex64 } from '../lib/core.mjs';
import { getAuth, createAuth, checkWriteKey, saveDb, loadDb } from '../lib/store.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const bearer = req => req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] || '';

export default async (req) => {
  const path = new URL(req.url).pathname;
  try {
    if (path === '/api/setup') {
      if (req.method === 'GET') return json({ configurado: !!(await getAuth()) });
      if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405);
      const body = await req.json().catch(() => null);
      if (!body || !isHex64(body.keyHash) || !isHex64(body.readHash)) return json({ erro: 'dados inválidos' }, 400);
      const created = await createAuth(body.keyHash, body.readHash);
      return created ? json({ ok: true }, 201) : json({ erro: 'conexão já existe: use a chave do aparelho que ativou' }, 409);
    }

    // /api/sync
    if (!(await checkWriteKey(bearer(req)))) return json({ erro: 'chave inválida' }, 401);
    if (req.method === 'GET') {
      const { db, meta } = await loadDb();
      return json({ db, meta });
    }
    if (req.method === 'PUT') {
      const body = await req.json().catch(() => null);
      if (!body || typeof body.db !== 'object' || body.db === null || !Array.isArray(body.db.income)) return json({ erro: 'dados inválidos' }, 400);
      const meta = { savedAt: new Date().toISOString(), device: String(body.device || '').slice(0, 60) };
      await saveDb(body.db, meta);
      return json({ ok: true, savedAt: meta.savedAt });
    }
    return json({ erro: 'método não permitido' }, 405);
  } catch (e) {
    console.error('sync error', e);
    return json({ erro: 'falha no servidor' }, 500);
  }
};

export const config = {
  path: ['/api/setup', '/api/sync'],
  rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ['ip', 'domain'] },
};
