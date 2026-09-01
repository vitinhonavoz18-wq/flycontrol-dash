# Instruções para o Claude neste projeto

## Como explicar o trabalho (regra principal)

O dono deste projeto **não é programador**. Toda explicação do que foi feito
precisa ser escrita para ele entender sem conhecer código.

Regras:

1. **Português claro, sem jargão.** Se um termo técnico for inevitável,
   explique na hora, entre travessões ou parênteses. Nada de "middleware",
   "idempotência" ou "constraint" solto.

2. **Sempre com exemplo concreto do dia a dia dele.** Ele trabalha com
   restaurantes, pedidos e delivery — use isso. Exemplos bons:

   - em vez de "a validação impede requisições forjadas", escrever:
     "é como o porteiro conferir o nome na lista em vez de aceitar quem diz
     'pode deixar, eu sou convidado'";
   - em vez de "índice único no banco", escrever:
     "é como o caderno de reservas só aceitar um nome por mesa — se tentar
     escrever dois, a caneta trava";
   - em vez de "o token expira em 24h", escrever:
     "é como a senha do estacionamento: vale pelo dia, no dia seguinte não
     abre mais a cancela".

3. **Diga o efeito prático antes do detalhe técnico.** Primeiro "o cliente
   agora consegue pagar pelo celular", depois como isso foi feito.

4. **Estrutura que funciona bem:**
   - o que mudou, na prática, para quem usa o sistema;
   - por que foi feito assim (com o exemplo);
   - o que ele precisa fazer do lado dele (configurar, clicar, avisar);
   - o que ficou faltando ou merece atenção.

5. **Quando houver risco, explique o risco com exemplo**, não com o nome
   técnico da falha. "Qualquer pessoa que digitasse esse endereço entraria de
   graça, como uma porta de cinema destrancada" comunica; "ausência de
   verificação de autenticidade no retorno" não.

6. **Não esconder problema para a explicação ficar bonita.** Se algo ficou
   pela metade, está inseguro ou depende de decisão dele, isso aparece na
   explicação — em linguagem simples, mas aparece.

## Sobre o projeto

- **FlyControl** (`flycontrol-dash`) — o painel que o restaurante usa:
  pedidos, cardápio, mesas, equipe, cobrança.
- **SiteCreatorFly** (`conectfly`) — o site de pedidos que o cliente final
  acessa. São dois sistemas separados, com bancos de dados separados, que
  conversam por internet.

Dinheiro é sempre tratado em centavos inteiros — nunca com casas decimais —
para não acontecer erro de arredondamento na cobrança.

## Banco de dados

Tudo que é banco vive em `DATABASE/supabase/` — migrations, funções, gatilhos,
Edge Functions e os roteiros de reversão. Nenhum `.sql` fora dali.

A pasta `supabase` por dentro é exigência da ferramenta, não escolha: o robô
que aplica as mudanças é apontado para lá com `--workdir DATABASE`. Há testes
em `src/lib/server/databaseLayout.test.ts` que quebram se esse apontamento se
perder, porque a falha seria silenciosa.

**`DATABASE/README.md` é o mapa** — leia antes de mexer no banco. Ele explica,
entre outras coisas, por que o mesmo restaurante é chamado de cinco nomes
diferentes (`tenant_id`, `company_id`, `pizzeria_id`, `restaurant_id`,
`target_store_id`) e por que unificar isso hoje quebraria a cobrança.

Regras que não se negociam:

1. **Migration já aplicada nunca é editada nem renomeada.** Correção é arquivo
   novo, com data nova. O histórico fica.
2. **Tabela nova usa `tenant_id`** para dizer de qual restaurante é a linha.
   Nunca uma sexta variação.
3. **O código fala inglês, a explicação fala português.** Tabelas, colunas,
   funções e gatilhos em inglês (é o que 100% das tabelas já usam); comentários
   e nomes de arquivo de migration em português, porque quem lê para decidir é
   o dono do negócio.
