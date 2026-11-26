// Leitura da planilha-caixa-de-entrada (Google Planilhas compartilhada como "leitor") e o "a caminho":
// linhas novas que o assistente lançou e o app ainda não gravou. O servidor as soma (sem gravar) no resumo e no conector.
import { randomUUID } from 'node:crypto';
import { opDate } from './core.mjs';
import { loadDb, getSheetCache, setSheetCache } from './store.mjs';

const BASE = () => process.env.FINANCEUBER_SHEETS_BASE || 'https://docs.google.com'; // só muda em teste local
const SI = globalThis.SheetImport;

export function sheetId(s) {
  s = String(s || '').trim();
  const m = s.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,100}$/.test(s) ? s : null;
}

// Busca o CSV da aba. Lança Error com mensagem para a pessoa quando não dá.
export async function fetchSheetCsv(link, aba = 'entradas') {
  const id = sheetId(link);
  if (!id) throw Object.assign(new Error('link da planilha inválido (use o link do Google Planilhas)'), { status: 400 });
  // Com o gid da aba no link (#gid=123) usa a exportação exata do que aparece na tela; sem ele, busca a aba pelo nome.
  const gid = String(link || '').match(/[#&?]gid=(\d{1,12})/)?.[1];
  const url = gid
    ? `${BASE()}/spreadsheets/d/${id}/export?format=csv&gid=${gid}`
    : `${BASE()}/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(String(aba).slice(0, 60))}`;
  let r;
  try { r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'FinanceUber' }, signal: AbortSignal.timeout(8000) }); }
  catch { throw Object.assign(new Error('não consegui acessar o Google Planilhas agora'), { status: 502 }); }
  const text = await r.text();
  const type = r.headers.get('content-type') || '';
  if (!r.ok || /text\/html/i.test(type) || /^\s*<(!doctype|html)/i.test(text)) {
    throw Object.assign(new Error('a planilha não está liberada para leitura: compartilhe como "Qualquer pessoa com o link: leitor"'), { status: 422 });
  }
  if (text.length > 2_000_000) throw Object.assign(new Error('planilha grande demais (limite 2 MB)'), { status: 413 });
  return text;
}

// Atualiza a cópia da planilha guardada no servidor (se estiver mais velha que maxAgeMs)
export async function refreshSheetCache(db, maxAgeMs = 0) {
  const link = db?.sprint?.sheetImport?.url;
  if (!link) return null;
  const cache = await getSheetCache();
  const fresh = cache && cache.url === link && cache.csv && Date.now() - new Date(cache.fetchedAt).getTime() < maxAgeMs;
  if (fresh) return cache;
  try {
    const csv = await fetchSheetCsv(link);
    const next = { url: link, csv, fetchedAt: new Date().toISOString() };
    await setSheetCache(next);
    return next;
  } catch (e) {
    // Mantém a última cópia boa (se for da mesma planilha) e registra o erro
    const next = { url: link, csv: cache?.url === link ? cache.csv : '', fetchedAt: cache?.url === link ? cache.fetchedAt : null, erro: e.message, erroEm: new Date().toISOString() };
    await setSheetCache(next);
    return next;
  }
}

// Dados para o resumo e o conector: o banco que o app enviou + as linhas novas da planilha (sem gravar nada)
export async function loadWithInbox({ maxAgeMs = 10 * 60 * 1000 } = {}) {
  const { db, meta } = await loadDb();
  if (!db) return { db, meta };
  let cache = null;
  try { cache = await refreshSheetCache(db, maxAgeMs); } catch (e) { console.error('planilha', e); }
  if (!cache) return { db, meta };
  const planilha = { lida_em: cache.fetchedAt || null, erro: cache.erro || null, lancamentos_ainda_nao_gravados_no_app: 0, linhas_com_erro: 0 };
  if (!cache.csv) return { db, meta: { ...meta, planilha } };
  const merged = structuredClone(db);
  const res = SI.importCsv(merged, cache.csv, opDate(), { uid: () => 'srv-' + randomUUID(), now: () => new Date().toISOString(), recordIncome: e => merged.income.push(e) });
  planilha.lancamentos_ainda_nao_gravados_no_app = res.imported;
  planilha.linhas_com_erro = res.errors.length;
  return { db: merged, meta: { ...meta, planilha } };
}
