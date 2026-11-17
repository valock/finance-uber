// Servidor MCP (conector do Claude) — só leitura dos dados do FinanceUber
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { opDate, addDays, mondayOf, isDate, isMonth, weekStats, dayStats, monthStats, entries, overview, LEAD_SOURCES, leadCounts } from './core.mjs';

const INSTRUCTIONS = `Dados financeiros do FinanceUber de um motorista de Uber/99 no Brasil (valores em R$).
Ele está num "sprint" de 16 semanas com um carro elétrico alugado: aluguel e caução semanais, limite de km por semana,
piso e meta de bruto semanal, R$/km mínimo e piso mensal exigido pelo banco. A semana vai de segunda 04:00 a segunda 04:00
(horário de Brasília). Também registra leads de corretagem por origem (Dentro do Uber, Orgânico, Parceiro, Outros).
Comece por resumo_semana para perguntas sobre a semana; use as datas no formato AAAA-MM-DD.
Os dados vêm do app no celular e podem estar alguns minutos atrasados (veja ultima_sincronizacao em situacao_financeira).`;

const ro = { readOnlyHint: true, openWorldHint: false };
const text = obj => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 1) }] });
const err = msg => ({ content: [{ type: 'text', text: msg }], isError: true });

export function buildServer(getData) {
  const server = new McpServer({ name: 'financeuber', version: '1.0.0' }, { instructions: INSTRUCTIONS });
  const withDb = fn => async (args) => {
    const { db, meta } = await getData();
    if (!db) return err('Ainda não há dados: abra o app e ative "Conectar ao Claude" em ⚙️.');
    return fn(db, args || {}, meta);
  };

  server.registerTool('resumo_semana', {
    title: 'Resumo da semana',
    description: 'Resumo de uma semana do sprint (segunda a domingo): bruto Uber + 99 contra piso e meta, quanto falta por dia, km contra o limite, R$/km, energia, aluguel, líquido, caixa após caução, bruto do mês contra o piso do banco, leads por origem e o resultado de cada dia. Sem "data", usa a semana atual.',
    inputSchema: { data: z.string().optional().describe('Qualquer dia da semana desejada (AAAA-MM-DD). Padrão: hoje') },
    annotations: ro,
  }, withDb((db, { data }) => {
    if (data && !isDate(data)) return err('Use a data no formato AAAA-MM-DD.');
    const today = opDate();
    const ref = data || today;
    // Semana atual: calcula até hoje. Semana passada: como se fosse o domingo dela. Futura: a partir da data pedida.
    const end = addDays(mondayOf(ref), 6);
    const asOf = mondayOf(ref) === mondayOf(today) ? today : (end < today ? end : ref);
    return text(weekStats(db, asOf));
  }));

  server.registerTool('resumo_dia', {
    title: 'Resumo do dia',
    description: 'Resultado de um dia: bruto Uber e 99, km, R$/km, energia, leads por origem, odômetro e se o dia foi aberto/fechado no app. Sem "data", usa hoje (o dia vira às 04:00).',
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
    description: 'Lista os lançamentos entre duas datas (inclusive): renda, gastos, leituras de km/odômetro e leads. Use para detalhar ou conferir valores.',
    inputSchema: {
      inicio: z.string().describe('Data inicial (AAAA-MM-DD)'),
      fim: z.string().describe('Data final (AAAA-MM-DD)'),
      tipo: z.enum(['todos', 'renda', 'gastos', 'km', 'leads']).optional().describe('Filtrar por tipo. Padrão: todos'),
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
