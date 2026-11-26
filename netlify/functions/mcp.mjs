// Conector do Claude: https://<site>/mcp/<chave-de-leitura>
// A chave de leitura só permite LER os dados; não serve para enviar ou apagar nada.
import { handleMcp } from '../lib/mcp-server.mjs';
import { checkReadKey } from '../lib/store.mjs';
import { loadWithInbox } from '../lib/sheets.mjs';

export default async (req, context) => {
  if (!(await checkReadKey(context.params?.key))) return new Response('Not found', { status: 404 });
  try {
    return await handleMcp(req, () => loadWithInbox());
  } catch (e) {
    console.error('mcp error', e);
    return new Response('Erro no servidor', { status: 500 });
  }
};

export const config = {
  path: '/mcp/:key',
  rateLimit: { windowSize: 60, windowLimit: 120, aggregateBy: ['ip', 'domain'] },
};
