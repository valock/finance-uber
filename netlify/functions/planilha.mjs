// Lê a planilha-caixa-de-entrada (Google Planilhas) para o app importar.
//   POST /api/planilha   Authorization: Bearer <chave do app>   corpo { planilha: "<link ou id>", aba: "entradas" }
//   → o CSV da aba (a planilha precisa estar como "Qualquer pessoa com o link: leitor")
// Só busca endereços do Google Planilhas montados aqui; não é um proxy aberto.
import { checkWriteKey, setSheetCache } from '../lib/store.mjs';
import { fetchSheetCsv } from '../lib/sheets.mjs';

const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const bearer = req => req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] || '';

export default async (req) => {
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405);
  if (!(await checkWriteKey(bearer(req)))) return json({ erro: 'chave inválida: conecte o app em ⚙️ → Conectar ao Claude' }, 401);
  const body = await req.json().catch(() => null);
  try {
    const csv = await fetchSheetCsv(body?.planilha, body?.aba || 'entradas');
    // Aproveita a leitura: o resumo e o conector já passam a ver as mesmas linhas
    await setSheetCache({ url: String(body.planilha).trim(), csv, fetchedAt: new Date().toISOString() }).catch(() => {});
    return new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (e) {
    return json({ erro: e.message }, e.status || 500);
  }
};

export const config = {
  path: '/api/planilha',
  rateLimit: { windowSize: 60, windowLimit: 30, aggregateBy: ['ip', 'domain'] },
};
