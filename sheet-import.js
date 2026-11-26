// Regras da planilha-caixa-de-entrada (assistente do WhatsApp): ler, validar e gravar as linhas.
// Um arquivo só, usado pelo app (navegador) e pelo servidor (resumo e conector), para os dois lerem a planilha igual.
// Precisa do sprint-calc.js carregado antes (usa SprintCalc.lastOdoBefore).
(function () {
  'use strict';
  const fmtI = n => Math.round(n || 0).toLocaleString('pt-BR');
  const fmtD = s => { if (!s) return ''; const [, m, d] = s.split('-'); return d + '/' + m; };
  function parseHours(v) {
    v = String(v || '').trim().replace(',', '.'); if (!v) return 0;
    const m = v.match(/^(\d+)\s*[:h]\s*(\d{1,2})$/i); if (m) return (+m[1]) + (+m[2]) / 60;
    return Math.max(0, parseFloat(v) || 0);
  }
  function cfgOf(db) {
    const s = db.sprint || (db.sprint = {});
    if (!s.sheetImport || typeof s.sheetImport !== 'object') s.sheetImport = { url: '', auto: false, imported: {}, lastRun: null, lastResult: null };
    if (!s.sheetImport.imported || typeof s.sheetImport.imported !== 'object') s.sheetImport.imported = {};
    ['charges', 'payments', 'leads'].forEach(k => { if (!Array.isArray(s[k])) s[k] = []; });
    if (!s.days || typeof s.days !== 'object') s.days = {};
    if (!Array.isArray(db.income)) db.income = [];
    if (!Array.isArray(db.costs)) db.costs = [];
    if (!Array.isArray(db.kmLog)) db.kmLog = [];
    return s.sheetImport;
  }
  function recordKmDb(db, h, date, odo, km) {
    db.kmLog = db.kmLog.filter(k => k.date !== date);
    const entry = { id: h.uid(), date, km: km || 0 };
    if (odo > 0) entry.odometerKm = odo;
    db.kmLog.push(entry);
  }
  const SHEET_TYPES={
    ganho_uber:'Ganho Uber', ganho_99:'Ganho 99', comissao:'Comissão', recarga:'Recarga', aluguel_carro:'Aluguel do carro',
    caucao:'Caução', custo_carro:'Gasto do carro', outro:'Outro gasto', fechamento_dia:'Fechamento do dia',
    lead_uber:'Lead Dentro do Uber', lead_organico:'Lead orgânico', lead_parceiro:'Lead parceiro', lead_outros:'Lead outros',
    horas_uber:'Horas online Uber', horas_99:'Horas online 99', viagens_uber:'Viagens Uber', viagens_99:'Viagens 99',
    dinheiro_uber:'Dinheiro em espécie Uber', dinheiro_99:'Dinheiro em espécie 99', bateria_fim:'Bateria no fim do dia', conversas:'Conversas novas',
  };
  // Tipos que preenchem um campo do dia (o valor substitui o anterior daquele dia)
  const SHEET_DAY_FIELDS={horas_uber:'hoursUber', horas_99:'hours99', viagens_uber:'tripsUber', viagens_99:'trips99',
    dinheiro_uber:'cashUber', dinheiro_99:'cash99', bateria_fim:'batteryEnd', conversas:'conversations'};
    function stripAccents(t) { return String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,''); }
  // CSV com aspas (formato do Google Planilhas)
  function parseCsv(text) {
    const rows=[]; let row=[], cell='', q=false;
    text=String(text||'').replace(/^﻿/,'');
    for(let i=0;i<text.length;i++) {
      const ch=text[i];
      if(q) { if(ch==='"') { if(text[i+1]==='"') { cell+='"'; i++; } else q=false; } else cell+=ch; }
      else if(ch==='"') q=true;
      else if(ch===',') { row.push(cell); cell=''; }
      else if(ch==='\n'||ch==='\r') { if(ch==='\r'&&text[i+1]==='\n') i++; row.push(cell); rows.push(row); row=[]; cell=''; }
      else cell+=ch;
    }
    if(cell!==''||row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  // "R$ 1.234,56" · "45,70" · "45.7" · "1,234.56" → número (ou null)
  function parseMoney(v) {
    let t=String(v??'').trim().replace(/r\$/i,'').replace(/\s/g,'');
    if(!t) return null;
    let neg=false; if(/^\(.*\)$/.test(t)) { neg=true; t=t.slice(1,-1); } if(t.startsWith('-')) { neg=true; t=t.slice(1); }
    if(!/^[\d.,]+$/.test(t)) return null;
    const lc=t.lastIndexOf(','), ld=t.lastIndexOf('.');
    if(lc>=0 && ld>=0) t=lc>ld ? t.replace(/\./g,'').replace(',','.') : t.replace(/,/g,'');
    else if(lc>=0) t=(/^\d{1,3}(,\d{3})+$/.test(t) && !/,\d{1,2}$/.test(t)) ? t.replace(/,/g,'') : t.replace(',','.');
    else if(ld>=0 && /^\d{1,3}(\.\d{3})+$/.test(t)) t=t.replace(/\./g,'');
    const n=parseFloat(t);
    return isFinite(n) ? (neg?-n:n) : null;
  }
  // "24/11/2026" · "24/11/26" · "2026-11-24" · "24-11-2026" → 'AAAA-MM-DD' (ou null)
  function parseSheetDate(v) {
    const t=String(v??'').trim().split(/[ T]/)[0];
    let y,m,d, x;
    if((x=t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y=+x[1]; m=+x[2]; d=+x[3]; }
    else if((x=t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/))) { d=+x[1]; m=+x[2]; y=+x[3]; if(y<100) y+=2000; }
    else return null;
    const dt=new Date(Date.UTC(y,m-1,d));
    if(dt.getUTCFullYear()!==y || dt.getUTCMonth()!==m-1 || dt.getUTCDate()!==d) return null;
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  function sheetKey(date,tipo,valor,obs) { return [date,tipo,valor===null?'':valor.toFixed(2),stripAccents(obs).trim().toLowerCase().replace(/\s+/g,' ')].join('|'); }
  const SHEET_COLS={data:['data','dia'], tipo:['tipo'], valor:['valor','valor r$','valor (r$)'], km:['km','odometro','odometro km'], obs:['observacao','obs','observacoes','descricao'], importado:['importado']};
  function sheetHeaderMap(header) {
    const norm=header.map(h=>stripAccents(h).trim().toLowerCase());
    const map={};
    Object.entries(SHEET_COLS).forEach(([k,names])=>{ const i=norm.findIndex(h=>names.includes(h)); if(i>=0) map[k]=i; });
    return map;
  }
  function costCategoryFromObs(obs) {
    const o=stripAccents(obs).toLowerCase();
    if(/lav(agem|a jato|ar)/.test(o)) return 'Lavagem';
    if(/multa/.test(o)) return 'Multa';
    if(/estacion|zona azul|parking/.test(o)) return 'Estacionamento';
    if(/pneu|oficina|mecanic|manuten|borrach|revis|oleo/.test(o)) return 'Manutenção';
    if(/gasolina|etanol|alcool|combust|posto|diesel/.test(o)) return 'Combustível';
    return 'Outros';
  }
  // Valida uma linha. Devolve {ok, motivo, item}
  function validateSheetRow(r, map, today) {
    const get=k=>map[k]!==undefined?String(r[map[k]]??'').trim():'';
    const raw={data:get('data'), tipo:get('tipo'), valor:get('valor'), km:get('km'), obs:get('obs'), importado:get('importado')};
    if(!raw.data && !raw.tipo && !raw.valor && !raw.km && !raw.obs) return {empty:true};
    if(raw.importado) return {skipMarked:true};
    const date=parseSheetDate(raw.data);
    if(!date) return {erro:`data "${raw.data||'vazia'}" inválida (use dd/mm/aaaa)`, raw};
    if(date>today) return {erro:`data ${fmtD(date)} está no futuro`, raw};
    if(date<'2020-01-01') return {erro:`data ${raw.data} muito antiga`, raw};
    const tipo=stripAccents(raw.tipo).trim().toLowerCase().replace(/[\s-]+/g,'_');
    if(!SHEET_TYPES[tipo]) return {erro:`tipo "${raw.tipo||'vazio'}" não existe`, raw};
    let valor=parseMoney(raw.valor);
    let km=null;
    if(raw.km) { km=parseMoney(raw.km); if(km===null || km<0 || Math.abs(km-Math.round(km))>1e-9) return {erro:`km "${raw.km}" não é um número inteiro`, raw}; km=Math.round(km); }
    if(tipo==='fechamento_dia') {
      if(!(km>0)) return {erro:'fechamento_dia precisa do km (odômetro no fim do dia)', raw};
      if(raw.valor && valor===null) return {erro:`valor "${raw.valor}" não é um número`, raw};
      valor=valor||0;
    } else if(SHEET_DAY_FIELDS[tipo]) {
      if(tipo.startsWith('horas_')) valor=/[:h]/i.test(raw.valor)?parseHours(raw.valor):valor;
      if(valor===null || !(valor>=0) || (!raw.valor && raw.valor!=='0')) return {erro:`valor "${raw.valor||'vazio'}" não é um número`, raw};
      if(tipo.startsWith('horas_') && valor>24) return {erro:`${raw.valor} horas não cabem em um dia`, raw};
      if(tipo==='bateria_fim' && valor>100) return {erro:`bateria ${raw.valor}% acima de 100`, raw};
      if(/^(viagens_|conversas)/.test(tipo) || tipo==='bateria_fim') { if(Math.abs(valor-Math.round(valor))>1e-9) return {erro:`"${raw.valor}" precisa ser um número inteiro`, raw}; valor=Math.round(valor); }
      if(tipo.startsWith('horas_')) valor=Math.round(valor*100)/100;
    } else if(tipo.startsWith('lead_')) {
      if(valor===null) valor=1;
      if(valor<1 || valor>50 || Math.abs(valor-Math.round(valor))>1e-9) return {erro:`quantidade de leads "${raw.valor}" inválida (1 a 50)`, raw};
      valor=Math.round(valor);
    } else {
      if(valor===null) return {erro:`valor "${raw.valor||'vazio'}" não é um número`, raw};
      if(valor<=0) return {erro:`valor ${raw.valor} precisa ser maior que zero`, raw};
    }
    return {ok:true, item:{date, tipo, valor, km, obs:raw.obs}, raw};
  }
  // Grava uma linha válida nas estruturas de sempre. Devolve erro (texto) ou null.
  function applySheetItem(db, it, key, h) {
    const s=db.sprint, note=it.obs||'Planilha', src={src:'planilha', sheetKey:key};
    switch(it.tipo) {
      case 'ganho_uber': h.recordIncome({id:h.uid(), type:'uber', amount:it.valor, date:it.date, note, ...src}); break;
      case 'ganho_99':   h.recordIncome({id:h.uid(), type:'99',   amount:it.valor, date:it.date, note, ...src}); break;
      case 'comissao':   h.recordIncome({id:h.uid(), type:'comissao', amount:it.valor, date:it.date, note, ...src}); break;
      case 'recarga': {
        const kind=/\bcasa\b/i.test(stripAccents(it.obs))?'casa':'rua';
        s.charges.push({id:h.uid(), date:it.date, at:it.date+'T12:00', place:it.obs||'', kind, kwh:0, energyCost:it.valor, idleFee:0, ...src});
        break;
      }
      case 'aluguel_carro': case 'caucao': {
        const p={id:h.uid(), date:it.date, kind:it.tipo==='caucao'?'caucao':'aluguel', amount:it.valor, ...src};
        if(it.km>0) p.odometerKm=it.km; if(it.obs) p.note=it.obs;
        s.payments.push(p); break;
      }
      case 'custo_carro': {
        const c={id:h.uid(), type:'car', category:costCategoryFromObs(it.obs), amount:it.valor, date:it.date, note, ...src};
        if(it.km>0) c.odometerKm=it.km;
        db.costs.push(c); break;
      }
      case 'outro': db.costs.push({id:h.uid(), type:'variable', category:'Outros', amount:it.valor, date:it.date, note, ...src}); break;
      case 'fechamento_dia': {
        const day=s.days[it.date]||{};
        const prev=day.odoStart>0?day.odoStart:globalThis.SprintCalc.lastOdoBefore(db, it.date);
        if(prev!==null && it.km<prev) return `km ${fmtI(it.km)} menor que a leitura anterior (${fmtI(prev)})`;
        recordKmDb(db, h, it.date, it.km, prev!==null?it.km-prev:0);
        day.odoEnd=it.km; if(!day.closedAt) day.closedAt=h.now();
        if(it.obs && !day.note) day.note=it.obs;
        if(/\bfolga\b/i.test(it.obs||'')) day.dayOff=true;
        s.days[it.date]=day; break;
      }
      default: {
        if(SHEET_DAY_FIELDS[it.tipo]) { const day=s.days[it.date]||{}; day[SHEET_DAY_FIELDS[it.tipo]]=it.valor; s.days[it.date]=day; break; }
        const source=it.tipo.replace('lead_','');
        for(let i=0;i<it.valor;i++) s.leads.push({id:h.uid(), date:it.date, source, at:h.now(), ...src});
      }
    }
    return null;
  }
  
  // Processa o CSV inteiro: valida, ignora as já importadas, grava as novas no db (marca a chave como importada)
  // h = { uid(), now(), recordIncome(entry) }
  function importCsv(db, text, today, h) {
    const cfg = cfgOf(db), rows = parseCsv(text);
    const res = { imported: 0, duplicates: 0, marked: 0, errors: [], byType: {}, at: h.now() };
    if (!rows.length) { res.errors.push({ line: 0, motivo: 'planilha vazia' }); return res; }
    const map = sheetHeaderMap(rows[0]);
    const missing = ['data', 'tipo', 'valor'].filter(k => map[k] === undefined);
    if (missing.length) { res.errors.push({ line: 1, motivo: `cabeçalho sem a(s) coluna(s): ${missing.join(', ')}` }); return res; }
    const seenNow = new Set();
    // Fechamentos por último (depois dos ganhos do mesmo dia) e em ordem de data
    const parsed = rows.slice(1).map((r, i) => ({ line: i + 2, v: validateSheetRow(r, map, today) }));
    parsed.sort((a, b) => { const fa = a.v.item?.tipo === 'fechamento_dia', fb = b.v.item?.tipo === 'fechamento_dia'; return fa !== fb ? (fa ? 1 : -1) : ((a.v.item?.date || '').localeCompare(b.v.item?.date || '') || a.line - b.line); });
    parsed.forEach(({ line, v }) => {
      if (v.empty) return;
      if (v.skipMarked) { res.marked++; return; }
      if (v.erro) { res.errors.push({ line, motivo: v.erro, raw: v.raw }); return; }
      const it = v.item, key = sheetKey(it.date, it.tipo, it.valor, it.obs);
      if (cfg.imported[key] || seenNow.has(key)) { res.duplicates++; return; }
      const e = applySheetItem(db, it, key, h);
      if (e) { res.errors.push({ line, motivo: e, raw: v.raw }); return; }
      cfg.imported[key] = res.at; seenNow.add(key);
      res.imported++; res.byType[it.tipo] = (res.byType[it.tipo] || 0) + 1;
    });
    res.errors.sort((a, b) => a.line - b.line);
    return res;
  }

  globalThis.SheetImport = { SHEET_TYPES, SHEET_DAY_FIELDS, parseCsv, parseMoney, parseSheetDate, parseHours, sheetKey, sheetHeaderMap, costCategoryFromObs, validateSheetRow, applySheetItem, importCsv, cfgOf };
})();
