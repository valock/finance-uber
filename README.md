# FinanceUber 🚗💰

App de finanças pessoais para motoristas de Uber/99 e corretores. Tudo fica salvo no próprio celular (abre rápido e funciona sem internet). Opcionalmente, os dados são enviados para o site e ficam disponíveis para o Claude por um conector, o **Claude Finance** (veja [CLAUDE-FINANCE.md](CLAUDE-FINANCE.md)).

## Funcionalidades

- 👋 **Primeiro uso em passo a passo**: você, carro (elétrico ou combustão, alugado ou não), contrato, metas e dinheiro de hoje (contas, dívidas e contas fixas)
- 🗓️ **Toda segunda depois das 04:00**: o app pergunta com qual carro você roda na semana e o odômetro. Trocar de carro conta o km de cada um separado
- 🔄 **Recomeçar do zero** em ⚙️, que baixa um backup antes de apagar
- 🏁 **Modo Sprint**: rotina diária com "☀️ Abrir o dia" e "🌙 Fechar o dia" (de hoje ou de qualquer dia anterior, com horas, viagens, dinheiro, bateria e conversas novas), cartão da semana (bruto × piso/meta, km, R$/km, R$/hora, energia real das recargas, outros gastos, excedente, líquido, caixa após caução), leads por origem e avisos do que falta lançar
- 📑 **Contrato do carro**: semana do vencimento ao vencimento (km × limite, excedente), pagamentos de aluguel e caução e custo de rescisão
- 🔌 **Recargas**: rua ou casa, kWh, valor, ociosidade e % da bateria
- 🏠 **Funil de vendas** da corretagem e 🏦 **prova de renda** (meses com bruto ≥ piso do banco, dinheiro × app)
- 🎯 **Metas** diária, semanal e mensal com barra de progresso
- 💰 **Renda**: Uber, 99, salário do cônjuge e comissões de corretor
- 🔌 **Carro a combustão ou elétrico**: custo por km em km/L ou km/kWh
- 📋 **Contas a pagar**, 💳 **dívidas**, 🏦 **financiamentos** e **patrimônio**
- 📊 **Resumo** mensal e auditoria semanal
- 💾 **Backup**: Exportar/Importar em JSON, com aviso no Início quando passar de 7 dias sem backup
- 📥 **Importar da planilha**: caixa de entrada no Google Planilhas para um assistente do WhatsApp (ex.: Instinct) lançar ganhos, gastos e o fechamento do dia, e um resumo (`/api/resumo/<chave de leitura>`) para ele consultar. Veja [INSTINCT.md](INSTINCT.md)
- 🤖 **Conector do Claude**: envio automático dos dados e um servidor MCP só de leitura com 14 ferramentas (resumos, semana do contrato, prova de renda, recargas, ritmo, pendências, funil de vendas, desempenho por hora e mais)

## Rodar localmente

```bash
npx serve .
```

## Deploy (Netlify)

O site é estático e o Netlify publica a pasta raiz. As funções em `netlify/functions/` usam as dependências do `package.json`, que o Netlify instala sozinho:

- `sync.mjs`: `POST /api/setup`, `PUT /api/sync` e `GET /api/sync` (envio e restauração dos dados)
- `mcp.mjs`: `/mcp/<chave de leitura>` (conector do Claude)
- `planilha.mjs`: `POST /api/planilha` (lê a planilha-caixa-de-entrada para o app; só endereços do Google Planilhas)
- `resumo.mjs`: `/api/resumo/<chave de leitura>` (resumo em CSV para `IMPORTDATA`)

Os dados enviados ficam no Netlify Blobs do site.

## Dados

- Ficam no `localStorage` do navegador, na chave `finance_uber_v2`.
- Campos novos sempre ganham valor padrão ao carregar (`loadDb`/`loadMerge`), então backups antigos continuam abrindo.
- Os cálculos do sprint ficam em `sprint-calc.js`, usado pelo app e pelo conector.
- Para levar os dados a outro celular: ⚙️ → Exportar no de origem e ⚙️ → Importar no de destino. Com o conector ativo, também dá para usar ⚙️ → Conectar ao Claude → 🔑 Outro celular.

## Stack

- HTML + CSS + JavaScript puro (sem framework e sem build)
- [Chart.js](https://chartjs.org) para os gráficos
- Service worker para funcionar offline
- Netlify Functions + Netlify Blobs + MCP SDK (só no servidor, para o conector)
- [Netlify](https://netlify.com) para hospedagem

## Licença

MIT
