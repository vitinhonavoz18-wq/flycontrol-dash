# Progresso — verificação de identidade por e-mail

> Arquivo para retomar o trabalho em outra sessão. Sempre atualizado ao fim de
> cada fase. Detalhes técnicos e decisões: `DIAGNOSTICO.md`.

## Estado atual

- **Fase atual:** 0 concluída — **parado no Portão 1** aguardando suas decisões
  (lista no fim do `DIAGNOSTICO.md`).
- **Branch:** `claude/awesome-cray-cepqyp` (aguardando decisão sobre
  `feat/verificacao-email`).
- **Decisão de arquitetura proposta:** códigos nativos do Supabase Auth; n8n só
  entrega o e-mail via Send Email Hook (Standard Webhooks) + Gmail OAuth2.

## Fase 0 — auditoria (concluída)

Feito (somente leitura):
- Repositório: stack, CI, variáveis (só nomes), fluxos de auth, telas, testes.
- Supabase (`knhenchgntttraaeewlj`): tabelas, advisors de segurança, contagens
  de `auth.users` (sem dados pessoais), gatilhos em `auth.users`, Edge
  Functions, branches (nenhuma).
- n8n: workflows (nenhum de e-mail/auth), credenciais (nenhuma Gmail OAuth2),
  nós disponíveis (Gmail 2.2, Crypto 2 com HMAC via credencial, Webhook 2.2,
  Respond to Webhook 1.5).

Não foi possível nesta fase:
- Ler a configuração de Auth do Supabase (o MCP não tem acesso a ela).
- Conferir os tipos do `@supabase/auth-js` instalado (`node_modules` ausente;
  `bun.lock` aponta 2.110.7). Fazer no início da Fase 2.

## Pendências abertas

- [ ] Receber `EMAIL_DE_TESTE` e `GMAIL_REMETENTE` (vieram em branco).
- [ ] Decidir branch de trabalho.
- [ ] Decidir ambiente de teste do Supabase.
- [ ] Decidir: confirmação antes do pagamento; incluir afiliados; SMTP reserva;
      CAPTCHA.

## Próximo passo

Fase 1 — workflow do n8n criado **inativo**, começando pelo teste da conferência
de assinatura (risco R11).
