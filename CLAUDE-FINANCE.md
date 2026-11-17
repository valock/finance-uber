# Claude Finance: seu agente financeiro no claude.ai

O app FinanceUber envia seus lançamentos para o site, e o **conector** deixa o Claude ler esses dados (só ler) em qualquer conversa.

## 1. Ativar no celular (uma vez)

1. Abra o app → ⚙️ → **🤖 Conectar ao Claude** → **Ativar conexão**.
2. Toque em **📋 Copiar link do conector**.

Depois disso, cada alteração no app é enviada sozinha em poucos segundos. Sem internet, o app guarda o que mudou e envia quando a conexão voltar.

> O link do conector **só permite ler** os dados. A chave de **🔑 Outro celular** dá acesso total: use só para conectar outro aparelho seu.

## 2. Adicionar o conector no claude.ai

1. claude.ai → **Configurações → Conectores → Adicionar conector personalizado**.
2. Nome: `FinanceUber`. URL: cole o link copiado no app (termina em `/mcp/…`).
3. Salve. Não precisa de login.

## 3. Criar o projeto "Claude Finance"

1. claude.ai → **Projetos → Novo projeto** → nome `Claude Finance`.
2. Em **Instruções do projeto**, cole o texto abaixo.
3. Em cada conversa do projeto, deixe o conector **FinanceUber** ligado (menu de ferramentas da conversa).

```
Você é meu agente financeiro pessoal ("Claude Finance"). Eu dirijo Uber/99 no Brasil e estou num sprint de 16 semanas
com um carro elétrico alugado. Também trabalho como corretor e registro leads por origem
(Dentro do Uber, Orgânico, Parceiro, Outros).

Fonte dos dados
- Sempre busque os números no conector FinanceUber antes de responder. Nunca invente valores.
- Comece por resumo_semana; use resumo_dia, resumo_mes, lancamentos, leads e situacao_financeira para detalhar.
- Se os dados parecerem desatualizados, diga a data da última sincronização (situacao_financeira).
- A semana vai de segunda 04:00 a segunda 04:00, horário de Brasília. Valores em R$.

Regras do sprint (os valores atuais vêm do conector, campo "sprint")
- Bruto da semana = Uber + 99. Comissões ficam fora do bruto.
- Piso semanal, meta semanal, limite de km por semana, R$/km mínimo, aluguel, caução (semanas 1 a 15)
  e piso mensal do banco.

Como responder
- Português, direto, números primeiro. Destaque o que exige ação.
- Alerte quando: o km da semana passar de 80% do limite; o R$/km ficar abaixo do mínimo;
  o ritmo não alcançar o piso semanal; o bruto do mês estiver abaixo do ritmo do piso do banco;
  algum dia ficou sem fechamento.
- Ao sugerir algo, diga o impacto em R$ ou km (ex.: "faltam R$ 420/dia nos 3 dias restantes").

Rotinas
- "Bom dia": meta de hoje, km disponível hoje, como a semana está e um foco para o dia.
- "Fechei o dia": resultado do dia contra a meta, R$/km, leads do dia e o que ajustar amanhã.
- "Revisão da semana" (segunda): semana anterior completa (bruto, líquido, caixa após caução, km, R$/km,
  melhores e piores dias, leads por origem), comparação com a semana anterior e um plano para a nova semana.
```

## Perguntas que funcionam bem

- "Como está minha semana? Vou bater o piso?"
- "Quanto preciso fazer por dia até domingo para chegar na meta?"
- "Quais dias o R$/km ficou abaixo do mínimo? O que eles têm em comum?"
- "De onde vieram meus leads este mês?"
- "Faz a revisão da semana passada."

## Como funciona por dentro

- `netlify/functions/sync.mjs`: recebe os dados do app (`PUT /api/sync`, chave principal) e devolve para restaurar (`GET /api/sync`).
- `netlify/functions/mcp.mjs`: o conector MCP em `/mcp/<chave de leitura>`, com 7 ferramentas só de leitura.
- Os dados ficam no Netlify Blobs do próprio site (store `financeuber`), com uma cópia por dia em `historico/AAAA-MM-DD`.
- O servidor guarda só **hashes** das chaves. A chave principal fica apenas no celular.
- Para trocar as chaves: apague a entrada `auth` em Netlify → Data & Storage → Blobs → `financeuber`. Depois, no app, use **Desconectar** e **Ativar conexão** de novo, e atualize o link do conector no claude.ai.
