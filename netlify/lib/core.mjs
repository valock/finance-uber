// Núcleo do servidor FinanceUber: cálculos (os mesmos do cartão do app) e verificação de chaves.
// Sem dependências externas — testável localmente com `node`.
import { createHash, timingSafeEqual } from 'node:crypto';

// ── Chaves ────────────────────────────────────────────────────
export const sha256Hex = s => createHash('sha256').update(String(s)).digest('hex');
export function sameHash(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
// Chave de leitura (usada no link do conector) derivada da chave principal — mesma fórmula do app
export const readKeyFrom = key => sha256Hex('leitura:' + key);
export const isHex64 = s => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);

// ── Datas (fuso de São Paulo; o "dia operacional" vira às 04:00, igual ao app) ──
const TZ = 'America/Sao_Paulo';
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
export const opDate = (now = new Date()) => dateFmt.format(new Date(now.getTime() - 4 * 3600000));
const d12 = ds => new Date(ds + 'T12:00:00Z');
const iso = d => d.toISOString().slice(0, 10);
export const addDays = (ds, n) => { const d = d12(ds); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const mondayOf = ds => { const d = d12(ds); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return iso(d); };
export const daysBetween = (a, b) => Math.round((d12(b) - d12(a)) / 86400000);
export const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isMonth = s => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s);
const r2 = n => Math.round((n || 0) * 100) / 100;

export const LEAD_SOURCES = { uber: 'Dentro do Uber', organico: 'Orgânico', parceiro: 'Lead parceiro', outros: 'Outros' };

// ── Cálculos do sprint: o MESMO arquivo que o app usa (sprint-calc.js na raiz do site) ──
import '../../sprint-calc.js';
export const C = globalThis.SprintCalc;
const dtFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
// Data e hora de agora em Brasília: 'AAAA-MM-DDTHH:MM'
export const nowDT = (now = new Date()) => {
  const p = Object.fromEntries(dtFmt.formatToParts(now).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};
const n2 = v => (v === null || v === undefined ? null : r2(v));

export const energyCost = (db, km) => C.estEnergy(db, km);
export const odoKmBetween = (db, ds, de) => C.odoKmBetween(db, ds, de);
export function gross(db, ds, de) { const g = C.gross(db, ds, de); return { uber: g.uber, n99: g.n99, total: g.total }; }
export const leadCounts = list => C.leadCounts(list);
const leadsIn = (db, ds, de) => C.leadsIn(db, ds, de);

const chargeOut = (db, c) => ({
  data: c.date, quando: c.at || null, local: c.place || null, tipo: c.kind || 'rua',
  kwh: n2(C.chargeKwh(db, c)), energia: n2(C.chargeEnergyCost(db, c)), ociosidade: n2(c.idleFee || 0), total: n2(C.chargeCost(db, c)),
  rs_por_kwh: C.chargeKwh(db, c) > 0 && C.chargeEnergyCost(db, c) > 0 ? r2(C.chargeEnergyCost(db, c) / C.chargeKwh(db, c)) : null,
  pct_inicio: c.pctStart ?? null, pct_fim: c.pctEnd ?? null,
});

// ── Resumos ───────────────────────────────────────────────────
export function dayStats(db, d) {
  const x = C.day(db, d);
  return {
    data: d, bruto: r2(x.gross), uber: r2(x.uber), n99: r2(x.n99), km: x.km,
    rs_por_km: n2(x.revPerKm), energia: r2(x.energy), energia_real: !x.energyEstimated, energia_estimada: x.energyEstimated,
    ociosidade: r2(x.idleFee), recargas: x.charges.map(c => chargeOut(db, c)),
    horas_online: r2(x.hours), horas_uber: r2(x.hoursUber), horas_99: r2(x.hours99), rs_por_hora: n2(x.revPerHour),
    viagens_uber: x.tripsUber, viagens_99: x.trips99,
    dinheiro_em_especie: r2(x.cash), dinheiro_uber: r2(x.cashUber), dinheiro_99: r2(x.cash99),
    conversas_novas: x.conversations,
    leads: x.leads,
    dia_aberto: x.opened, dia_fechado: x.closed, folga: !!x.raw.dayOff, observacao: x.note || null,
    odometro_inicio: x.odoStart, odometro_fim: x.odoEnd, bateria_inicio: x.batteryStart, bateria_fim: x.batteryEnd,
  };
}

export function weekStats(db, today, now) {
  const s = db.sprint || {};
  const w = C.week(db, today, now || nowDT());
  const dias = []; for (let i = 0; i < 7; i++) { const d = addDays(w.ws, i); if (d <= today) dias.push(dayStats(db, d)); }
  return {
    semana: w.weekNum, de_semanas: s.weeks, inicio: w.ws, fim: w.we, hoje: today, dias_restantes: w.daysLeft,
    bruto: r2(w.gross), uber: r2(w.uber), n99: r2(w.n99),
    piso: s.weeklyFloor, meta: s.weeklyTarget,
    pct_piso: s.weeklyFloor ? r2(w.gross / s.weeklyFloor * 100) : null,
    pct_meta: s.weeklyTarget ? r2(w.gross / s.weeklyTarget * 100) : null,
    falta_por_dia_para_meta: r2(w.perDayToTarget), falta_por_dia_para_piso: r2(w.perDayToFloor),
    km: w.km, limite_km: s.kmLimitWeekly, pct_km: s.kmLimitWeekly ? r2(w.km / s.kmLimitWeekly * 100) : null,
    km_disponivel_por_dia: Math.round(w.kmPerDayLeft),
    rs_por_km: n2(w.revPerKm), rs_por_km_minimo: s.minRevPerKm,
    energia: r2(w.energy), energia_real: !w.energyEstimated, energia_estimada: w.energyEstimated,
    energia_kwh: r2(w.energyKwh), ociosidade: r2(w.idleFees), recargas: w.chargeSessions, recargas_sem_valor: w.chargesMissingCost,
    outros_gastos: r2(w.otherCosts), outros_gastos_itens: w.otherCostItems.map(c => ({ data: c.date, categoria: c.category, valor: c.amount, obs: c.note || undefined })),
    aluguel: r2(w.rent), km_excedente: w.excessKm, km_excedente_valor: r2(w.excessCost), semana_contrato_do_excedente: w.contractWeekN,
    liquido: r2(w.net),
    caixa_apos_caucao: w.hasCaution ? r2(w.cashAfter) : null, caucao: w.hasCaution ? s.cautionWeekly : 0,
    horas_online: r2(w.hours), rs_por_hora: n2(w.revPerHour), viagens: w.trips,
    dinheiro_em_especie: r2(w.cash), conversas_novas: w.conversations,
    bruto_mes: r2(w.monthGross), piso_mensal_banco: s.monthlyBankFloor,
    leads: w.leadsWeek,
    dias,
  };
}

export function monthStats(db, ym) {
  const ds = ym + '-01', de = ym + '-31';
  const inc = (db.income || []).filter(i => i.date >= ds && i.date <= de);
  const byType = {}; inc.forEach(i => { byType[i.type] = r2((byType[i.type] || 0) + (i.amount || 0)); });
  const costs = (db.costs || []).filter(c => c.date >= ds && c.date <= de);
  const costByType = {}, costByCat = {};
  costs.forEach(c => {
    costByType[c.type] = r2((costByType[c.type] || 0) + (c.amount || 0));
    const k = c.type + ' / ' + c.category; costByCat[k] = r2((costByCat[k] || 0) + (c.amount || 0));
  });
  const bills = (db.bills || []).map(b => ({ nome: b.name, valor: b.amount, vencimento_dia: b.dueDay, categoria: b.category, paga: !!b.paid?.includes(ym) }));
  const km = odoKmBetween(db, ds, de);
  const g = gross(db, ds, de);
  return {
    mes: ym,
    renda_por_tipo: byType, renda_total: r2(inc.reduce((s, i) => s + (i.amount || 0), 0)),
    bruto_corridas: r2(g.total), piso_mensal_banco: db.sprint?.monthlyBankFloor ?? null,
    gastos_por_tipo: costByType, gastos_por_categoria: costByCat, gastos_total: r2(costs.reduce((s, c) => s + (c.amount || 0), 0)),
    contas: bills, contas_pendentes: r2(bills.filter(b => !b.paga).reduce((s, b) => s + (b.valor || 0), 0)),
    km_odometro: km, ...(() => { const e = C.energy(db, ds, de, km); return { energia: r2(e.cost), energia_real: !e.estimated, energia_estimada: r2(energyCost(db, km)), ociosidade: r2(e.idle) }; })(),
    outros_gastos_carro: r2(C.otherCarCosts(db, ds, de).total),
    ...(() => { const w = C.work(db, ds, de); return { horas_online: r2(w.hours), viagens: w.trips, dinheiro_em_especie: r2(w.cash), conversas_novas: w.conversations }; })(),
    leads: leadCounts(leadsIn(db, ds, de)),
  };
}

export function entries(db, ds, de, tipo = 'todos') {
  const out = {};
  if (tipo === 'todos' || tipo === 'renda') out.renda = (db.income || []).filter(i => i.date >= ds && i.date <= de)
    .map(i => ({ data: i.date, tipo: i.type, valor: i.amount, obs: i.note || undefined, cliente: i.clientName || undefined }));
  if (tipo === 'todos' || tipo === 'gastos') out.gastos = (db.costs || []).filter(c => c.date >= ds && c.date <= de)
    .map(c => ({ data: c.date, tipo: c.type, categoria: c.category, valor: c.amount, obs: c.note || undefined, odometro: c.odometerKm || undefined }));
  if (tipo === 'todos' || tipo === 'km') out.km = (db.kmLog || []).filter(k => k.date >= ds && k.date <= de)
    .map(k => ({ data: k.date, km: k.km, odometro: k.odometerKm || undefined }));
  if (tipo === 'todos' || tipo === 'recargas') out.recargas = C.chargesIn(db, ds, de).map(c => chargeOut(db, c));
  if (tipo === 'todos' || tipo === 'pagamentos') out.pagamentos = (db.sprint?.payments || []).filter(p => p.date >= ds && p.date <= de)
    .map(p => ({ data: p.date, tipo: p.kind, valor: p.amount, odometro: p.odometerKm || undefined, obs: p.note || undefined }));
  if (tipo === 'todos' || tipo === 'dias') out.dias = Object.keys(db.sprint?.days || {}).filter(d => d >= ds && d <= de).sort().map(d => dayStats(db, d));
  if (tipo === 'todos' || tipo === 'leads') out.leads = (db.sprint?.leads || []).filter(l => l.date >= ds && l.date <= de)
    .map(l => ({ data: l.date, origem: LEAD_SOURCES[l.source] || l.source, quando: l.at }));
  Object.values(out).forEach(a => a.sort((x, y) => (x.data || '').localeCompare(y.data || '')));
  return out;
}

export function overview(db, meta) {
  const banks = (db.bankAccounts || []).map(b => ({ banco: b.bank, tipo: b.type, saldo: b.balance }));
  const debts = (db.debts || []).map(d => ({ nome: d.name, credor: d.creditor, saldo_devedor: d.remaining, minimo_mensal: d.minPayment, juros_mes_pct: d.rate ?? d.interestRate }));
  const fins = (db.financings || []).map(f => ({ nome: f.name, tipo: f.type, valor_bem: f.assetValue, financiado: f.financedAmount, parcela_atual: f.currentInstallment, prazo_meses: f.termMonths }));
  const pend = (db.receivables || []).filter(r => r.status === 'pending').map(r => ({ cliente: r.client, valor: r.amount, vencimento: r.dueDate }));
  return {
    ultima_sincronizacao: meta?.savedAt || null,
    perfil: db.profile || {}, metas: db.goals || {},
    carro: { tipo: db.carSetup?.type || 'combustao', consumo: db.carSetup?.kmPerLiter, preco_energia: db.carSetup?.fuelPrice,
      unidade: db.carSetup?.type === 'eletrico' ? 'km/kWh e R$/kWh' : 'km/L e R$/L' },
    sprint: db.sprint ? { ...db.sprint, leads: undefined, days: undefined, charges: undefined, payments: undefined, deals: undefined, sheetImport: undefined, weekChecks: undefined } : null,
    bancos: banks, saldo_bancos: r2(banks.reduce((s, b) => s + (b.saldo || 0), 0)),
    dividas: debts, total_dividas: r2(debts.reduce((s, d) => s + (d.saldo_devedor || 0), 0)),
    financiamentos: fins, a_receber: pend,
    bens: (db.assets || []).map(a => ({ nome: a.name, tipo: a.type, valor: a.value })),
  };
}

// ── Ferramentas novas ─────────────────────────────────────────
export function contractWeekOut(db, now) {
  const c = C.contractWeek(db, now);
  if (!c.configured) return { configurado: false, aviso: 'Cadastre a retirada do carro no app (⚙️ → Modo Sprint → Contrato) para contar o km do vencimento ao vencimento.' };
  if (!c.started) return { configurado: true, iniciado: false, inicio: c.start };
  return {
    configurado: true, iniciado: true, agora: now,
    semana: c.n, de_semanas: c.of, inicio: c.start, vencimento: c.end, dias_restantes: c.daysLeft,
    km: c.km, limite_km: c.limit, pct_km: n2(c.pct), km_disponivel: Math.round(c.kmLeft), km_disponivel_por_dia: Math.round(c.kmPerDayLeft),
    km_excedente: c.excessKm, km_excedente_valor: r2(c.excessCost), rs_por_km_excedente: db.sprint?.excessKmRate ?? null,
    aluguel_semana: r2(c.rent), caucao_semana: r2(c.caution),
    aluguel_pago_total: r2(c.rentPaid), aluguel_previsto_ate_agora: r2(c.rentExpected),
    caucao_paga_total: r2(c.cautionPaid), caucao_prevista_ate_agora: r2(c.cautionExpected), caucao_total_contrato: r2(c.cautionTotal),
    semanas_cumpridas: c.weeksDone, custo_rescisao_hoje: r2(c.terminationCost), fim_contrato: c.contractEnd,
    km_na_entrega: db.sprint?.kmDelivery || null, bateria_na_entrega: db.sprint?.batteryDelivery || null,
    observacao: 'O km usa a leitura do odômetro anotada no pagamento do vencimento; sem ela, usa a última leitura do dia anterior ao vencimento.',
  };
}

export function incomeProofOut(db, today, inicio, fim) {
  const p = C.incomeProof(db, today);
  const months = p.months.filter(m => (!inicio || m.month >= inicio) && (!fim || m.month <= fim));
  return {
    piso_mensal: p.floor, meses_exigidos: p.need, meses_que_bateram: p.hits,
    meses: months.map(m => ({
      mes: m.month, uber: r2(m.uber), n99: r2(m.n99), total_corridas: r2(m.total),
      app: r2(m.app), dinheiro: r2(m.cash), dinheiro_uber: r2(m.cashUber), dinheiro_99: r2(m.cash99),
      comissoes_a_parte: r2(m.comissao), bateu: m.hit, mes_atual: m.current, mes_parcial: m.partial,
      pct_do_ritmo: n2(m.pacePct), falta_por_dia: m.current ? r2(m.perDayLeft) : 0,
    })),
    observacao: 'Comissões ficam fora do total (não se sabe se o banco aceita). Dinheiro = parte do total recebida em espécie.',
  };
}

export function chargesOut(db, ds, de) {
  const list = C.chargesIn(db, ds, de).map(c => chargeOut(db, c)).sort((a, b) => (a.quando || a.data).localeCompare(b.quando || b.data));
  const km = C.odoKmBetween(db, ds, de);
  const tot = list.reduce((s, c) => s + (c.total || 0), 0), kwh = list.reduce((s, c) => s + (c.kwh || 0), 0), en = list.reduce((s, c) => s + (c.energia || 0), 0);
  const sum = k => r2(list.filter(c => c.tipo === k).reduce((s, c) => s + (c.total || 0), 0));
  return {
    inicio: ds, fim: de, sessoes: list.length, total: r2(tot), kwh: r2(kwh), ociosidade: r2(list.reduce((s, c) => s + (c.ociosidade || 0), 0)),
    rs_por_kwh_medio: kwh > 0 ? r2(en / kwh) : null, rua: sum('rua'), casa: sum('casa'),
    km_no_periodo: km, custo_por_km: km > 0 ? r2(tot / km) : null,
    sem_valor: list.filter(c => !(c.energia > 0)).length, tarifa_casa: db.sprint?.homeKwhPrice || null, bateria_kwh: db.sprint?.batteryKwh || null,
    recargas: list,
  };
}

export function paceOut(db, today, now) {
  const p = C.pace(db, today, now);
  return {
    hoje: today, semana: p.week.weekNum, bruto_semana: r2(p.week.gross), dias_restantes: p.week.daysLeft,
    falta_piso: r2(p.toFloor), falta_meta: r2(p.toTarget),
    por_dia_para_piso: r2(p.perDayToFloor), por_dia_para_meta: r2(p.perDayToTarget),
    rs_por_hora_14_dias: n2(p.revPerHour14d), horas_registradas_14_dias: r2(p.hours14d),
    horas_por_dia_para_piso: n2(p.hoursPerDayToFloor), horas_por_dia_para_meta: n2(p.hoursPerDayToTarget),
    km_disponivel_por_dia: Math.round(p.kmPerDayLeft), km_base: p.kmSource === 'contrato' ? 'semana do contrato' : 'semana de segunda a domingo',
    mes: p.month ? { mes: p.month.month, bruto: r2(p.month.total), piso: p.month.floor, pct_do_ritmo: n2(p.month.pacePct), falta_por_dia: r2(p.month.perDayLeft) } : null,
  };
}

export function pendingOut(db, today, now) {
  const p = C.pending(db, today, now);
  return { hoje: today, dias_sem_fechamento: p.unclosed, campos_faltando: p.missing.map(m => ({ data: m.date, faltando: m.fields })), alertas: p.alerts.map(a => a.msg) };
}

export function funnelOut(db) {
  const f = C.funnel(db);
  const deal = d => ({ cliente: d.nick, etapa: d.stage, proximo_passo: d.nextStep || null, data_proximo_passo: d.nextDate || null,
    previsao_fechamento: d.expectedDate || null, comissao_estimada: r2(d.commission || 0), chance_pct: d.chance ?? null, criado: d.createdAt || null, encerrado: d.closedAt || null });
  return {
    em_aberto: f.open.map(deal), comissao_prevista: r2(f.openCommission), comissao_ponderada_pela_chance: r2(f.weightedCommission),
    por_mes: Object.fromEntries(Object.entries(f.byMonth).sort().map(([m, v]) => [m, { negocios: v.count, comissao: r2(v.commission), ponderada: r2(v.weighted) }])),
    ganhas: f.won.map(deal), perdidas: f.lost.length,
  };
}

export function hourlyOut(db, ds, de) {
  const h = C.hourly(db, ds, de);
  return {
    inicio: ds, fim: de,
    rs_por_hora: n2(h.perHour.total), rs_por_hora_uber: n2(h.perHour.uber), rs_por_hora_99: n2(h.perHour.n99),
    horas: r2(h.work.hours), horas_uber: r2(h.work.hoursUber), horas_99: r2(h.work.hours99),
    viagens: h.work.trips, viagens_uber: h.work.tripsUber, viagens_99: h.work.trips99, dias_com_horas: h.work.daysWithHours,
    por_dia_da_semana: h.byWeekday.filter(e => e.days > 0).map(e => ({ dia: e.weekday, dias: e.days, horas: r2(e.hours), bruto: r2(e.gross), viagens: e.trips, rs_por_hora: n2(e.revPerHour) })),
    observacao: 'Só conta dias com horas online registradas no Fechar o dia.',
  };
}
