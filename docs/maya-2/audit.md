# MAYA 2.0 — Auditoria da MAYA atual (06/11/2026)

Este relatório mostra **onde a MAYA vive hoje, o que estava errado e o que foi
feito**. Está escrito para quem não é programador.

---

## 1. Onde a MAYA mora (descoberta importante)

A MAYA **não está no código do painel FlyControl**. Ela vive no **n8n** (o
"carteiro" que leva e traz mensagens), em dois fluxos:

| Canal | Fluxo no n8n | Situação |
|---|---|---|
| WhatsApp | `receber mensagens fly control` (id `NAFLlaPcRCSpLm2n`) | Ligado, mas **sem nenhuma execução registrada** — pode não estar recebendo nada |
| Instagram | `instagram mensagens - MAYA 2.0` (id `tFGrw9RxPg2OLolo`) | Ligado e funcionando (3 conversas recentes) |

O caminho de uma mensagem hoje (WhatsApp):

```
cliente → UAZAPI (aparelho do WhatsApp) → n8n → OpenAI (gpt-4.1-mini) → n8n → UAZAPI → cliente
```

Os preços e regras estavam **escritos à mão dentro do texto da MAYA**, nos dois
fluxos. O painel FlyControl não participava.

---

## 2. Problemas encontrados

Severidade: 🔴 alta (afeta dinheiro, cliente ou segurança) · 🟠 média · 🟡 baixa.

### 🔴 2.1 A MAYA anuncia preços que a cobrança não cobra

| O que a MAYA diz | O que o sistema cobra de verdade (código de cobrança) |
|---|---|
| Premium **R$ 375/mês** | Premium Mensal **R$ 89,90/mês** (R$ 375 é o preço antigo, só de quem contratou antes) |
| — (não menciona) | Premium Anual **R$ 598,80/ano** (equivale a R$ 49,90/mês) |
| CENTS **R$ 0,70**, e **R$ 0,40 ao bater 500 pedidos** | CENTS em **4 faixas por mês**: 1º–100º R$ 0,70 · 101º–250º R$ 0,60 · 251º–500º R$ 0,50 · 501º em diante R$ 0,40 — e o desconto **não volta para trás** |

**Exemplo do estrago:** um restaurante com 600 pedidos/mês ouve "R$ 0,40 por
pedido" e faz a conta: R$ 240. A fatura real vem **R$ 325**. E, pior, a MAYA
nunca ofereceria o Premium de R$ 89,90, que nesse volume sai mais barato. É
como o garçom recitar o cardápio do ano passado: o cliente pede pelo preço
velho e briga no caixa.

**Isso também responde às dúvidas comerciais** que o documento da MAYA 2.0
levantou: a meta é **por ciclo mensal**, e o desconto é **progressivo, não
retroativo** (confirmado em `src/lib/billing/centsTiers.ts`).

### 🔴 2.2 "Vou chamar um atendente" não chamava ninguém (WhatsApp)

O fluxo do WhatsApp não tem nenhum passo de transferência. A MAYA escrevia
"vou chamar um atendente", mas nada acontecia: ninguém era avisado e ela
continuava respondendo. É o garçom dizer "já chamo o gerente" e voltar para a
cozinha.

No Instagram a transferência existe (trava a MAYA por 6 horas), mas o
**e-mail da equipe está em branco** na configuração — então ela se cala e
ninguém fica sabendo que tem cliente esperando.

### 🔴 2.3 A MAYA do WhatsApp provavelmente se calava sozinha

O fluxo trava a IA por 10 minutos sempre que chega uma mensagem "enviada pelo
próprio número" — a regra serve para quando a equipe responde pelo celular.
Mas ele **não diferencia a equipe da própria MAYA**: a resposta que a MAYA
envia volta como "mensagem do próprio número" (se a UAZAPI estiver mandando
esses avisos) e trava a MAYA logo depois de ela responder. É o porteiro que se
tranca do lado de fora toda vez que abre a porta para alguém.

*(Não deu para confirmar com execuções reais porque o fluxo não tem nenhuma
registrada. O fluxo novo trata os dois casos de qualquer jeito.)*

### 🔴 2.4 Senha do aparelho do WhatsApp escrita dentro do fluxo

O token da UAZAPI (a "chave" que permite mandar mensagem pelo número da
empresa) está escrito em texto puro em 3 blocos do fluxo antigo. Qualquer
pessoa que veja ou exporte o fluxo pode mandar mensagem como se fosse a
empresa. **Recomendo trocar esse token** depois que o fluxo novo estiver no ar
(o novo guarda a chave em credencial protegida do n8n).

### 🟠 2.5 Mensagem repetida vira resposta repetida (WhatsApp)

Não há proteção contra a UAZAPI entregar a mesma mensagem duas vezes (acontece
quando a internet oscila). O cliente recebia duas respostas. O Instagram já
tinha essa proteção.

### 🟠 2.6 Chaves com nome de outro cliente

- O fluxo do WhatsApp da MAYA guarda tudo com o prefixo `farmacia_` (foi
  copiado do fluxo da Farmácia). Se as credenciais de Redis "CRM FLY CONTROL"
  e "ivaodonto" apontarem para o mesmo servidor, uma pessoa que fale com os
  dois números poderia ter a memória e a trava misturadas.
- O Instagram da MAYA usa a credencial de Redis chamada **"ivaodonto"** (nome de
  outro cliente). Vale conferir se é o servidor certo.

### 🟠 2.7 Promessas que ninguém confirmou no sistema

O texto antigo afirma como certo: "Premium tudo incluso", "não existe outra
taxa", "cardápio 100% grátis", "implementação gratuita", "cancela quando
quiser". Nada disso existe como regra no código — são combinados comerciais.
Não estão errados necessariamente, mas precisam da sua confirmação (lista no
item 5).

### 🟡 2.8 Outros detalhes

- Webhook do WhatsApp com endereço fácil de adivinhar (`/webhook/CRM FLYCONTROL`) e sem conferência de quem está chamando.
- Vídeo, documento e figurinha eram ignorados em silêncio (o cliente ficava sem resposta).
- A análise de imagem ainda perguntava sobre "receita médica ou caixa de remédio" (sobra da Farmácia).
- Nó "If1" solto no fluxo, sem uso.
- Memória de 24h no WhatsApp (o cliente que volta no dia seguinte é tratado como desconhecido).
- Prompt com ~30 mil caracteres: cada resposta paga por esse texto todo.

---

## 3. Matriz: prompt antigo × MAYA 2.0

| Item | Situação |
|---|---|
| Nome, identidade "assistente virtual", tom brasileiro natural | **Herdado** |
| Venda consultiva, uma pergunta por vez, sem gatilho falso | **Herdado e melhorado** (prioridades explícitas: humano > link > preço) |
| Público-alvo, posicionamento "centro de operações" | **Herdado** |
| Preços CENTS / Premium | **Corrigido** — agora vêm da cobrança, sozinhos |
| Premium Anual | **Novo** (existia no sistema, a MAYA não sabia) |
| Comparar planos com número | **Novo** — calculadora `simular_planos` faz a conta exata |
| Transferência para humano | **Dependente de backend** — feita de verdade pelo fluxo (trava + e-mail) |
| Agenda de demonstração | **Não existe** — a MAYA não finge agendar; transfere |
| Ticket/protocolo de suporte | **Não existe** — triagem + transferência |
| Consulta de conta/plano do cliente | **Não existe** — transfere |
| Opt-out ("não quero mais receber") | **Novo** — registrado sem prazo |
| Implementação grátis, cardápio grátis, PIX/cartão, cancelamento livre | **Não confirmado no sistema** — mantido como "informado pela empresa" |
| FlyDelivery | **Não confirmado** — sem prometer data nem recurso |

---

## 4. O que foi construído

### No painel FlyControl (este repositório)

| Arquivo | Para quê |
|---|---|
| `src/lib/maya/politicaComercial.ts` | Lê preços, faixas e teste grátis **da cobrança**; calculadora de planos |
| `src/lib/maya/prompt.ts` | O texto da MAYA 2.0, com versão (`2.0.0`) |
| `src/lib/maya/sinais.ts` | Regras fixas: pediu humano? pediu para sair? a resposta vazou algo interno? citou preço que não existe? |
| `src/lib/maya/contexto.ts` | Tranca de acesso (`MAYA_N8N_SECRET`) e hora da equipe no fuso da Bahia |
| `src/routes/api/maya.contexto.ts` | `POST /api/maya/contexto` — entrega o prompt pronto com os preços do dia |
| `src/routes/api/maya.simular-planos.ts` | `POST /api/maya/simular-planos` — a calculadora |
| `src/routes/api/maya.resposta.ts` | `POST /api/maya/resposta` — o último filtro antes do cliente |
| `src/lib/maya/maya.test.ts` | 33 testes automáticos |
| `docs/maya-2/prompt-exemplo-gerado.md` | Exemplo real do prompt que a MAYA recebe |
| `docs/maya-2/historico/` | Cópia do prompt antigo, para comparação |

Nenhuma tabela do banco foi criada ou alterada. Nenhum dado foi apagado.

### No n8n

Fluxo novo **`MAYA 2.0 — WhatsApp FlyControl (rascunho, modo sombra)`**
(id `1OAkh77fSdxz18kX`), **desligado**. Os fluxos antigos **não foram mexidos**.

---

## 5. Perguntas que só você pode responder

1. O **cardápio digital** continua grátis depois dos 30 dias, mesmo sem plano pago?
2. A **implementação gratuita** vale para todo cliente, inclusive CENTS?
3. As formas de pagamento são mesmo **PIX, débito e crédito**?
4. Existe alguma **taxa externa** (do meio de pagamento, por exemplo) que o cliente paga?
5. **Cancelamento:** sem multa e sem prazo mínimo em todos os planos (inclusive o anual)?
6. **FlyDelivery:** já está disponível? Para quem?
7. Clientes antigos que pagam **R$ 375**: a MAYA deve falar do preço novo com eles?
8. Qual **e-mail** deve receber o aviso "cliente aguardando atendente"?

Enquanto não houver resposta, a MAYA 2.0 diz "vou confirmar com a equipe" e
transfere — em vez de inventar.

---

## 6. O que NÃO foi feito (e por quê)

| Pedido da especificação | Situação |
|---|---|
| Painel MAYA (caixa de entrada, métricas, base de conhecimento) | **Não feito.** É grande e vale decidir depois de ver a MAYA 2.0 funcionando em modo sombra. Por enquanto os registros ficam no Redis (`maya_wa:log:*`, `maya_wa:sombra:*`). |
| Tabelas novas no banco (`agent_sessions`, `tool_executions`…) | **Não feito.** Sem painel para mostrar, seriam tabelas vazias. Proposta para a fase do painel. |
| Agenda de demonstração, tickets, consulta de conta | **Não existem no sistema.** A MAYA foi instruída a não fingir e a transferir. |
| Atualizar o Instagram para a 2.0 | **Não feito.** Ele já funciona; a mudança recomendada é trocar o prompt fixo pelo `/api/maya/contexto` (mesmo cérebro do WhatsApp) e preencher o e-mail da equipe. Precisa da sua autorização porque está no ar. |
| Ligar a MAYA 2.0 / publicar o painel | **Não feito, de propósito.** Depende de você (passo a passo em `README.md`). |
