// A cada 15 minutos o servidor lê a planilha do assistente, mesmo com o celular fechado.
// Assim o resumo (IMPORTDATA) e o conector do Claude já contam o que o assistente lançou.
// Nada é gravado no banco: o app grava quando for aberto (sem duplicar).
import { loadDb } from '../lib/store.mjs';
import { refreshSheetCache } from '../lib/sheets.mjs';

export default async () => {
  try {
    const { db } = await loadDb();
    const c = await refreshSheetCache(db, 0);
    console.log('planilha', c ? (c.erro || 'ok ' + (c.csv || '').length + ' bytes') : 'sem planilha configurada');
  } catch (e) { console.error('planilha agendada', e); }
};

export const config = { schedule: '*/15 * * * *' };
