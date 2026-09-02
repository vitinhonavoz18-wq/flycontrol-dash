# Pasta do banco de dados

Tudo que é banco de dados mora aqui. Nenhum arquivo `.sql` fica solto na raiz
do projeto.

A divisão abaixo é por **responsabilidade**: cada pasta responde a uma
pergunta diferente, e é isso que evita alguém rodar na mão um arquivo que já
foi aplicado sozinho.

## `migrations/` — a história oficial do banco

São as mudanças de estrutura, em ordem, cada uma com data no nome. A
publicação aplica sozinha o que estiver faltando (ver
`.github/workflows/migrations.yml`).

É o livro de registro do cartório: cada folha tem data, ninguém volta atrás
para rasurar uma folha antiga, e o que vale é a ordem em que foram escritas.

**Estes arquivos ficam todos juntos, sem subpastas, de propósito.** O programa
do Supabase que aplica as migrações só enxerga arquivos diretamente dentro de
`migrations/`. Guardar um deles numa subpasta é o mesmo que tirar a folha do
livro e deixar na gaveta: ela existe, mas o cartório não a lê — e a mudança
nunca chega ao banco de produção.

## `functions/` — funções de borda (edge functions)

Pequenos programas que rodam dentro do próprio Supabase, um por pasta. São
publicados separadamente do painel.

## `scripts/` — SQL de aplicar na mão, uma vez

Correções pontuais e conserto de dados: coisas que se roda **uma vez**, no
editor de SQL do Supabase, quando for necessário. Não entram na publicação
automática.

Separados por assunto:

- `mesas/` — conserto de dados de sessões de mesa;
- `permissoes/` — regras de quem pode ler e escrever cada tabela;
- `marketing/` — o módulo de marketing juntado num arquivo só, para aplicar
  de uma vez em um banco que ainda não o tenha.

Cada arquivo aqui explica no começo o que faz e se é seguro rodar de novo.
