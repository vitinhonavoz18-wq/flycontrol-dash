# MAYA 2.0 — Auditoria (06/11/2026)

> Feita lendo o código deste repositório e os fluxos do n8n de produção
> (somente leitura — **nada foi alterado no n8n, no Supabase ou no WhatsApp**).
> Nenhum segredo é reproduzido neste documento.

## Onde a MAYA vive hoje

A MAYA **não existia no código do FlyControl**. Ela mora inteira no n8n, em dois fluxos:

| Fluxo n8n | Canal | Situação |
|---|---|---|
| `receber mensagens fly control` (id `NAFLlaPcRCSpLm2n`) | WhatsApp | ativo, **0 execuções salvas** — não dá para comprovar se recebe mensagens |
| `instagram mensagens - MAYA 2.0` (id `tFGrw9RxPg2OLolo`) | Instagram Direct | ativo, com execuções hoje |

Caminho da mensagem no WhatsApp hoje:
UAZAPI → webhook público do n8n → separa texto/áudio/imagem → trava "fromMe" no Redis (10 min)
→ junta mensagens por 20 s → agente OpenAI `gpt-4.1-mini` com o prompt antigo (~25 mil
caracteres, preços escritos à mão) + memória Redis de 15 mensagens/24 h → corta a resposta em
pedaços → envia cada pedaço pela UAZAPI com 4 s de atraso. **Nada é gravado no FlyControl.**

## Achados

| # | Gravidade | O que acontece (na prática) | Evidência | Correção |
|---|---|---|---|---|
| 1 | **Crítica** | A MAYA fala preços que não existem mais. Diz "Premium R$ 375/mês" e "CENTS cai para R$ 0,40 aos 500 pedidos". A cobrança de verdade cobra **R$ 89,90** no Premium Mensal (R$ 598,80 no Anual) e o CENTS em **faixas**: 1–100 a R$ 0,70, 101–250 a R$ 0,60, 251–500 a R$ 0,50, 501+ a R$ 0,40 — o desconto vale dali para frente e zera todo mês. É o garçom recitando o cardápio do ano passado. | prompt nos dois fluxos; `src/lib/billing/plans.ts`, `src/lib/billing/centsTiers.ts` | **Feito no código:** a MAYA 2.0 lê os preços da própria cobrança (`src/lib/maya/politicaComercial.ts`) e o conferente bloqueia qualquer "R$" que não seja um valor oficial. |
| 2 | **Crítica** | O site também diverge: a página inicial e `/plans` dizem "ao passar de 500 pedidos, cai para R$ 0,45 no mês seguinte". A cobrança (CENTS v2) não faz isso. São **três versões** do mesmo preço: MAYA, site e fatura. | `src/components/landing/PricingSection.tsx:89`, `src/routes/plans.tsx`, `src/routes/signup.tsx:600` usam `promotionalOrderUnitPriceCents = 45`; `billingEngine.ts:256` diz que essa regra não existe nas faixas | **Pendente — decisão do dono** (é texto comercial do site; não mexi). |
| 3 | **Crítica** | O endereço que recebe as mensagens da MAYA no WhatsApp é **público e sem senha**, com nome fácil de adivinhar (`/webhook/CRM FLYCONTROL`). Quem descobrir pode mandar um pedido falso e fazer a MAYA enviar mensagem, **do número do FlyControl**, para qualquer telefone — gasto de OpenAI e risco de o WhatsApp bloquear o número. É uma porta de serviço destrancada. | nó `Webhook Recebe`: "No credentials required" | **Feito no código:** as rotas novas exigem `MAYA_N8N_SECRET`. **Pendente no n8n:** o fluxo novo deve usar endereço com sufixo aleatório (como o da Farmácia já faz). |
| 4 | **Crítica** | A chave da UAZAPI está escrita em texto aberto em 3 nós do fluxo do WhatsApp (não está no GitHub). Qualquer pessoa com acesso ao n8n ou a uma exportação do fluxo vê a chave do aparelho. | nós `pegar audio url1`, `get image1`, `uazapi enviar1` | **Pendente:** mover para uma credencial do n8n e, depois, gerar chave nova na UAZAPI. |
| 5 | **Alta** | **Transferência de mentira no WhatsApp.** O prompt manda dizer "vou chamar um atendente", mas o fluxo não tem nenhum passo que trave a IA ou avise a equipe. O cliente espera alguém que não vem. | conexões do fluxo: nenhuma saída depois do agente além do envio | **Feito no código:** transferência real (trava a IA por 12 h, grava evento, devolve `avisar_equipe`). Inclui o caso em que a IA só *anuncia* a transferência. |
| 6 | **Alta** | No Instagram a transferência trava a MAYA, mas **ninguém é avisado**: o campo `emailEquipe` está vazio, então o passo "Avisar Equipe por E-mail" nunca roda. | nó `Configurações`: `emailEquipe = ""` | **Pendente no n8n:** preencher o e-mail da equipe (1 minuto). |
| 7 | **Alta** | Mensagens repetidas não são barradas no WhatsApp: se a UAZAPI reenviar o mesmo aviso, a MAYA responde duas vezes. | fluxo sem checagem de `messageid` | **Feito:** número da mensagem é único no banco; turno e resposta também não se repetem. |
| 8 | **Alta** | A pausa quando a equipe responde dura só **10 minutos**. Numa conversa humana mais longa, a MAYA volta a falar no meio. | `intervenção (fromMe)1`: TTL 600 s | **Feito:** 6 h quando a equipe digita, 12 h numa transferência, e `#maya` devolve na hora. |
| 9 | **Alta** | Possível "IA que se cala sozinha": se o aparelho do FlyControl não estiver configurado para esconder o que o próprio sistema enviou, cada resposta da MAYA volta como "enviada por mim" e trava a própria MAYA por 10 min. Não consegui comprovar (o fluxo não guarda execuções). | `uazapi.ts:configurarWebhook` resolve isso nas lojas com `wasSentByApi`; a instância do FlyControl não passa por esse código | **Feito:** a MAYA 2.0 reconhece o próprio eco (marca `wasSentByApi` **e** texto igual ao que ela enviou nos últimos 5 min). |
| 10 | **Média** | Memória e travas usam a chave `farmacia_<telefone>`, copiada do fluxo da Farmácia Preço Bom (que usa o mesmo formato). As credenciais têm nomes diferentes (`CRM FLY CONTROL` x `ivaodonto`); **se** apontarem para o mesmo servidor Redis, quem falar com as duas empresas mistura as conversas. Não consigo ver o servidor de cada credencial. | nós Redis dos dois fluxos | **Feito:** MAYA 2.0 não usa Redis; histórico separado por canal + telefone no banco do FlyControl. **Confirmar** no n8n. |
| 11 | **Média** | O Instagram guarda dados de leads do FlyControl numa credencial Redis chamada `ivaodonto` (nome de outro cliente). | nós Redis do fluxo do Instagram | **Confirmar** de quem é esse servidor. |
| 12 | **Média** | Assinatura da Meta no Instagram em modo `avisar`: pedido com assinatura inválida é processado mesmo assim. | `Configurações.modoAssinatura = avisar` | **Pendente:** trocar para `bloquear` depois de conferir que a assinatura válida está chegando. |
| 13 | **Média** | Leitura de imagem com instrução de farmácia ("se parecer uma receita médica... leia o nome do medicamento"). | nó `Analyze image1` | Fluxo novo usa instrução própria. |
| 14 | **Média** | Leads não ficam em lugar nenhum: o que o cliente conta some do Redis em 24 h. | `memoria1`: TTL 86 400 s | **Feito:** ficha do lead em `maya_conversas.ficha` (só campos permitidos). |
| 15 | **Baixa** | Resposta cortada em vários balões com 4 s entre eles; mensagens de grupo não são filtradas; não existe histórico de execuções para investigar reclamação. | `dividir mensagens1`, `uazapi enviar1` | **Feito:** uma mensagem por resposta, grupos ignorados, cada turno registrado. |

## Prompt antigo × MAYA 2.0

| Item | Situação |
|---|---|
| Identidade "MAYA, do FlyControl", transparência de ser IA | **Herdado** e reforçado (apresenta-se uma vez; sistema sabe se já se apresentou) |
| Tom brasileiro, mensagens curtas, uma pergunta por vez | **Herdado**, condensado |
| Venda consultiva, gatilhos éticos, proibição de escassez falsa | **Herdado** |
| Preços e condições | **Melhorado**: saem da cobrança; antes estavam errados |
| Comparação CENTS × Premium | **Melhorado**: conta feita pelo servidor (Premium compensa a partir de **134 pedidos/mês**), a IA só lê a tabela |
| "Vou chamar um atendente" | **Dependente de backend → feito** (transferência real) |
| Agenda de demonstração | **Dependente de backend → não existe**: a IA não oferece horários; registra o pedido e a equipe confirma |
| Abrir chamado / protocolo | **Não existe**: proibido inventar protocolo (o conferente bloqueia) |
| Consultar conta/plano do cliente | **Não existe** na MAYA: vai para a equipe |
| Cardápio grátis, implementação grátis, PIX/crédito/débito, cancelar quando quiser, horário 7h–23h, demo 30 min, FlyDelivery | **Não confirmado pelo sistema** — mantido porque o dono afirmou; marcado como `origem: "dono"` |

## Dúvidas comerciais (o dono precisa responder)

1. **Qual preço do CENTS vale?** A cobrança usa faixas que zeram todo mês; o site promete R$ 0,45 no mês seguinte aos 500 pedidos. A MAYA 2.0 fala o que a cobrança faz. O site precisa ser corrigido (ou a cobrança, se a intenção era outra).
2. **Os 30 dias grátis valem também para quem escolhe o Premium direto?** No código, o teste nasce no CENTS.
3. **Cartão de débito** é aceito? O código da InfinityPay só mostra evidência de PIX e cartão.
4. **Cardápio "100% grátis"** é para sempre ou durante o teste?
5. **FlyDelivery**: o que pode ser dito hoje?
6. **Clientes antigos a R$ 375**: devem ser avisados do preço novo? A MAYA não fala disso.

## O que não foi feito (e por quê)

- **Nada em produção foi alterado** — nem o n8n, nem o banco, nem variáveis do Cloudflare. A especificação proíbe sem autorização.
- **Painel da MAYA (Fase 4)** — não construído. As tabelas já guardam os dados que o painel vai mostrar (turnos, transferências, alertas, latência).
- **Agenda, chamados, consulta de conta** — não existem no backend; a MAYA 2.0 diz a verdade ("a equipe confirma") em vez de fingir.
- **Instagram** — a MAYA 2.0 está pronta para o canal (`canal: "instagram"`), mas a ligação foi pensada primeiro para o WhatsApp.
