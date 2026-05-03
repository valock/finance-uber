# FinanceUber 🚗💰

App de finanças pessoais para motoristas de Uber e corretores. Controle de metas, contas a pagar, dívidas e orçamento familiar — com sincronização em tempo real entre cônjuges via Supabase.

## Funcionalidades

- 🎯 **Metas Uber** — meta diária, semanal e mensal com barra de progresso
- 💰 **Renda** — lançamentos de corridas Uber e comissões de corretor
- 📋 **Contas a Pagar** — contas recorrentes com status pago/pendente por mês
- 💳 **Dívidas** — estratégia Avalanche com estimativa de quitação
- 📊 **Orçamento** — resumo mensal e plano de quitação de dívidas
- 👨‍👩‍ **Sala Familiar** — sincronização em tempo real com a esposa/marido

## Setup Local

```bash
# Clone o projeto
git clone https://github.com/SEU_USUARIO/finance-uber.git
cd finance-uber

# Copie o exemplo de configuração
cp config.example.js config.js

# Edite config.js com suas credenciais do Supabase
# (config.js está no .gitignore e nunca vai para o GitHub)
```

Abra `index.html` direto no navegador ou use um servidor local:

```bash
npx serve .
```

## Setup do Supabase

1. Crie um projeto em [supabase.com](https://supabase.com)
2. Vá em **SQL Editor** e execute o conteúdo de [`supabase-setup.sql`](supabase-setup.sql)
3. Copie a **URL** e a **anon key** em Settings → API
4. Cole em `config.js`

## Deploy no Netlify

1. Faça push do código para um repositório **público** no GitHub  
   *(config.js está no .gitignore — suas credenciais não vão para o repo)*
2. Acesse [netlify.com](https://netlify.com) → **Add new site → Import from Git**
3. Configure as variáveis de ambiente:
   - `SUPABASE_URL` → `https://seu-projeto.supabase.co`
   - `SUPABASE_ANON_KEY` → `eyJ...sua_chave`
4. Deploy! O Netlify gera o `config.js` automaticamente no build.

## Como funciona a Sala Familiar

1. Um cônjuge abre o app → ⚙️ → **Conectar Sala Familiar** → **Criar sala**
2. Anota o código de 6 letras (ex: `ABC123`)
3. O outro cônjuge abre o app → **Entrar** → digita o código
4. A partir daí, todos os lançamentos sincronizam em tempo real 🔄

## Contribuindo

PRs e sugestões são bem-vindos! Abra uma issue para discutir melhorias.

Áreas que precisam de ajuda:
- [ ] Gráfico de evolução de renda por semana
- [ ] Notificações de contas a vencer
- [ ] Modo escuro
- [ ] Histórico de pagamento de dívidas
- [ ] Exportar relatório em PDF

## Stack

- HTML + CSS + JavaScript (vanilla, sem framework)
- [Tailwind CSS](https://tailwindcss.com) via CDN
- [Chart.js](https://chartjs.org) para gráficos
- [Supabase](https://supabase.com) para banco de dados e realtime
- [Netlify](https://netlify.com) para hospedagem

## Licença

MIT
