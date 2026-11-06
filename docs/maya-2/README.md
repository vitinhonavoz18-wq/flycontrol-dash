# MAYA 2.0 — como funciona, como ligar e como desligar

Auditoria completa e achados: [`audit.md`](./audit.md).

## Em uma frase

O n8n continua sendo o **carteiro** (recebe do WhatsApp, chama a OpenAI com a credencial que já
tem, entrega a resposta). Quem **decide** agora é o FlyControl: se a MAYA deve falar, o que ela
sabe, quais preços pode dizer, e se a resposta dela está segura para sair.

## O caminho de uma mensagem

```
WhatsApp → UAZAPI → n8n ──► POST /api/maya/entrada   (repetida? eco? equipe assumiu? pediu pessoa? pediu para parar?)
                     │        └─ "aguardar 8 s"  (junta mensagens picadas)
                     ├──► POST /api/maya/turno     (é a última? equipe assumiu na espera? monta instruções + conversa)
                     │        └─ "chamar_ia"
                     ├──► OpenAI (no n8n, resposta em JSON)
                     ├──► POST /api/maya/resposta  (confere: preço oficial? fingiu agendar? vazou instrução? prometeu chamar alguém?)
                     │        └─ "enviar" + "avisar_equipe"
                     └──► UAZAPI envia  /  avisa a equipe
```

| Peça | Arquivo | Para que serve |
|---|---|---|
| Preços e condições | `src/lib/maya/politicaComercial.ts` | Lê da cobrança real. Separa o que o sistema confirma do que só o dono afirmou. Faz as contas de comparação. |
| Sinais garantidos | `src/lib/maya/sinais.ts` | "Quero uma pessoa", "para de mandar", "ignore suas regras", cancelamento, irritação, volume de pedidos. |
| Porteiro | `src/lib/maya/decisao.ts` | Decide se a MAYA fala, cala, transfere ou registra opt-out. |
| Instruções versionadas | `src/lib/maya/prompt.ts` | O prompt da MAYA 2.0 (`maya-2.0.0`). Preço nunca é digitado aqui. |
| Conferente | `src/lib/maya/saida.ts` | Nada da IA vai ao cliente sem passar aqui. |
| Maestro | `src/lib/maya/orquestrador.ts` | Liga tudo e registra cada passo. |
| Banco | `src/lib/maya/repositorioSupabase.ts` + `docs/maya-2/APLICAR-NO-SUPABASE-maya-2.sql` | 4 tabelas novas `maya_*`. |
| Porta + interruptor | `src/lib/maya/portaria.ts` | Chave `MAYA_N8N_SECRET` e modo `MAYA_V2_MODO`. |
| Rotas | `src/routes/api/maya.entrada.ts`, `maya.turno.ts`, `maya.resposta.ts` | Os três endereços que o n8n chama. |

## O interruptor: `MAYA_V2_MODO`

| Valor | O que acontece |
|---|---|
| *(vazio)* ou `desligado` | **Padrão.** As rotas respondem "desligado" e não tocam no banco. Publicar este código não muda nada para ninguém. |
| `sombra` | Tudo roda e é registrado, mas **nada é enviado ao cliente** (`enviar` vem vazio; o texto vai em `seria_enviado`). A MAYA antiga continua atendendo. Serve para comparar. |
| `ativo` | A MAYA 2.0 responde de verdade. |

**Desligar em emergência:** trocar `MAYA_V2_MODO` para `desligado` no Cloudflare. Vale em
segundos, sem publicar nada. O fluxo antigo do n8n não foi apagado e pode ser reativado.

## Passo a passo para ligar (só com a sua autorização)

1. **Banco.** Supabase → SQL Editor → colar `docs/maya-2/APLICAR-NO-SUPABASE-maya-2.sql` → Run.
   Só cria tabelas novas. (Testado num Postgres local: aplica duas vezes sem erro; visitante não
   lê nada; o arquivo de desfazer funciona.)
2. **Variáveis no Cloudflare** (Workers → `flycontrol-dash` → Settings → Variables):
   - `MAYA_N8N_SECRET` = uma senha longa e aleatória (tipo "Secret", nunca texto comum);
   - `MAYA_V2_MODO` = `sombra`.
3. **Publicar o código** (juntar o PR na `main`; o `deploy.yml` publica).
4. **Fluxo novo no n8n** — `MAYA 2.0 — WhatsApp` (posso montar e validar pelo n8n quando
   você autorizar; ele nasce **desligado**). Ele faz:
   1. Webhook com endereço **aleatório** (não `CRM FLYCONTROL`);
   2. se for áudio/imagem: transcreve/descreve com a OpenAI e põe o resultado no campo `texto`;
   3. `POST /api/maya/entrada` com o evento cru da UAZAPI + `Authorization: Bearer <MAYA_N8N_SECRET>`;
   4. se `acao = aguardar`: espera `aguardar_segundos`, chama `/api/maya/turno` com `mensagem_id`;
   5. se `acao = chamar_ia`: chama a OpenAI com `prompt_sistema` (mensagem de sistema) +
      `mensagens`, pedindo **resposta em JSON**; se der erro, segue com `saida: null`;
   6. `POST /api/maya/resposta` com `turno_id` e `saida`;
   7. para cada texto em `enviar`: UAZAPI `/send/text` (chave numa **credencial** do n8n, não no nó);
   8. se vier `avisar_equipe`: avisar a equipe (e-mail ou WhatsApp do responsável).
5. **Sombra por alguns dias**: o fluxo antigo continua respondendo; o novo recebe uma cópia das
   mensagens e só registra. Compare em `maya_turnos` (o que a 2.0 teria dito, alertas do
   conferente, transferências).
6. **Ativar**: apontar a UAZAPI para o fluxo novo, desativar o antigo, `MAYA_V2_MODO = ativo`.

## Como a equipe usa no dia a dia

- **Respondeu pelo celular/WhatsApp Web?** A MAYA fica quieta naquela conversa por 6 horas.
- **Quer devolver para a MAYA antes disso?** Digite `#maya` na conversa.
- **Cliente pediu uma pessoa** (ou a MAYA decidiu transferir): ela avisa o cliente, fica quieta
  por 12 horas e o fluxo avisa a equipe com nome, telefone, última mensagem e o que já se sabe do lead.
- **Fora do horário (23h–7h)**: a MAYA diz que a equipe atende das 7h às 23h e deixa encaminhado.

## O que fica registrado (e o que não fica)

- `maya_turnos`: versão das instruções, versão dos preços, intenção, próxima ação, se o
  conferente trocou a resposta e por quê, tempo de resposta.
- `maya_eventos`: transferências, pausas, opt-outs, respostas bloqueadas, proteção anti-loop.
- O texto das conversas fica em `maya_mensagens`. **Não fica:** chave, token, senha.
- Só o servidor e o super_admin leem essas tabelas.

## Testes

```bash
npx vitest run src/lib/maya
```

64 testes cobrindo os cenários 1–17 da especificação que dependem desta parte (ver nomes `C1`…`C17`
nos arquivos `*.test.ts`). O cenário 18 (painel) depende do painel, que ainda não existe.

## Limites atuais (honestos)

- A MAYA 2.0 **não agenda** reunião, **não abre** chamado e **não consulta** a conta do cliente:
  esses sistemas não existem. Ela encaminha para a equipe e diz isso ao cliente.
- O conferente bloqueia valores em reais fora da lista oficial. Se a IA fizer uma conta que não
  está na tabela do sistema, a resposta é trocada por uma segura e a equipe é chamada — melhor que
  arriscar um preço errado.
- Detecção de "quero falar com uma pessoa" e "para de mandar" é por frases comuns; formas muito
  diferentes ficam por conta da IA (que também está instruída a transferir).
- Ainda falta o painel (visão geral, conversas, regras comerciais editáveis).
