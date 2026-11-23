// Servidor MCP (conector do Claude) — só leitura dos dados do FinanceUber
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { opDate, nowDT, addDays, mondayOf, isDate, isMonth, weekStats, dayStats, monthStats, entries, overview, LEAD_SOURCES, leadCounts,
  contractWeekOut, incomeProofOut, chargesOut, paceOut, pendingOut, funnelOut, hourlyOut } from './core.mjs';

const INSTRUCTIONS = `Dados financeiros do FinanceUber de um motorista de Uber/99 no Brasil (valores em R$).
Ele está num "sprint" de 16 semanas com um carro elétrico alugado: aluguel e caução semanais, limite de km por semana do contrato
(do vencimento ao vencimento), piso e meta de bruto semanal e piso mensal exigido pelo banco (prova de renda).
O bruto conta na semana de segunda 04:00 a segunda 04:00 (horário de Brasília); km, excedente e pagamentos seguem a semana do contrato.
Energia = recargas reais registradas; sem recarga no período, vem uma estimativa pelo km (campo energia_estimada / energia_real).
Também registra horas online, viagens, dinheiro em espécie, conversas novas, leads de corretagem por origem e um funil de vendas.
Comece por resumo_semana; use semana_contrato para km e pagamentos, ritmo para quanto falta, pendencias para o que falta lançar.
Datas no formato AAAA-MM-DD. Os dados vêm do app e podem estar alguns minutos atrasados (ultima_sincronizacao em situacao_financeira).`;

const ro = { readOnlyHint: true, openWorldHint: false };
const text = obj => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 1) }] });
const err = msg => ({ content: [{ type: 'text', text: msg }], isError: true });

export function buildServer(getData) {
  const server = new McpServer({ name: 'financeuber', version: '1.1.0' }, { instructions: INSTRUCTIONS });
  const withDb = fn => async (args) => {
    const { db, meta } = await getData();
    if (!db) return err('Ainda não há dados: abra o app e ative "Conectar ao Claude" em ⚙️.');
    return fn(db, args || {}, meta);
  };

  server.registerTool('resumo_semana', {
    title: 'Resumo da semana',
    description: 'Resumo de uma semana do sprint (segunda a domingo): bruto Uber + 99 contra piso e meta, quanto falta por dia, km, R$/km, R$/hora, energia (real das recargas ou estimada), outros gastos do carro, aluguel, km excedente, líquido, caixa após caução, horas online, dinheiro em espécie, conversas novas, leads por origem e o resultado de cada dia. Sem "data", usa a semana atual.',
    inputSchema: { data: z.string().optional().describe('Qualquer dia da semana desejada (AAAA-MM-DD). Padrão: hoje') },
    annotations: ro,
  }, withDb((db, { data }) => {
    if (data && !isDate(data)) return err('Use a data no formato AAAA-MM-DD.');
    const today = opDate();
    const ref = data || today;
    // Semana atual: calcula até hoje. Semana passada: como se fosse o domingo dela. Futura: a partir da data pedida.
    const end = addDays(mondayOf(ref), 6);
    const asOf = mondayOf(ref) === mondayOf(today) ? today : (end < today ? end : ref);
    return text(weekStats(db, asOf, asOf === today ? nowDT() : asOf + 'T23:59'));
  }));

  server.registerTool('resumo_dia', {
    title: 'Resumo do dia',
    description: 'Resultado de um dia: bruto Uber e 99, km, R$/km, R$/hora, horas e viagens por app, dinheiro em espécie, energia e recargas, bateria no início e no fim, conversas novas, leads por origem, odômetro, observação e se o dia foi aberto/fechado (ou folga). Sem "data", usa hoje (o dia vira às 04:00).',
    inputSchema: { data: z.string().optional().describe('Dia (AAAA-MM-DD). Padrão: hoje') },
    annotations: ro,
  }, withDb((db, { data }) => {
    if (data && !isDate(data)) return err('Use a data no formato AAAA-MM-DD.');
    return text(dayStats(db, data || opDate()));
  }));

  server.registerTool('resumo_mes', {
    title: 'Resumo do mês',
    description: 'Resumo de um mês: renda por tipo (uber, 99, salario, comissao), bruto das corridas contra o piso do banco, gastos por tipo e categoria, contas fixas (pagas/pendentes), km e leads por origem. Sem "mes", usa o mês atual.',
    inputSchema: { mes: z.string().optional().describe('Mês (AAAA-MM). Padrão: mês atual') },
    annotations: ro,
  }, withDb((db, { mes }) => {
    if (mes && !isMonth(mes)) return err('Use o mês no formato AAAA-MM.');
    return text(monthStats(db, mes || opDate().slice(0, 7)));
  }));

  server.registerTool('lancamentos', {
    title: 'Lançamentos de um período',
    description: 'Lista os lançamentos entre duas datas (inclusive): renda, gastos, leituras de km/odômetro, leads, recargas, pagamentos do contrato e o fechamento de cada dia. Use para detalhar ou conferir valores.',
    inputSchema: {
      inicio: z.string().describe('Data inicial (AAAA-MM-DD)'),
      fim: z.string().describe('Data final (AAAA-MM-DD)'),
      tipo: z.enum(['todos', 'renda', 'gastos', 'km', 'leads', 'recargas', 'pagamentos', 'dias']).optional().describe('Filtrar por tipo. Padrão: todos'),
    },
    annotations: ro,
  }, withDb((db, { inicio, fim, tipo }) => {
    if (!isDate(inicio) || !isDate(fim)) return err('Use as datas no formato AAAA-MM-DD.');
    if (inicio > fim) return err('"inicio" deve ser antes de "fim".');
    return text(entries(db, inicio, fim, tipo || 'todos'));
  }));

  server.registerTool('leads', {
    title: 'Leads por origem',
    description: 'Conta os leads gerados entre duas datas, por origem (Dentro do Uber, Orgânico, Parceiro, Outros) e por dia. Sem datas, usa os últimos 30 dias.',
    inputSchema: {
      inicio: z.string().optional().describe('Data inicial (AAAA-MM-DD)'),
      fim: z.string().optional().describe('Data final (AAAA-MM-DD)'),
    },
    annotations: ro,
  }, withDb((db, { inicio, fim }) => {
    const de = fim || opDate(), ds = inicio || addDays(de, -29);
    if (!isDate(ds) || !isDate(de)) return err('Use as datas no formato AAAA-MM-DD.');
    const list = (db.sprint?.leads || []).filter(l => l.date >= ds && l.date <= de);
    const porDia = {};
    list.forEach(l => { (porDia[l.date] ||= []).push(l); });
    return text({
      inicio: ds, fim: de, origens: LEAD_SOURCES, total: leadCounts(list),
      por_dia: Object.keys(porDia).sort().map(d => ({ data: d, ...leadCounts(porDia[d]) })),
    });
  }));

  server.registerTool('situacao_financeira', {
    title: 'Situação financeira geral',
    description: 'Visão geral: data da última sincronização do app, configuração do sprint e do carro, metas, saldos bancários, dívidas, financiamentos, valores a receber e bens.',
    inputSchema: {},
    annotations: ro,
  }, withDb((db, _a, meta) => text(overview(db, meta))));

  server.registerTool('dados_completos', {
    title: 'Dados completos (JSON)',
    description: 'Todos os dados brutos do app em JSON (o mesmo arquivo do backup). Use só quando as outras ferramentas não responderem a pergunta.',
    inputSchema: {},
    annotations: ro,
  }, withDb((db, _a, meta) => text({ ultima_sincronizacao: meta?.savedAt || null, db })));

  const range = (inicio, fim, defDays) => {
    const de = fim || opDate(), ds = inicio || addDays(de, -(defDays - 1));
    if (!isDate(ds) || !isDate(de)) return { error: 'Use as datas no formato AAAA-MM-DD.' };
    if (ds > de) return { error: '"inicio" deve ser antes de "fim".' };
    return { ds, de };
  };
  const optRange = {
    inicio: z.string().optional().describe('Data inicial (AAAA-MM-DD)'),
    fim: z.string().optional().describe('Data final (AAAA-MM-DD). Padrão: hoje'),
  };

  server.registerTool('semana_contrato', {
    title: 'Semana do contrato do carro',
    description: 'Semana do contrato de aluguel (do vencimento ao vencimento): km usados contra o limite, km disponível por dia, km excedente e valor, aluguel e caução da semana, próximo vencimento, aluguel e caução pagos até agora, caução prevista, semanas cumpridas e custo de rescisão se sair hoje. Sem "data", usa agora.',
    inputSchema: { data: z.string().optional().describe('Um dia (AAAA-MM-DD) para ver a semana do contrato daquele dia. Padrão: agora') },
    annotations: ro,
  }, withDb((db, { data }) => {
    if (data && !isDate(data)) return err('Use a data no formato AAAA-MM-DD.');
    return text(contractWeekOut(db, data ? data + 'T12:00' : nowDT()));
  }));

  server.registerTool('prova_de_renda', {
    title: 'Prova de renda (piso mensal do banco)',
    description: 'Por mês: Uber, 99, parte em dinheiro e parte no app, comissões à parte, total das corridas contra o piso mensal do banco (ex.: R$ 9.000), se bateu, ritmo do mês atual e quantos meses já bateram (x de 4).',
    inputSchema: {
      inicio: z.string().optional().describe('Mês inicial (AAAA-MM)'),
      fim: z.string().optional().describe('Mês final (AAAA-MM)'),
    },
    annotations: ro,
  }, withDb((db, { inicio, fim }) => {
    if ((inicio && !isMonth(inicio)) || (fim && !isMonth(fim))) return err('Use os meses no formato AAAA-MM.');
    return text(incomeProofOut(db, opDate(), inicio, fim));
  }));

  server.registerTool('recargas', {
    title: 'Recargas do carro elétrico',
    description: 'Sessões de recarga entre duas datas: local, rua ou casa, kWh, R$ de energia, taxa de ociosidade, % no início e no fim, R$/kWh médio, total, custo por km e quantas estão sem valor. Sem datas, últimos 7 dias.',
    inputSchema: optRange,
    annotations: ro,
  }, withDb((db, { inicio, fim }) => {
    const r = range(inicio, fim, 7); if (r.error) return err(r.error);
    return text(chargesOut(db, r.ds, r.de));
  }));

  server.registerTool('ritmo', {
    title: 'Ritmo para o piso e a meta',
    description: 'Quanto falta para o piso e a meta da semana, por dia restante, em R$ e em horas (no R$/hora dos últimos 14 dias), km disponível por dia (pela semana do contrato quando cadastrada) e se o mês está no ritmo do piso do banco.',
    inputSchema: {},
    annotations: ro,
  }, withDb(db => text(paceOut(db, opDate(), nowDT()))));

  server.registerTool('pendencias', {
    title: 'Pendências e alertas',
    description: 'Dias sem fechamento, dias fechados com campos faltando (odômetro, horas, bateria), recargas sem valor e alertas ativos: km acima de 80% do limite do contrato, taxa de ociosidade, bateria baixa, ritmo abaixo do piso, mês abaixo do ritmo do banco, excesso de horas e dias seguidos sem folga.',
    inputSchema: {},
    annotations: ro,
  }, withDb(db => text(pendingOut(db, opDate(), nowDT()))));

  server.registerTool('funil_vendas', {
    title: 'Funil de vendas (corretagem)',
    description: 'Vendas em aberto (apelido do cliente, etapa, próximo passo e data, previsão, comissão estimada e chance), comissão prevista total e ponderada pela chance, por mês de previsão, e vendas ganhas.',
    inputSchema: {},
    annotations: ro,
  }, withDb(db => text(funnelOut(db))));

  server.registerTool('desempenho_por_hora', {
    title: 'Desempenho por hora',
    description: 'R$/hora online por app (Uber e 99) e por dia da semana, com horas, viagens e bruto, entre duas datas. Só conta dias com horas registradas. Sem datas, últimos 14 dias.',
    inputSchema: optRange,
    annotations: ro,
  }, withDb((db, { inicio, fim }) => {
    const r = range(inicio, fim, 14); if (r.error) return err(r.error);
    return text(hourlyOut(db, r.ds, r.de));
  }));

  return server;
}

export async function handleMcp(req, getData) {
  // Servidor sem estado, só JSON por POST (função serverless não mantém SSE aberto)
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  const server = buildServer(getData);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}
