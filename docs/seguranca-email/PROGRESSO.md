# Progresso — verificação de identidade por e-mail

> Arquivo para retomar o trabalho em outra sessão. Sempre atualizado ao fim de
> cada fase. Detalhes técnicos e decisões: `DIAGNOSTICO.md`.
> Passo a passo das credenciais: `CONFIGURAR-N8N.md`.

## Estado atual

- **Fase atual:** 1 concluída (workflow do n8n criado **inativo** e testado com
  dados fictícios). Aguardando o dono configurar as credenciais.
- **Branch:** `claude/awesome-cray-cepqyp` (aguardando decisão sobre
  `feat/verificacao-email`).
- **Decisão de arquitetura:** códigos nativos do Supabase Auth; n8n só entrega
  o e-mail via Send Email Hook (Standard Webhooks) + Gmail OAuth2.

## Fase 0 — auditoria (concluída)

Ver `DIAGNOSTICO.md`. Portão 1: o dono autorizou criar o fluxo do n8n ("crie o
fluxo onde eu só troco as credenciais"). As demais decisões do Portão 1
(branch, ambiente de teste, confirmação antes do pagamento, afiliados) seguem
pendentes.

## Fase 1 — workflow do n8n (concluída, inativo)

### O que foi criado

| Workflow | ID | Estado |
|---|---|---|
| `FLYCONTROL - SEGURANÇA - ENVIO DE CÓDIGO POR E-MAIL` | `ctoLCD4GYDi05hKJ` | **inativo** |
| `FLYCONTROL - SEGURANÇA - GERAR SEGREDO DO HOOK (usar 1 vez)` | `o8C4QtmPqvWYbRDh` | inativo (é manual) |

URL de produção do webhook (só funciona depois de ativar):
`https://conectfly-n8n.lnuwza.easypanel.host/webhook/flycontrol-seguranca-email-44dd023750f6`

Nós do fluxo principal, em ordem:
1. **Receber pedido do Supabase** — Webhook POST, corpo bruto ligado, responde
   pelos nós "Responder".
2. **Conferir formato e horário** — exige `webhook-id`, `webhook-timestamp` e
   `webhook-signature`; horário com no máximo 5 min de diferença; corpo até
   20 KB; recusa `webhook-id` já atendido (anti-repetição, guardado só o ID e a
   hora, por 15 min).
3. **Formato e horário válidos?** — não → 401.
4. **Calcular assinatura (HMAC)** — nó Crypto, HMAC-SHA256 em base64 de
   `id.timestamp.corpo`, segredo na **credencial Crypto** (nunca no workflow).
5. **Comparar assinatura e ler pedido** — comparação em tempo constante; só
   aceita `signup`, `recovery`, `reauthentication`, `email_change`,
   `password_changed_notification`, `email_changed_notification`; valida e-mail
   e código (6 a 10 dígitos). Troca de e-mail com "Secure email change" gera
   dois envios (endereço atual recebe `token`, novo recebe `token_new`, como
   manda a documentação do Supabase).
6. **Resultado da conferência** — ok → envio; assinatura inválida → 401; resto
   → 400.
7. **Montar e-mail (HTML e texto puro)** — MIME `multipart/alternative`, estilos
   inline, textos combinados com o dono.
8. **Enviar pelo Gmail** — HTTP Request na API do Gmail com a **credencial
   Gmail OAuth2** (o nó Gmail nativo não envia versão em texto puro junto com o
   HTML). Limite de 3,5 s.
9. **Conferir envio e registrar** — todos os envios com status 2xx? Registra o
   `webhook-id` para anti-repetição.
10. **Enviado com sucesso?** — sim → 200 `{}`; não → 503 com `retry-after`
    (o Supabase tenta de novo dentro do prazo de 5 s).

Configurações do workflow: salvamento de execuções **desligado** (sucesso,
erro, manuais e progresso), tempo máximo 15 s.

### Testes executados (todos com dados fictícios; Gmail e HMAC simulados)

| Caso | Esperado | Resultado |
|---|---|---|
| Recuperação válida | e-mail montado + 200 | ✅ execução 197179; MIME decodificado e conferido (assunto, acentos, HTML e texto puro) |
| Assinatura errada | 401, Gmail não chamado | ✅ 197187 |
| Horário de 10 min atrás (replay) | 401 na primeira barreira | ✅ 197189 |
| Tipo não permitido (`magiclink`) | 400 | ✅ 197192 |
| Troca de e-mail (dois códigos) | 2 e-mails + 200 | ✅ 197195 (atual recebe `111222`, novo recebe `333444`) |
| Código malformado (`<script>`) | 400 | ✅ 197197 |
| Gmail devolve erro 500 | 503 | ✅ 197198 |
| Histórico desligado | execução não aparece | ✅ 197200 e 197173 "not found" |

Durante os testes o histórico ficou ligado temporariamente para conferir o
caminho de cada caso; as execuções 197179–197198 guardam apenas dados
fictícios. O histórico foi desligado de novo e conferido.

Prévia do e-mail: `previa-email-recuperacao.png`.

### Descobertas

- O nó **Code** desta instância **não** tem `require('crypto')` nem
  `crypto.getRandomValues` (sandbox fechado). Por isso o HMAC fica no nó
  Crypto e o gerador de segredo usa o nó Crypto (ação "generate"). `Buffer`
  funciona.
- O n8n **preenche sozinho** o nó de HMAC com a credencial Crypto que já
  existir — no caso, "Meta App Secret (Crypto)", que não tem relação com isto.
  Não há como deixar vazio pelo MCP. **Efeito:** com o segredo errado toda
  assinatura dá inválida e nada é enviado (falha segura). **O dono precisa
  trocar** para a credencial certa (ver `CONFIGURAR-N8N.md`).
- Ao refazer o corpo a partir do JSON já interpretado, o n8n reordena as chaves;
  por isso a conferência depende do **corpo bruto** (opção "Raw Body" ligada).
  Se o corpo bruto não chegar, a assinatura falha (falha segura).

### Pendente nesta fase (precisa de credenciais reais)

- [ ] Teste real do nó Crypto com a credencial certa (o teste pelo MCP sempre
      simula nós com credencial). Será feito na Fase 6 com um pedido real do
      Supabase.
- [ ] Teste real do envio pelo Gmail (Portão 4: só para o e-mail de teste).
- [ ] Teste da anti-repetição (só funciona com o workflow ativo; testes manuais
      não guardam memória entre execuções).
- [ ] Confirmar no Supabase se o campo do segredo do hook aceita colar um
      segredo próprio (formato `v1,whsec_…`). Se não aceitar, usar a API de
      gerenciamento do Supabase.

## Pendências abertas

- [ ] Dono: criar credenciais (Crypto e Gmail OAuth2) — `CONFIGURAR-N8N.md`.
- [ ] Receber `EMAIL_DE_TESTE` e `GMAIL_REMETENTE` (vieram em branco).
- [ ] Decidir branch de trabalho.
- [ ] Decidir ambiente de teste do Supabase.
- [ ] Decidir: confirmação antes do pagamento; incluir afiliados; SMTP reserva;
      CAPTCHA.

## Próximo passo

Fase 2 — recuperação de senha no painel (`/login` → e-mail → código → nova
senha), que não depende das credenciais para ser construída e testada.
