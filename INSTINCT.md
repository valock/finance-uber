# Instinct: assistente do WhatsApp ligado ao FinanceUber

O Instinct (assistente de IA no WhatsApp) lê e escreve no Google Planilhas. A ligação com o app usa duas planilhas:

| Planilha | Para quê | Quem escreve | Compartilhamento |
|---|---|---|---|
| **Caixa de entrada** (aba `entradas`) | O Instinct lança ganhos, gastos e o fechamento do dia | Instinct | "Qualquer pessoa com o link: **leitor**" (o app lê por esse link) |
| **Resumo** (aba `resumo`) | O Instinct consulta como está a semana, a meta, o km… | o próprio FinanceUber (fórmula) | **Privada** (só a sua conta Google) |

A planilha não substitui o banco: o app lê as linhas novas e grava no banco dele. Linhas já importadas nunca entram de novo.

**Sempre atualizado, mesmo com o celular fechado:** o site lê a caixa de entrada sozinho a cada 15 minutos (e também na hora de
uma consulta, se a última leitura tiver mais de 10 minutos). O resumo e o conector do Claude já somam o que o Instinct lançou.
Quando você abre o app, ele grava essas mesmas linhas no banco, sem duplicar.

## 1. Caixa de entrada

1. Crie uma planilha, renomeie a primeira aba para `entradas` e escreva na linha 1:

   `data | tipo | valor | km | observação | importado`

2. Compartilhar → Acesso geral → **Qualquer pessoa com o link** → **Leitor**.
3. Com a aba `entradas` aberta, copie o link (ele termina em `#gid=…`).
4. No app: ⚙️ → **📥 Importar da planilha** → cole o link → marque **Importar sozinho** → **Importar agora**.

> Quem tiver o link da caixa de entrada vê o que está nela. Deixe ali só os lançamentos; o resumo fica na outra planilha, privada.

### Tipos aceitos

| tipo | valor | km | observação | vira no app |
|---|---|---|---|---|
| `ganho_uber` | R$ | – | opcional | Renda Uber do dia |
| `ganho_99` | R$ (app + dinheiro) | – | opcional | Renda 99 do dia |
| `comissao` | R$ | – | cliente/negócio | Comissão (fora do bruto do sprint) |
| `recarga` | R$ pago | – | local (com "casa" vira recarga em casa) | Recarga (energia real) |
| `aluguel_carro` | R$ | odômetro no vencimento (opcional) | – | Pagamento de aluguel |
| `caucao` | R$ | – | – | Pagamento de caução |
| `custo_carro` | R$ | opcional | o que foi (lavagem, multa, pneu, estacionamento…) | Gasto do carro (entra no líquido) |
| `outro` | R$ | – | o que foi (lanche, farmácia…) | Gasto variável "Outros" |
| `fechamento_dia` | vazio ou 0 | **odômetro no fim do dia (obrigatório)** | opcional | Fecha o dia e calcula o km |
| `horas_uber` / `horas_99` | horas (ex.: `6:30` ou `6,5`) | – | – | Horas online do dia |
| `viagens_uber` / `viagens_99` | quantidade | – | – | Viagens do dia |
| `dinheiro_uber` / `dinheiro_99` | R$ recebido em espécie (já incluído no ganho) | – | – | Separação dinheiro × app (prova de renda) |
| `bateria_fim` | % | – | – | Bateria no fim do dia |
| `conversas` | quantidade | – | – | Conversas novas (corretagem) |
| `lead_uber` / `lead_organico` / `lead_parceiro` / `lead_outros` | quantidade (1 a 50) | – | – | Leads por origem |

Regras da importação:
- `data` em `dd/mm/aaaa` (ou `aaaa-mm-dd`), nunca no futuro. `valor` aceita `45,70`, `R$ 1.234,56` ou `45.7`.
- Linha com `importado` preenchido é ignorada. Linhas iguais (data + tipo + valor + observação) entram uma vez só.
  Dois gastos iguais no mesmo dia: mude a observação (ex.: `lanche manhã` e `lanche tarde`).
- Para os campos do dia (horas, viagens, dinheiro, bateria, conversas) o valor novo substitui o anterior daquele dia.
- Linhas com erro não entram; o app lista a linha e o motivo para corrigir.
- No app: importa ao abrir e a cada 15 minutos com ele aberto. No site: lê a planilha a cada 15 minutos, sempre.

## 2. Resumo (para o Instinct consultar)

1. Crie outra planilha **privada**, com uma aba chamada `resumo`.
2. No app: ⚙️ → **📥 Importar da planilha** → **🔎 Resumo para o assistente consultar** → **Copiar fórmula**.
3. Cole a fórmula na célula A1 da aba `resumo`. Ela traz duas colunas (`campo`, `valor`) com: ganhos de hoje, semana × piso e meta,
   quanto falta por dia, km e vencimento do contrato, energia, líquido, caixa após caução, mês × banco, prova de renda,
   funil de vendas, dias sem fechamento e alertas.

O Google atualiza o `IMPORTDATA` sozinho (mais ou menos a cada hora). O resumo usa a mesma chave **só de leitura** do conector do Claude.

## 3. Instruções para colar no Instinct

Troque o que está entre colchetes.

```
Você é o Instinct, meu assistente financeiro no WhatsApp. Sou motorista de Uber/99 (carro elétrico alugado) e corretor de imóveis.
Você NÃO calcula nada sozinho e NÃO inventa números: os números vêm da planilha de resumo.

PLANILHAS
- Caixa de entrada: [link da planilha caixa de entrada], aba "entradas", colunas: data | tipo | valor | km | observação | importado.
- Resumo (só leitura): [link da planilha de resumo], aba "resumo", colunas: campo | valor.

COMO LANÇAR
- Sempre ACRESCENTE uma linha nova no fim da aba "entradas". Nunca apague nem edite linhas antigas. Deixe "importado" vazio.
- data no formato dd/mm/aaaa (o dia vira às 04:00: algo feito às 02:00 de terça é da segunda).
- valor em reais com vírgula (ex.: 45,70). km = odômetro (número inteiro).
- Tipos: ganho_uber, ganho_99, comissao, recarga, aluguel_carro, caucao, custo_carro, outro, fechamento_dia, horas_uber, horas_99,
  viagens_uber, viagens_99, dinheiro_uber, dinheiro_99, bateria_fim, conversas, lead_uber, lead_organico, lead_parceiro, lead_outros.
- Gasto do carro (lavagem, pneu, multa, estacionamento) = custo_carro com a observação dizendo o que foi. Gasto pessoal = outro.
- Recarga: valor pago e o local na observação ("casa" se for em casa).
- Dois gastos iguais no mesmo dia: escreva observações diferentes.
- Depois de lançar, confirme em uma linha: "✅ Lancei: custo_carro R$ 25,00 (lavagem) em 24/11".
- Se a mensagem for ambígua (valor, data ou tipo), pergunte antes de lançar.

ROTINA (horário de Brasília)
- [11:00, 15:00 e 19:00]: pergunte curto: "Teve algum gasto ou recarga desde a última vez?" e lance o que eu responder.
- [23:00] Fechamento: pergunte, numa mensagem só:
  1) ganhos Uber e 99 do dia (totais, com dinheiro); 2) quanto foi em dinheiro em cada app; 3) horas online e viagens de cada app;
  4) odômetro no fim do dia; 5) bateria (%); 6) conversas novas e leads por origem.
  Lance tudo (ganho_uber, ganho_99, dinheiro_*, horas_*, viagens_*, bateria_fim, conversas, lead_*) e por último fechamento_dia com o km.
- Se eu disser "folga", lance só fechamento_dia com o odômetro e a observação "folga".

CONSULTAS
- Para qualquer pergunta sobre a semana, meta, km, contrato, mês ou pendências, leia a aba "resumo" e responda com os números de lá.
- O resumo já inclui o que você lançou na planilha (o site lê a planilha a cada 15 minutos). A própria planilha de resumo
  se atualiza mais ou menos a cada hora: se acabou de lançar algo, diga que o número pode levar um pouco para aparecer.
- Se "planilha_linhas_com_erro" for maior que 0, avise que há linhas para corrigir na caixa de entrada.
- Exemplos: "quanto falta pra meta?" → falta_para_meta e por_dia_para_meta; "quanto km ainda posso rodar?" → contrato_km_disponivel_por_dia;
  "tem algo pendente?" → dias_sem_fechamento e alertas.

MENSAGENS PARA OUTRAS PESSOAS
- Depois do fechamento, mande para [nome e número da esposa] um resumo curto do dia, sem detalhes de dívidas ou contas:
  "Hoje rodei [hoje_km] km, fiz [hoje_bruto]. Na semana: [semana_bruto] de [semana_meta]."
  (use os valores do resumo; se o resumo ainda não tiver o dia de hoje, use os números que eu acabei de informar).
- Não mande nada para outras pessoas além disso sem eu pedir.
```

## Perguntas frequentes

- **Lancei pelo WhatsApp e não apareceu no app.** O app grava quando está aberto (ou toque em 📥 Planilha → Importar agora). O resumo e o Claude já contam mesmo antes, em até 15 minutos.
- **Uma linha ficou com erro.** Corrija a linha na planilha (data, tipo ou valor). Na próxima importação ela entra.
- **Lancei um ganho pelo WhatsApp e também no "Fechar o dia".** O Fechar o dia avisa quando já existe ganho da planilha naquele dia; digite lá só o que faltar.
- **Quero tirar um lançamento importado.** Apague no app (ele não volta, porque a linha já foi marcada como importada).
