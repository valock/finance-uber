# FinanceUber 🚗💰

App de finanças pessoais para motoristas de Uber/99 e corretores. Tudo fica salvo no próprio celular (abre rápido e funciona sem internet). Opcionalmente, os dados são enviados para o site e ficam disponíveis para o Claude por um conector, o **Claude Finance** (veja [CLAUDE-FINANCE.md](CLAUDE-FINANCE.md)).

## Funcionalidades

- 🏁 **Modo Sprint**: rotina diária com "☀️ Abrir o dia" e "🌙 Fechar o dia", cartão da semana (bruto × piso/meta, km × limite, R$/km, energia, líquido, caixa após caução) e leads por origem
- 🎯 **Metas** diária, semanal e mensal com barra de progresso
- 💰 **Renda**: Uber, 99, salário do cônjuge e comissões de corretor
- 🔌 **Carro a combustão ou elétrico**: custo por km em km/L ou km/kWh
- 📋 **Contas a pagar**, 💳 **dívidas**, 🏦 **financiamentos** e **patrimônio**
- 📊 **Resumo** mensal e auditoria semanal
- 💾 **Backup**: Exportar/Importar em JSON, com aviso no Início quando passar de 7 dias sem backup
- 🤖 **Conector do Claude**: envio automático dos dados e um servidor MCP só de leitura com 7 ferramentas (resumo da semana, do dia e do mês, lançamentos, leads, situação geral e dados completos)

## Rodar localmente

```bash
npx serve .
```

## Deploy (Netlify)

O site é estático e o Netlify publica a pasta raiz. As funções em `netlify/functions/` usam as dependências do `package.json`, que o Netlify instala sozinho:

- `sync.mjs`: `POST /api/setup`, `PUT /api/sync` e `GET /api/sync` (envio e restauração dos dados)
- `mcp.mjs`: `/mcp/<chave de leitura>` (conector do Claude)

Os dados enviados ficam no Netlify Blobs do site.

## Dados

- Ficam no `localStorage` do navegador, na chave `finance_uber_v2`.
- Campos novos sempre ganham valor padrão ao carregar (`loadDb`/`loadMerge`), então backups antigos continuam abrindo.
- Para levar os dados a outro celular: ⚙️ → Exportar no de origem e ⚙️ → Importar no de destino. Com o conector ativo, também dá para usar ⚙️ → Conectar ao Claude → 🔑 Outro celular.

## Stack

- HTML + CSS + JavaScript puro (sem framework e sem build)
- [Chart.js](https://chartjs.org) para os gráficos
- Service worker para funcionar offline
- Netlify Functions + Netlify Blobs + MCP SDK (só no servidor, para o conector)
- [Netlify](https://netlify.com) para hospedagem

## Licença

MIT
