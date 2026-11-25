// Lê a planilha-caixa-de-entrada (Google Planilhas) para o app importar.
//   POST /api/planilha   Authorization: Bearer <chave do app>   corpo { planilha: "<link ou id>", aba: "entradas" }
//   → o CSV da aba (a planilha precisa estar como "Qualquer pessoa com o link: leitor")
// Só busca endereços do Google Planilhas montados aqui; não é um proxy aberto.
import { checkWriteKey } from '../lib/store.mjs';

const BASE = process.env.FINANCEUBER_SHEETS_BASE || 'https://docs.google.com'; // só muda em teste local
const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const bearer = req => req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] || '';

export function sheetId(s) {
  s = String(s || '').trim();
  const m = s.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,100}$/.test(s) ? s : null;
}

export default async (req) => {
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405);
  if (!(await checkWriteKey(bearer(req)))) return json({ erro: 'chave inválida: conecte o app em ⚙️ → Conectar ao Claude' }, 401);
  const body = await req.json().catch(() => null);
  const id = sheetId(body?.planilha);
  if (!id) return json({ erro: 'link da planilha inválido (use o link do Google Planilhas)' }, 400);
  const aba = String(body?.aba || 'entradas').slice(0, 60);
  // Com o gid da aba no link (#gid=123) usa a exportação exata do que aparece na tela;
  // sem ele, busca a aba pelo nome.
  const gid = String(body?.planilha || '').match(/[#&?]gid=(\d{1,12})/)?.[1];
  const url = gid
    ? `${BASE}/spreadsheets/d/${id}/export?format=csv&gid=${gid}`
    : `${BASE}/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(aba)}`;
  let r;
  try { r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'FinanceUber' } }); }
  catch { return json({ erro: 'não consegui acessar o Google Planilhas agora' }, 502); }
  const text = await r.text();
  const type = r.headers.get('content-type') || '';
  if (!r.ok || /text\/html/i.test(type) || /^\s*<(!doctype|html)/i.test(text)) {
    return json({ erro: 'a planilha não está liberada para leitura: compartilhe como "Qualquer pessoa com o link: leitor"' }, 422);
  }
  if (text.length > 2_000_000) return json({ erro: 'planilha grande demais (limite 2 MB)' }, 413);
  return new Response(text, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' } });
};

export const config = {
  path: '/api/planilha',
  rateLimit: { windowSize: 60, windowLimit: 30, aggregateBy: ['ip', 'domain'] },
};
