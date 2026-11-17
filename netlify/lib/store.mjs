// Armazenamento no Netlify Blobs (store do site, região fixa em toda chamada)
import { getStore } from '@netlify/blobs';
import { sha256Hex, sameHash, isHex64 } from './core.mjs';

const store = () => getStore({ name: 'financeuber', region: 'us-east-2', consistency: 'strong' });

// auth = { keyHash, readHash, createdAt } — só hashes, nunca as chaves
export async function getAuth() { return store().get('auth', { type: 'json' }); }
export async function createAuth(keyHash, readHash) {
  const { modified } = await store().setJSON('auth', { keyHash, readHash, createdAt: new Date().toISOString() }, { onlyIfNew: true });
  return modified;
}
export async function checkWriteKey(key) {
  if (!isHex64(key)) return false;
  const auth = await getAuth();
  return !!auth && sameHash(sha256Hex(key), auth.keyHash);
}
export async function checkReadKey(readKey) {
  if (!isHex64(readKey)) return false;
  const auth = await getAuth();
  return !!auth && sameHash(sha256Hex(readKey), auth.readHash);
}

// db = o mesmo JSON do app; meta = { savedAt, device }
export async function saveDb(db, meta) {
  const s = store();
  await s.setJSON('db', db);
  await s.setJSON('meta', meta);
  // Cópia do dia (a última versão de cada dia fica guardada em historico/AAAA-MM-DD)
  await s.setJSON('historico/' + meta.savedAt.slice(0, 10), db);
}
export async function loadDb() {
  const [db, meta] = await Promise.all([store().get('db', { type: 'json' }), store().get('meta', { type: 'json' })]);
  return { db, meta };
}
