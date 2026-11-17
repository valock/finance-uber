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

// ── Carro / energia ───────────────────────────────────────────
function realKmPerLiter(db) {
  const f = (db.costs || []).filter(c => c.type === 'car' && c.category === 'Combustível' && c.odometerKm && c.tankFull && c.liters > 0)
    .sort((a, b) => a.odometerKm - b.odometerKm);
  if (f.length < 2) return null;
  let dist = 0, lit = 0;
  for (let i = 1; i < f.length; i++) { const d = f[i].odometerKm - f[i - 1].odometerKm; if (d > 0) { dist += d; lit += f[i].liters; } }
  return lit > 0 ? dist / lit : null;
}
export function energyCost(db, km) {
  const car = db.carSetup || {};
  const kmL = (car.type === 'eletrico' ? null : realKmPerLiter(db)) || car.kmPerLiter;
  return kmL > 0 ? (km / kmL) * (car.fuelPrice || 0) : 0;
}

// ── Odômetro (só leituras do carro do sprint, a partir do início) ──
function odoReadings(db) {
  const from = db.sprint?.startDate || '0000-00-00';
  const r = [];
  (db.kmLog || []).forEach(k => { if (k.odometerKm > 0) r.push({ date: k.date, km: k.odometerKm }); });
  (db.costs || []).forEach(c => { if (c.odometerKm > 0) r.push({ date: c.date, km: c.odometerKm }); });
  Object.entries(db.sprint?.days || {}).forEach(([d, v]) => {
    if (v?.odoStart > 0) r.push({ date: d, km: v.odoStart });
    if (v?.odoEnd > 0) r.push({ date: d, km: v.odoEnd });
  });
  return r.filter(x => x.date >= from);
}
function lastOdoBefore(db, ds) {
  const b = odoReadings(db).filter(x => x.date < ds).map(x => x.km);
  return b.length ? Math.max(...b) : null;
}
export function odoKmBetween(db, ds, de) {
  const inP = odoReadings(db).filter(x => x.date >= ds && x.date <= de).map(x => x.km);
  if (!inP.length) return 0;
  const base = lastOdoBefore(db, ds);
  return Math.max(0, Math.max(...inP) - (base !== null ? base : Math.min(...inP)));
}

// ── Renda e leads ─────────────────────────────────────────────
export function gross(db, ds, de) {
  const r = { uber: 0, n99: 0 };
  (db.income || []).forEach(i => {
    if (i.date >= ds && i.date <= de) { if (i.type === 'uber') r.uber += i.amount || 0; else if (i.type === '99') r.n99 += i.amount || 0; }
  });
  r.total = r.uber + r.n99;
  return r;
}
const leadsIn = (db, ds, de) => (db.sprint?.leads || []).filter(l => l.date >= ds && l.date <= de);
export function leadCounts(list) {
  const c = {}; Object.keys(LEAD_SOURCES).forEach(k => c[k] = 0);
  list.forEach(l => { if (c[l.source] !== undefined) c[l.source]++; });
  c.total = Object.keys(LEAD_SOURCES).reduce((s, k) => s + c[k], 0);
  return c;
}
const kmLogInDay = (db, d) => (db.kmLog || []).filter(k => k.date === d).reduce((s, k) => s + (k.km || 0), 0);

// ── Resumos ───────────────────────────────────────────────────
export function dayStats(db, d) {
  const g = gross(db, d, d);
  const day = db.sprint?.days?.[d] || {};
  const km = (day.odoEnd > 0 && day.odoStart > 0) ? Math.max(0, day.odoEnd - day.odoStart) : kmLogInDay(db, d);
  return {
    data: d, bruto: r2(g.total), uber: r2(g.uber), n99: r2(g.n99), km,
    rs_por_km: km > 0 ? r2(g.total / km) : null, energia: r2(energyCost(db, km)),
    leads: leadCounts(leadsIn(db, d, d)),
    dia_aberto: !!day.openedAt, dia_fechado: !!day.closedAt,
    odometro_inicio: day.odoStart || null, odometro_fim: day.odoEnd || null, bateria_inicio: day.batteryStart ?? null,
  };
}

export function weekStats(db, today) {
  const s = db.sprint || {};
  const ws = mondayOf(today), we = addDays(ws, 6);
  const start = mondayOf(s.startDate || ws);
  const weekNum = Math.floor(daysBetween(start, ws) / 7) + 1;
  const daysLeft = Math.max(1, daysBetween(today, we) + 1);
  const g = gross(db, ws, we);
  const km = odoKmBetween(db, ws, we);
  const energy = energyCost(db, km);
  const net = g.total - energy - (s.rentWeekly || 0);
  const hasCaution = weekNum >= 1 && weekNum <= (s.cautionWeeks || 0);
  const ym = today.slice(0, 7);
  const dias = []; for (let i = 0; i < 7; i++) { const d = addDays(ws, i); if (d <= today) dias.push(dayStats(db, d)); }
  return {
    semana: weekNum, de_semanas: s.weeks, inicio: ws, fim: we, hoje: today, dias_restantes: daysLeft,
    bruto: r2(g.total), uber: r2(g.uber), n99: r2(g.n99),
    piso: s.weeklyFloor, meta: s.weeklyTarget,
    pct_piso: s.weeklyFloor ? r2(g.total / s.weeklyFloor * 100) : null,
    pct_meta: s.weeklyTarget ? r2(g.total / s.weeklyTarget * 100) : null,
    falta_por_dia_para_meta: r2(Math.max(0, (s.weeklyTarget || 0) - g.total) / daysLeft),
    km, limite_km: s.kmLimitWeekly, pct_km: s.kmLimitWeekly ? r2(km / s.kmLimitWeekly * 100) : null,
    km_disponivel_por_dia: Math.round(Math.max(0, (s.kmLimitWeekly || 0) - km) / daysLeft),
    rs_por_km: km > 0 ? r2(g.total / km) : null, rs_por_km_minimo: s.minRevPerKm,
    energia: r2(energy), aluguel: s.rentWeekly, liquido: r2(net),
    caixa_apos_caucao: hasCaution ? r2(net - (s.cautionWeekly || 0)) : null, caucao: hasCaution ? s.cautionWeekly : 0,
    bruto_mes: r2(gross(db, ym + '-01', ym + '-31').total), piso_mensal_banco: s.monthlyBankFloor,
    leads: leadCounts(leadsIn(db, ws, we)),
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
    km_odometro: km, energia_estimada: r2(energyCost(db, km)),
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
    sprint: db.sprint ? { ...db.sprint, leads: undefined, days: undefined } : null,
    bancos: banks, saldo_bancos: r2(banks.reduce((s, b) => s + (b.saldo || 0), 0)),
    dividas: debts, total_dividas: r2(debts.reduce((s, d) => s + (d.saldo_devedor || 0), 0)),
    financiamentos: fins, a_receber: pend,
    bens: (db.assets || []).map(a => ({ nome: a.name, tipo: a.type, valor: a.value })),
  };
}
