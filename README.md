# FinanceUber 🚗💰

App de finanças pessoais para motoristas de Uber/99 e corretores. Tudo fica salvo no próprio celular: abre rápido, funciona sem internet e não depende de servidor.

## Funcionalidades

- 🏁 **Modo Sprint**: rotina diária com "☀️ Abrir o dia" e "🌙 Fechar o dia", cartão da semana (bruto × piso/meta, km × limite, R$/km, energia, líquido, caixa após caução) e leads por origem
- 🎯 **Metas** diária, semanal e mensal com barra de progresso
- 💰 **Renda**: Uber, 99, salário do cônjuge e comissões de corretor
- 🔌 **Carro a combustão ou elétrico**: custo por km em km/L ou km/kWh
- 📋 **Contas a pagar**, 💳 **dívidas**, 🏦 **financiamentos** e **patrimônio**
- 📊 **Resumo** mensal e auditoria semanal
- 💾 **Backup**: Exportar/Importar em JSON, com aviso no Início quando passar de 7 dias sem backup

## Rodar localmente

```bash
npx serve .
```

## Deploy (Netlify)

Site estático, sem etapa de build: o Netlify publica a pasta raiz como está (veja `netlify.toml`).

## Dados

- Ficam no `localStorage` do navegador, na chave `finance_uber_v2`.
- Campos novos sempre ganham valor padrão ao carregar (`loadDb`/`loadMerge`), então backups antigos continuam abrindo.
- Para levar os dados a outro celular: ⚙️ → Exportar no de origem e ⚙️ → Importar no de destino.

## Stack

- HTML + CSS + JavaScript puro (sem framework e sem build)
- [Chart.js](https://chartjs.org) para os gráficos
- Service worker para funcionar offline
- [Netlify](https://netlify.com) para hospedagem

## Licença

MIT
