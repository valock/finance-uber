// Cálculos do Modo Sprint — um arquivo só, usado pelo app (navegador) e pelo conector (Netlify).
// Funções puras: recebem o db e as datas "de agora" e devolvem números. Nada aqui grava dados.
// Datas: 'AAAA-MM-DD' (dia operacional, vira às 04:00). Data e hora: 'AAAA-MM-DDTHH:MM' (horário de Brasília).
(function () {
  'use strict';

  // ── Datas ──────────────────────────────────────────────────
  const d12 = ds => new Date(ds + 'T12:00:00Z');
  const iso = d => d.toISOString().slice(0, 10);
  const addDays = (ds, n) => { const d = d12(ds); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const mondayOf = ds => { const d = d12(ds); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return iso(d); };
  const daysBetween = (a, b) => Math.round((d12(b) - d12(a)) / 86400000);
  const weekday = ds => d12(ds).getUTCDay(); // 0 = domingo
  const isDT = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s);
  const dtDate = dt => dt.slice(0, 10);
  const addDaysDT = (dt, n) => addDays(dtDate(dt), n) + dt.slice(10);
  const lastDayOfMonth = ym => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
  const num = v => (typeof v === 'number' && isFinite(v) ? v : (parseFloat(v) || 0));
  const r2 = n => Math.round((n || 0) * 100) / 100;

  const LEAD_IDS = ['uber', 'organico', 'parceiro', 'outros'];
  const DEAL_STAGES = ['contato', 'visita', 'documentos', 'aprovacao', 'assinatura'];

  // Campos novos do sprint (todos opcionais; dados antigos continuam funcionando sem eles)
  function defaults() {
    return {
      contractStart: '',     // 'AAAA-MM-DDTHH:MM' retirada do carro
      firstDue: '',          // 1º vencimento ('' = 7 dias depois da retirada)
      contractEnd: '',       // 'AAAA-MM-DD'
      kmDelivery: 0, batteryDelivery: 0,
      excessKmRate: 1, extraDriverPct: 10, extraDrivers: 0,
      cautionTotal: 5850,
      batteryKwh: 39.4, homeKwhPrice: 0,
      bankMonthsNeeded: 4, weeklyHoursCap: 0,
      charges: [], payments: [], deals: [],
      carChanges: [],        // [{date, type:'eletrico'|'combustao', odo}] troca de carro (vale a partir de date)
      cars: {},              // {eletrico:{kmPerLiter,fuelPrice}, combustao:{...}} consumo de cada carro
      weekChecks: {},        // {segunda: {at, odo, carType, battery}} pergunta de km de toda segunda
    };
  }

  // ── Odômetro (só leituras do carro do sprint) ──────────────
  function sprintFrom(db) {
    const s = db.sprint || {};
    let from = s.startDate || '0000-00-00';
    if (isDT(s.contractStart) && dtDate(s.contractStart) < from) from = dtDate(s.contractStart);
    return from;
  }
  function readings(db) {
    const from = sprintFrom(db), s = db.sprint || {};
    const r = [];
    (db.kmLog || []).forEach(k => { if (k.odometerKm > 0) r.push({ date: k.date, km: k.odometerKm }); });
    (db.costs || []).forEach(c => { if (c.odometerKm > 0) r.push({ date: c.date, km: c.odometerKm }); });
    Object.entries(s.days || {}).forEach(([d, v]) => {
      if (v && v.odoStart > 0) r.push({ date: d, km: v.odoStart });
      if (v && v.odoEnd > 0) r.push({ date: d, km: v.odoEnd });
    });
    (s.payments || []).forEach(p => { if (p && p.odometerKm > 0 && p.date) r.push({ date: p.date, km: p.odometerKm }); });
    if (isDT(s.contractStart) && s.kmDelivery > 0) r.push({ date: dtDate(s.contractStart), km: s.kmDelivery });
    Object.values(s.weekChecks || {}).forEach(w => { if (w && w.odo > 0 && w.date) r.push({ date: w.date, km: w.odo }); });
    carChanges(db).forEach(c => { if (c.odo > 0) r.push({ date: c.date, km: c.odo }); });
    return r.filter(x => x.date >= from);
  }
  // Trocas de carro: cada carro tem o seu odômetro. Leituras de carros diferentes nunca se misturam.
  function carChanges(db) {
    return (((db.sprint && db.sprint.carChanges) || []).filter(c => c && c.date)).slice().sort((a, b) => a.date.localeCompare(b.date));
  }
  function segStart(db, d) { let st = '0000-00-00'; carChanges(db).forEach(c => { if (c.date <= d) st = c.date; }); return st; }
  function carTypeOn(db, d) {
    let t = null; carChanges(db).forEach(c => { if (c.date <= d) t = c.type; });
    return t || ((db.carSetup && db.carSetup.type) || 'combustao');
  }
  function lastOdoBefore(db, ds) {
    const st = segStart(db, ds);
    const b = readings(db).filter(x => x.date < ds && x.date >= st).map(x => x.km);
    return b.length ? Math.max(...b) : null;
  }
  function kmPiece(db, ds, de) {
    const inP = readings(db).filter(x => x.date >= ds && x.date <= de).map(x => x.km);
    if (!inP.length) return 0;
    const base = lastOdoBefore(db, ds);
    return Math.max(0, Math.max(...inP) - (base !== null ? base : Math.min(...inP)));
  }
  // Km do período somando cada carro separado (corta o período nas datas de troca)
  function odoKmBetween(db, ds, de) {
    const cuts = carChanges(db).map(c => c.date).filter(d => d > ds && d <= de);
    let total = 0, a = ds;
    cuts.forEach(c => { total += kmPiece(db, a, addDays(c, -1)); a = c; });
    return total + kmPiece(db, a, de);
  }
  function kmLogInDay(db, d) { return (db.kmLog || []).filter(k => k.date === d).reduce((s, k) => s + (k.km || 0), 0); }
  function dayKm(db, d) {
    const day = (db.sprint && db.sprint.days && db.sprint.days[d]) || {};
    if (day.odoEnd > 0 && day.odoStart > 0) return Math.max(0, day.odoEnd - day.odoStart);
    if (day.odoEnd > 0) { const b = lastOdoBefore(db, d); if (b !== null && day.odoEnd > b) return day.odoEnd - b; }
    return kmLogInDay(db, d);
  }

  // ── Renda, dinheiro, horas ─────────────────────────────────
  function gross(db, ds, de) {
    const r = { uber: 0, n99: 0, comissao: 0 };
    (db.income || []).forEach(i => {
      if (i.date >= ds && i.date <= de) {
        if (i.type === 'uber') r.uber += i.amount || 0;
        else if (i.type === '99') r.n99 += i.amount || 0;
        else if (i.type === 'comissao') r.comissao += i.amount || 0;
      }
    });
    r.total = r.uber + r.n99;
    return r;
  }
  function daysIn(db, ds, de) {
    return Object.entries((db.sprint && db.sprint.days) || {}).filter(([d]) => d >= ds && d <= de);
  }
  function work(db, ds, de) {
    const w = { hoursUber: 0, hours99: 0, tripsUber: 0, trips99: 0, cashUber: 0, cash99: 0, conversations: 0, daysWithHours: 0 };
    daysIn(db, ds, de).forEach(([, v]) => {
      if (!v) return;
      w.hoursUber += num(v.hoursUber); w.hours99 += num(v.hours99);
      w.tripsUber += num(v.tripsUber); w.trips99 += num(v.trips99);
      w.cashUber += num(v.cashUber); w.cash99 += num(v.cash99);
      w.conversations += num(v.conversations);
      if (num(v.hoursUber) + num(v.hours99) > 0) w.daysWithHours++;
    });
    w.hours = w.hoursUber + w.hours99; w.trips = w.tripsUber + w.trips99; w.cash = w.cashUber + w.cash99;
    return w;
  }
  // R$/hora só com os dias que têm horas registradas (para não diluir com dias sem o dado)
  function perHour(db, ds, de) {
    let g = 0, h = 0, gu = 0, hu = 0, g9 = 0, h9 = 0;
    daysIn(db, ds, de).forEach(([d, v]) => {
      const hu1 = num(v && v.hoursUber), h91 = num(v && v.hours99);
      if (hu1 + h91 <= 0) return;
      const gd = gross(db, d, d);
      if (hu1 > 0) { gu += gd.uber; hu += hu1; }
      if (h91 > 0) { g9 += gd.n99; h9 += h91; }
      g += (hu1 > 0 ? gd.uber : 0) + (h91 > 0 ? gd.n99 : 0); h += hu1 + h91;
    });
    return { total: h > 0 ? g / h : null, uber: hu > 0 ? gu / hu : null, n99: h9 > 0 ? g9 / h9 : null, hours: h };
  }

  // ── Energia ────────────────────────────────────────────────
  function realKmPerLiter(db) {
    const f = (db.costs || []).filter(c => c.type === 'car' && c.category === 'Combustível' && c.odometerKm && c.tankFull && c.liters > 0)
      .sort((a, b) => a.odometerKm - b.odometerKm);
    if (f.length < 2) return null;
    let dist = 0, lit = 0;
    for (let i = 1; i < f.length; i++) { const d = f[i].odometerKm - f[i - 1].odometerKm; if (d > 0) { dist += d; lit += f[i].liters; } }
    return lit > 0 ? dist / lit : null;
  }
  function carConfig(db, d) {
    const t = d ? carTypeOn(db, d) : ((db.carSetup && db.carSetup.type) || 'combustao');
    const cur = db.carSetup || {};
    if ((cur.type || 'combustao') === t) return cur;
    const other = (db.sprint && db.sprint.cars && db.sprint.cars[t]) || {};
    return { ...other, type: t };
  }
  function estEnergy(db, km, d) {
    const car = carConfig(db, d);
    const kmL = (car.type === 'eletrico' ? null : realKmPerLiter(db)) || car.kmPerLiter;
    return kmL > 0 ? (km / kmL) * (car.fuelPrice || 0) : 0;
  }
  function chargeKwh(db, c) {
    if (num(c.kwh) > 0) return num(c.kwh);
    const s = db.sprint || {};
    const dp = num(c.pctEnd) - num(c.pctStart);
    return dp > 0 && num(s.batteryKwh) > 0 ? dp / 100 * num(s.batteryKwh) : 0;
  }
  function chargeEnergyCost(db, c) {
    if (num(c.energyCost) > 0) return num(c.energyCost);
    if (c.kind === 'casa') return chargeKwh(db, c) * num((db.sprint || {}).homeKwhPrice);
    return 0;
  }
  function chargeCost(db, c) { return chargeEnergyCost(db, c) + num(c.idleFee); }
  function chargesIn(db, ds, de) { return ((db.sprint && db.sprint.charges) || []).filter(c => c && c.date >= ds && c.date <= de); }
  // Energia do período: soma das recargas reais; sem nenhuma recarga registrada, estimativa pelo km (marcada)
  // Estimativa pelo km, usando o consumo do carro de cada trecho (se houve troca de carro no período)
  function estEnergyBetween(db, ds, de, km) {
    const cuts = carChanges(db).map(c => c.date).filter(d => d > ds && d <= de);
    if (!cuts.length) return estEnergy(db, km, de);
    let total = 0, a = ds;
    cuts.forEach(c => { total += estEnergy(db, kmPiece(db, a, addDays(c, -1)), a); a = c; });
    return total + estEnergy(db, kmPiece(db, a, de), de);
  }
  function fuelIn(db, ds, de) {
    const from = sprintFrom(db);
    return (db.costs || []).filter(c => c.type === 'car' && c.category === 'Combustível' && c.date >= ds && c.date <= de && c.date >= from);
  }
  // Energia do período: recargas reais + abastecimentos lançados; sem nenhum registro, estimativa pelo km (marcada)
  function energy(db, ds, de, km) {
    const list = chargesIn(db, ds, de), fuel = fuelIn(db, ds, de);
    const fuelCost = fuel.reduce((s, c) => s + (c.amount || 0), 0);
    if (!list.length && !fuel.length) return { cost: estEnergyBetween(db, ds, de, km), estimated: true, kwh: 0, idle: 0, sessions: 0, missingCost: 0, fuel: 0 };
    let cost = fuelCost, kwh = 0, idle = 0, missing = 0;
    list.forEach(c => {
      cost += chargeCost(db, c); kwh += chargeKwh(db, c); idle += num(c.idleFee);
      if (chargeEnergyCost(db, c) <= 0) missing++;
    });
    return { cost, estimated: false, kwh, idle, sessions: list.length, missingCost: missing, fuel: fuelCost };
  }

  // ── Outros gastos do carro (pneu, lavagem, multa…; combustível fica de fora) ──
  function otherCarCosts(db, ds, de) {
    const from = sprintFrom(db);
    const items = (db.costs || []).filter(c => c.type === 'car' && c.category !== 'Combustível' && c.date >= ds && c.date <= de && c.date >= from);
    return { total: items.reduce((s, c) => s + (c.amount || 0), 0), items };
  }

  // ── Contrato: semanas do vencimento ao vencimento ──────────
  function rentWeekly(db) {
    const s = db.sprint || {};
    return num(s.rentWeekly) * (1 + num(s.extraDriverPct) / 100 * num(s.extraDrivers));
  }
  function windows(db) {
    const s = db.sprint || {};
    if (!isDT(s.contractStart)) return [];
    const first = isDT(s.firstDue) && s.firstDue > s.contractStart ? s.firstDue : addDaysDT(s.contractStart, 7);
    const n = Math.max(1, Math.round(num(s.weeks) || 16));
    const out = [{ n: 1, start: s.contractStart, end: first }];
    for (let k = 2; k <= n; k++) out.push({ n: k, start: addDaysDT(first, 7 * (k - 2)), end: addDaysDT(first, 7 * (k - 1)) });
    return out;
  }
  function windowAt(db, nowDT) {
    const w = windows(db);
    if (!w.length) return null;
    return w.find(x => nowDT >= x.start && nowDT < x.end) || (nowDT < w[0].start ? null : w[w.length - 1]);
  }
  // Leitura do odômetro na hora do vencimento: a anotada no pagamento daquele dia; senão a última do dia anterior
  function odoAt(db, dt) {
    const s = db.sprint || {}, d = dtDate(dt);
    const pays = (s.payments || []).filter(p => p && p.date === d && p.odometerKm > 0);
    if (pays.length) return Math.max(...pays.map(p => p.odometerKm));
    if (dt === s.contractStart && s.kmDelivery > 0) return s.kmDelivery;
    return lastOdoBefore(db, d);
  }
  function windowKm(db, w, nowDT) {
    let start = odoAt(db, w.start);
    const inW = readings(db).filter(x => x.date >= dtDate(w.start) && x.date <= dtDate(w.end)).map(x => x.km);
    let end = nowDT >= w.end ? odoAt(db, w.end) : (inW.length ? Math.max(...inW) : null);
    if (start === null) start = inW.length ? Math.min(...inW) : null;
    if (start === null || end === null) return 0;
    return Math.max(0, end - start);
  }
  function windowExcess(db, w, nowDT) {
    const s = db.sprint || {};
    const km = windowKm(db, w, nowDT);
    const over = Math.max(0, km - num(s.kmLimitWeekly));
    return { km, over, cost: over * num(s.excessKmRate) };
  }
  function paymentsSum(db, kind) {
    return ((db.sprint && db.sprint.payments) || []).filter(p => p && (!kind || p.kind === kind)).reduce((s, p) => s + num(p.amount), 0);
  }
  function contractWeek(db, nowDT) {
    const s = db.sprint || {};
    const w = windowAt(db, nowDT);
    const ws = windows(db);
    if (!w) return { configured: ws.length > 0, started: false, start: ws[0] ? ws[0].start : null };
    const ex = windowExcess(db, w, nowDT);
    const today = dtDate(nowDT);
    const daysLeft = Math.max(1, daysBetween(today, dtDate(w.end)) + (w.end.slice(11) > nowDT.slice(11) ? 1 : 0));
    const done = ws.filter(x => x.end <= nowDT).length;
    const n = ws.length;
    const cautionDue = Math.min(w.n, num(s.cautionWeeks)) * num(s.cautionWeekly);
    return {
      configured: true, started: true,
      n: w.n, of: n, start: w.start, end: w.end, nextDue: w.end, daysLeft,
      km: ex.km, limit: num(s.kmLimitWeekly), pct: num(s.kmLimitWeekly) > 0 ? ex.km / num(s.kmLimitWeekly) * 100 : null,
      kmLeft: Math.max(0, num(s.kmLimitWeekly) - ex.km), kmPerDayLeft: Math.max(0, num(s.kmLimitWeekly) - ex.km) / daysLeft,
      excessKm: ex.over, excessCost: ex.cost,
      rent: rentWeekly(db), caution: w.n <= num(s.cautionWeeks) ? num(s.cautionWeekly) : 0,
      weeksDone: done, cautionPaid: paymentsSum(db, 'caucao'), cautionExpected: cautionDue, cautionTotal: num(s.cautionTotal),
      rentPaid: paymentsSum(db, 'aluguel'), rentExpected: w.n * rentWeekly(db),
      terminationCost: 0.2 * num(s.cautionTotal) * Math.max(0, n - done) / n,
      contractEnd: s.contractEnd || (ws.length ? dtDate(ws[ws.length - 1].end) : null),
    };
  }

  // ── Leads, funil ───────────────────────────────────────────
  function leadCounts(list) {
    const c = {}; LEAD_IDS.forEach(k => c[k] = 0);
    list.forEach(l => { if (c[l.source] !== undefined) c[l.source]++; });
    c.total = LEAD_IDS.reduce((s, k) => s + c[k], 0);
    return c;
  }
  function leadsIn(db, ds, de) { return ((db.sprint && db.sprint.leads) || []).filter(l => l.date >= ds && l.date <= de); }
  function funnel(db) {
    const all = ((db.sprint && db.sprint.deals) || []).filter(Boolean);
    const open = all.filter(d => !d.status || d.status === 'aberta');
    const byMonth = {};
    open.forEach(d => {
      const m = (d.expectedDate || d.nextDate || '').slice(0, 7) || 'sem data';
      const e = byMonth[m] || (byMonth[m] = { count: 0, commission: 0, weighted: 0 });
      e.count++; e.commission += num(d.commission); e.weighted += num(d.commission) * num(d.chance) / 100;
    });
    return {
      open, won: all.filter(d => d.status === 'ganha'), lost: all.filter(d => d.status === 'perdida'),
      openCommission: open.reduce((s, d) => s + num(d.commission), 0),
      weightedCommission: open.reduce((s, d) => s + num(d.commission) * num(d.chance) / 100, 0),
      byMonth,
    };
  }

  // ── Dia e semana (segunda 04h a segunda 04h) ──────────────
  function day(db, d) {
    const g = gross(db, d, d);
    const v = (db.sprint && db.sprint.days && db.sprint.days[d]) || {};
    const km = dayKm(db, d);
    const en = energy(db, d, d, km);
    const w = work(db, d, d);
    return {
      date: d, gross: g.total, uber: g.uber, n99: g.n99, comissao: g.comissao, km,
      revPerKm: km > 0 ? g.total / km : null,
      energy: en.cost, energyEstimated: en.estimated, idleFee: en.idle, charges: chargesIn(db, d, d),
      hours: w.hours, hoursUber: w.hoursUber, hours99: w.hours99, trips: w.trips, tripsUber: w.tripsUber, trips99: w.trips99,
      cash: w.cash, cashUber: w.cashUber, cash99: w.cash99, conversations: w.conversations,
      revPerHour: w.hours > 0 ? g.total / w.hours : null,
      batteryStart: v.batteryStart != null ? v.batteryStart : null, batteryEnd: v.batteryEnd != null ? v.batteryEnd : null,
      odoStart: v.odoStart || null, odoEnd: v.odoEnd || null,
      opened: !!v.openedAt, closed: !!v.closedAt, note: v.note || '',
      leads: leadCounts(leadsIn(db, d, d)), raw: v,
    };
  }
  function week(db, today, nowDT) {
    const s = db.sprint || {};
    nowDT = nowDT || (today + 'T12:00');
    const ws = mondayOf(today), we = addDays(ws, 6);
    const start = mondayOf(s.startDate || ws);
    const weekNum = Math.floor(daysBetween(start, ws) / 7) + 1;
    const daysLeft = Math.max(1, daysBetween(today, we) + 1);
    const g = gross(db, ws, we);
    const km = odoKmBetween(db, ws, we);
    const en = energy(db, ws, we, km);
    const other = otherCarCosts(db, ws, we);
    const rent = rentWeekly(db);
    // Km excedente: o da semana do contrato que COMEÇA nesta semana (cada semana do contrato entra uma vez só)
    const cw = windows(db).find(x => dtDate(x.start) >= ws && dtDate(x.start) <= we);
    const excess = cw ? windowExcess(db, cw, nowDT) : { km: 0, over: 0, cost: 0 };
    const net = g.total - en.cost - rent - other.total - excess.cost;
    const hasCaution = weekNum >= 1 && weekNum <= num(s.cautionWeeks);
    const w = work(db, ws, we);
    const ph = perHour(db, ws, we);
    const ym = today.slice(0, 7);
    return {
      today, ws, we, weekNum, daysLeft,
      gross: g.total, uber: g.uber, n99: g.n99, km,
      revPerKm: km > 0 ? g.total / km : null,
      energy: en.cost, energyEstimated: en.estimated, energyFuel: en.fuel || 0, energyKwh: en.kwh, idleFees: en.idle, chargeSessions: en.sessions, chargesMissingCost: en.missingCost,
      otherCosts: other.total, otherCostItems: other.items,
      rent, excessKm: excess.over, excessCost: excess.cost, contractWeekN: cw ? cw.n : null,
      net, hasCaution, cashAfter: hasCaution ? net - num(s.cautionWeekly) : null,
      perDayToTarget: Math.max(0, num(s.weeklyTarget) - g.total) / daysLeft,
      perDayToFloor: Math.max(0, num(s.weeklyFloor) - g.total) / daysLeft,
      kmPerDayLeft: Math.max(0, num(s.kmLimitWeekly) - km) / daysLeft,
      hours: w.hours, trips: w.trips, cash: w.cash, conversations: w.conversations, revPerHour: ph.total,
      ym, monthGross: gross(db, ym + '-01', ym + '-31').total,
      leadsWeek: leadCounts(leadsIn(db, ws, we)), leadsToday: leadCounts(leadsIn(db, today, today)),
    };
  }

  // ── Prova de renda (R$ 9.000 brutos por mês) ──────────────
  function incomeProof(db, today) {
    const s = db.sprint || {};
    const floor = num(s.monthlyBankFloor), need = Math.max(1, Math.round(num(s.bankMonthsNeeded) || 4));
    const first = sprintFrom(db).slice(0, 7), last = today.slice(0, 7);
    const months = [];
    let ym = first;
    for (let i = 0; i < 36 && ym <= last; i++) {
      const ds = ym + '-01', de = ym + '-' + String(lastDayOfMonth(ym)).padStart(2, '0');
      const g = gross(db, ds, de), w = work(db, ds, de);
      const daysTotal = lastDayOfMonth(ym);
      const elapsed = ym < last ? daysTotal : Math.min(daysTotal, Number(today.slice(8, 10)));
      months.push({
        month: ym, uber: g.uber, n99: g.n99, total: g.total,
        cash: w.cash, cashUber: w.cashUber, cash99: w.cash99, app: g.total - w.cash,
        comissao: g.comissao, floor, hit: floor > 0 && g.total >= floor, current: ym === last,
        partial: ym === first && Number(sprintFrom(db).slice(8, 10)) > 1, // sprint começou no meio do mês
        pacePct: floor > 0 ? g.total / (floor * elapsed / daysTotal) * 100 : null,
        perDayLeft: ym === last ? Math.max(0, floor - g.total) / Math.max(1, daysTotal - elapsed + 1) : 0,
      });
      const [y, m] = ym.split('-').map(Number);
      ym = m === 12 ? (y + 1) + '-01' : y + '-' + String(m + 1).padStart(2, '0');
    }
    return { floor, need, hits: months.filter(m => m.hit).length, months };
  }

  // ── Ritmo ──────────────────────────────────────────────────
  function pace(db, today, nowDT) {
    const s = db.sprint || {};
    const wk = week(db, today, nowDT);
    const ph = perHour(db, addDays(today, -13), today);
    const cw = contractWeek(db, nowDT || today + 'T12:00');
    const proof = incomeProof(db, today);
    const cur = proof.months[proof.months.length - 1] || null;
    const hrs = v => (ph.total && ph.total > 0 ? v / ph.total : null);
    return {
      week: wk, revPerHour14d: ph.total, hours14d: ph.hours,
      toFloor: Math.max(0, num(s.weeklyFloor) - wk.gross), toTarget: Math.max(0, num(s.weeklyTarget) - wk.gross),
      perDayToFloor: wk.perDayToFloor, perDayToTarget: wk.perDayToTarget,
      hoursPerDayToFloor: hrs(wk.perDayToFloor), hoursPerDayToTarget: hrs(wk.perDayToTarget),
      kmPerDayLeft: cw.started ? cw.kmPerDayLeft : wk.kmPerDayLeft, kmSource: cw.started ? 'contrato' : 'semana',
      month: cur,
    };
  }

  // ── Pendências e alertas ──────────────────────────────────
  function pending(db, today, nowDT) {
    const s = db.sprint || {};
    const from = isDT(s.contractStart) ? dtDate(s.contractStart) : (s.startDate || today);
    const out = { unclosed: [], missing: [], alerts: [] };
    for (let d = from, i = 0; d < today && i < 400; d = addDays(d, 1), i++) {
      const dd = day(db, d);
      if (!dd.closed) { out.unclosed.push(d); continue; }
      if (dd.raw.dayOff || (dd.gross <= 0 && dd.km <= 0)) continue; // folga
      const miss = [];
      if (!dd.odoEnd) miss.push('odômetro final');
      if (dd.gross > 0 && !dd.hours) miss.push('horas online');
      if (dd.batteryEnd == null) miss.push('bateria no fim');
      if (miss.length) out.missing.push({ date: d, fields: miss });
    }
    chargesIn(db, from, today).forEach(c => { if (chargeEnergyCost(db, c) <= 0) out.missing.push({ date: c.date, fields: ['valor da recarga' + (c.place ? ' (' + c.place + ')' : '')] }); });
    const cw = contractWeek(db, nowDT || today + 'T12:00');
    if (cw.started && cw.pct !== null && cw.pct >= 80) out.alerts.push({ id: 'km80', msg: 'Km da semana do contrato em ' + Math.round(cw.pct) + '% do limite (' + Math.round(cw.km) + ' de ' + cw.limit + ' km).' });
    const wk = week(db, today, nowDT);
    if (wk.idleFees > 0) out.alerts.push({ id: 'ociosidade', msg: 'Taxa de ociosidade nesta semana: R$ ' + r2(wk.idleFees).toFixed(2) + '.' });
    const lastClosed = Object.keys(s.days || {}).filter(d => d <= today && s.days[d] && s.days[d].closedAt).sort().pop();
    if (lastClosed && s.days[lastClosed].batteryEnd != null && s.days[lastClosed].batteryEnd < 20) out.alerts.push({ id: 'bateria', msg: 'Bateria terminou em ' + s.days[lastClosed].batteryEnd + '% em ' + lastClosed + '.' });
    const elapsed = 7 - wk.daysLeft + 1;
    if (num(s.weeklyFloor) > 0 && wk.gross < num(s.weeklyFloor) * (elapsed - 1) / 7) out.alerts.push({ id: 'ritmo_piso', msg: 'Ritmo abaixo do piso: R$ ' + r2(wk.gross).toFixed(2) + ' até agora; faltam R$ ' + r2(wk.perDayToFloor).toFixed(2) + '/dia para o piso.' });
    const proof = incomeProof(db, today), cur = proof.months[proof.months.length - 1];
    if (cur && !cur.partial && cur.pacePct !== null && cur.pacePct < 100 && Number(today.slice(8, 10)) > 1) out.alerts.push({ id: 'ritmo_mes', msg: 'Mês abaixo do ritmo dos R$ ' + proof.floor + ' (' + Math.round(cur.pacePct) + '% do ritmo).' });
    if (num(s.weeklyHoursCap) > 0 && wk.hours > num(s.weeklyHoursCap)) out.alerts.push({ id: 'horas', msg: 'Semana com ' + r2(wk.hours) + ' h online (teto ' + s.weeklyHoursCap + ' h).' });
    let streak = 0;
    for (let d = addDays(today, -1), i = 0; i < 30; d = addDays(d, -1), i++) { const g = gross(db, d, d).total; if (g > 0) streak++; else break; }
    if (streak >= 7) out.alerts.push({ id: 'folga', msg: streak + ' dias seguidos rodando sem folga.' });
    if (out.unclosed.length) out.alerts.push({ id: 'sem_fechamento', msg: out.unclosed.length + ' dia(s) sem fechamento: ' + out.unclosed.slice(-5).join(', ') + (out.unclosed.length > 5 ? '…' : '') });
    return out;
  }

  // ── Desempenho por hora ───────────────────────────────────
  const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  function hourly(db, ds, de) {
    const ph = perHour(db, ds, de), w = work(db, ds, de);
    const byWd = WEEKDAYS.map(n => ({ weekday: n, days: 0, hours: 0, gross: 0, trips: 0 }));
    daysIn(db, ds, de).forEach(([d, v]) => {
      const h = num(v && v.hoursUber) + num(v && v.hours99);
      if (h <= 0) return;
      const e = byWd[weekday(d)], g = gross(db, d, d);
      e.days++; e.hours += h; e.trips += num(v.tripsUber) + num(v.trips99);
      e.gross += (num(v.hoursUber) > 0 ? g.uber : 0) + (num(v.hours99) > 0 ? g.n99 : 0);
    });
    byWd.forEach(e => { e.revPerHour = e.hours > 0 ? e.gross / e.hours : null; });
    return { perHour: ph, work: w, byWeekday: byWd };
  }

  globalThis.SprintCalc = {
    addDays, mondayOf, daysBetween, isDT, dtDate, addDaysDT, r2, LEAD_IDS, DEAL_STAGES, WEEKDAYS,
    defaults, readings, lastOdoBefore, odoKmBetween, dayKm, gross, work, perHour,
    estEnergy, estEnergyBetween, fuelIn, carChanges, carTypeOn, carConfig, segStart, chargeKwh, chargeEnergyCost, chargeCost, chargesIn, energy, otherCarCosts,
    rentWeekly, windows, windowAt, windowKm, windowExcess, odoAt, paymentsSum, contractWeek,
    leadCounts, leadsIn, funnel, day, week, incomeProof, pace, pending, hourly,
  };
})();
