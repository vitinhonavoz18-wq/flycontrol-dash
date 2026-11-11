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

- **FlyDelivery** (`flycontrol-dash`) — o painel que o restaurante usa:
  pedidos, cardápio, mesas, equipe, cobrança. Chamava-se **FlyControl** até
  novembro de 2026.
- **SiteCreatorFly** (`conectfly`) — o site de pedidos que o cliente final
  acessa. São dois sistemas separados, com bancos de dados separados, que
  conversam por internet.

Dinheiro é sempre tratado em centavos inteiros — nunca com casas decimais —
para não acontecer erro de arredondamento na cobrança.

## A marca: FlyDelivery (antes FlyControl)

O produto mudou de nome. Três regras para não quebrar nada nem confundir
ninguém:

1. **Na tela, sempre FlyDelivery.** Texto novo que o lojista lê usa o nome
   novo — de preferência lendo de `src/lib/brand.ts` (`BRAND.name`) em vez de
   escrever à mão. Logotipo, só pelo componente
   `src/components/brand/BrandLogo.tsx`.

2. **Nome técnico não se renomeia.** Tabelas (`flycontrol_fiqon_logs`),
   colunas (`flycontrol_id`), variáveis do servidor (`FLYCONTROL_PUBLIC_URL`),
   endereços (`/api/public/flycontrol-table-closed`, o domínio
   `flycontrol.conectfly.com.br`) e chaves guardadas no navegador
   (`flycontrol-theme`...) continuam como estão. Outros sistemas batem nessas
   portas pelo nome antigo. O mapa completo, com o motivo de cada um, está em
   `docs/FLYDELIVERY-MIGRACAO.md`. Há teste segurando isso
   (`src/lib/brand.test.ts`).

3. **Existem dois "FlyDelivery".** O painel do restaurante (este repositório)
   e o aplicativo onde o cliente final pede (repositório `Flydelivery`).
   Quando um texto fala do aplicativo, escreva **"app FlyDelivery"**. Nos
   comentários antigos do código, "FlyControl" continua significando este
   painel — não foram reescritos para o histórico não virar um diff gigante.
