// Resumo para planilha (consulta pelo assistente do WhatsApp):
//   GET /api/resumo/<chave de leitura>            → CSV "campo,valor"  (use no Google Planilhas: =IMPORTDATA("<link>"))
//   GET /api/resumo/<chave de leitura>?formato=json
// Mesma chave do link do conector: só permite LER.
import { checkReadKey } from '../lib/store.mjs';
import { loadWithInbox } from '../lib/sheets.mjs';
import { opDate, nowDT, weekStats, dayStats, contractWeekOut, incomeProofOut, paceOut, pendingOut, funnelOut, monthStats } from '../lib/core.mjs';

// Valores em texto no formato brasileiro ("R$ 1.234,56"): a planilha em pt-BR não confunde ponto e vírgula
const money = n => (n === null || n === undefined || n === '' ? '' : 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const csvCell = v => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

export function buildSummary(db, meta, now = new Date()) {
  const today = opDate(now), dt = nowDT(now);
  const w = weekStats(db, today, dt), d = dayStats(db, today);
  const c = contractWeekOut(db, dt), p = paceOut(db, today, dt), pr = incomeProofOut(db, today);
  const pend = pendingOut(db, today, dt), f = funnelOut(db), m = monthStats(db, today.slice(0, 7));
  const cur = pr.meses[pr.meses.length - 1] || {};
  const rows = [
    ['atualizado_em', dt],
    ['ultima_sincronizacao_do_app', meta?.savedAt || ''],
    ['planilha_lida_em', meta?.planilha?.lida_em || ''],
    ['planilha_lancamentos_ainda_nao_gravados_no_app', meta?.planilha ? meta.planilha.lancamentos_ainda_nao_gravados_no_app : ''],
    ['planilha_linhas_com_erro', meta?.planilha ? meta.planilha.linhas_com_erro : ''],
    ['planilha_erro', meta?.planilha?.erro || ''],
    ['hoje', today],
    ['hoje_bruto', money(d.bruto)], ['hoje_uber', money(d.uber)], ['hoje_99', money(d.n99)],
    ['hoje_km', d.km], ['hoje_rs_por_km', money(d.rs_por_km)], ['hoje_horas', d.horas_online],
    ['hoje_dia_fechado', d.dia_fechado ? 'sim' : 'não'], ['hoje_conversas_novas', d.conversas_novas],
    ['hoje_leads', d.leads.total],
    ['semana_numero', `${w.semana} de ${w.de_semanas}`], ['semana_inicio', w.inicio], ['semana_fim', w.fim],
    ['semana_bruto', money(w.bruto)], ['semana_piso', money(w.piso)], ['semana_meta', money(w.meta)],
    ['semana_pct_meta', w.pct_meta], ['falta_para_meta', money(p.falta_meta)], ['falta_para_piso', money(p.falta_piso)],
    ['por_dia_para_meta', money(p.por_dia_para_meta)], ['por_dia_para_piso', money(p.por_dia_para_piso)],
    ['horas_por_dia_para_meta', p.horas_por_dia_para_meta ?? ''], ['dias_restantes_semana', w.dias_restantes],
    ['semana_km', w.km], ['semana_rs_por_km', money(w.rs_por_km)], ['semana_rs_por_hora', money(w.rs_por_hora)],
    ['semana_energia', money(w.energia)], ['semana_energia_estimada', w.energia_estimada ? 'sim' : 'não'],
    ['semana_outros_gastos_carro', money(w.outros_gastos)], ['semana_aluguel', money(w.aluguel)],
    ['semana_km_excedente_valor', money(w.km_excedente_valor)],
    ['semana_liquido', money(w.liquido)], ['semana_caixa_apos_caucao', money(w.caixa_apos_caucao)],
    ['semana_dinheiro_em_especie', money(w.dinheiro_em_especie)],
    ['semana_conversas_novas', w.conversas_novas], ['semana_leads', w.leads.total],
    ['contrato_semana', c.iniciado ? `${c.semana} de ${c.de_semanas}` : (c.configurado ? 'não começou' : 'não cadastrado')],
    ['contrato_km', c.km ?? ''], ['contrato_limite_km', c.limite_km ?? ''], ['contrato_km_disponivel_por_dia', c.km_disponivel_por_dia ?? ''],
    ['contrato_vencimento', c.vencimento ?? ''], ['contrato_caucao_paga', money(c.caucao_paga_total)],
    ['contrato_rescisao_hoje', money(c.custo_rescisao_hoje)],
    ['mes', today.slice(0, 7)], ['mes_bruto_corridas', money(cur.total_corridas)], ['mes_pct_do_ritmo_banco', cur.pct_do_ritmo ?? ''],
    ['mes_gastos_total', money(m.gastos_total)], ['mes_comissoes', money(cur.comissoes_a_parte)],
    ['prova_de_renda', `${pr.meses_que_bateram} de ${pr.meses_exigidos} meses ≥ R$ ${pr.piso_mensal}`],
    ['funil_comissao_prevista', money(f.comissao_prevista)], ['funil_negocios_abertos', f.em_aberto.length],
    ['dias_sem_fechamento', pend.dias_sem_fechamento.join(' ')],
    ['alertas', pend.alertas.join(' | ')],
  ];
  return rows;
}

export default async (req, context) => {
  if (!(await checkReadKey(context.params?.key))) return new Response('Not found', { status: 404 });
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  try {
    const { db, meta } = await loadWithInbox();
    if (!db) return new Response('campo,valor\nerro,"ainda não há dados: ative a conexão no app"\n', { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
    const rows = buildSummary(db, meta);
    if (new URL(req.url).searchParams.get('formato') === 'json') {
      return new Response(JSON.stringify(Object.fromEntries(rows)), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    const csv = 'campo,valor\n' + rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n';
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('resumo error', e);
    return new Response('Erro no servidor', { status: 500 });
  }
};

export const config = {
  path: '/api/resumo/:key',
  rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ['ip', 'domain'] },
};
