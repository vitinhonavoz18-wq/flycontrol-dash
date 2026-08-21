# Auditoria do vídeo "3 coisas antes de subir seu site" + mapa do assunto

Vídeo analisado: reel vertical de 36 segundos, perfil `@ambrosiomkt`
(nicho: criação de site com IA / marketing).
Arquivo: `ANTES_DE_SUBIR_SEU_SITE_FAÇA_ISSO...mp4`.

---

## 1. O que o vídeo diz (transcrição resumida)

Legenda de abertura na tela: **"Pega o hábito de fazer essas 3 coisas antes de
subir seu site"**. Depois disso o vídeo é só fala, sem legenda.

Fala, em ordem:

1. **Sobe o `sitemap.xml`.** "Sem isso o Google demora muito mais para achar a
   sua página ou a página do seu cliente."
2. **Configura o `robots.txt`.** "Sem isso qualquer robô vai conseguir
   rastrear páginas que não deveriam estar aparecendo."
3. **Abre o site no celular.** "Seu projeto pode estar lindo no computador,
   mas quando você leva para a tela pequena aparece tudo quebrado."

Fechamento: "sobe o sitemap, ajusta o robots e testa no celular" + chamada
para seguir o perfil.

### Traduzindo os três termos

- **`sitemap.xml`** — é o **cardápio entregue na mão do Google**. Em vez do
  Google ficar andando pelo salão tentando adivinhar quais pratos existem,
  você entrega a lista pronta: "essas são todas as páginas, essa aqui mudou
  ontem, essa é a mais importante".
- **`robots.txt`** — é o **aviso na porta da cozinha: "só funcionários"**. É
  um bilhete pedindo educadamente que os robôs de busca não entrem em certas
  áreas. Importante: é um pedido, não uma tranca.
- **Testar no celular** — é **provar o prato antes de mandar pro salão**. O
  restaurante inteiro vê o cardápio pelo celular; se quebra lá, quebrou para
  todo mundo.

---

## 2. Auditoria: o que está certo, o que está incompleto, o que falta

### 2.1 Está correto

| Ponto | Veredito |
|---|---|
| Sitemap acelera a indexação | ✅ Verdade. Ajuda principalmente site novo, sem links apontando para ele — que é exatamente o caso de todo site de restaurante recém-criado. |
| Testar no celular antes de publicar | ✅ Verdade, e é o conselho mais valioso dos três. O Google avalia a versão mobile do site em primeiro lugar, e no delivery praticamente todo pedido nasce no celular. |
| Postura de "vira hábito, checklist antes de publicar" | ✅ Correto. O erro caro não é não saber, é publicar sem conferir. |

### 2.2 Está incompleto ou impreciso

**a) O erro mais grave do vídeo: o que o `robots.txt` realmente faz.**

O vídeo diz que sem `robots.txt` "qualquer bot vai conseguir rastrear páginas
que não deveriam aparecer". Isso passa a ideia errada de que o `robots.txt`
**protege** página. Ele não protege nada.

> É como pendurar uma plaquinha "não entre" numa porta **destrancada**. O
> Google respeita a plaquinha. Um robô mal-intencionado lê a plaquinha,
> descobre exatamente onde é a sala que você quer esconder, e entra assim
> mesmo.

Pior: o `robots.txt` é público — qualquer pessoa abre `seusite.com/robots.txt`
e lê a lista. Se você escrever ali `/admin-secreto`, você acabou de **publicar
o endereço da sua porta dos fundos**.

O que protege de verdade é **login e permissão no servidor** (a tranca), e o
que tira do Google é a etiqueta `noindex` na página. O `robots.txt` só
organiza o trânsito dos robôs bem-comportados.

**b) Ele não diferencia site que quer aparecer de sistema que não quer.**

O conselho é dado como se todo site fosse igual. Não é. Um painel de gestão
(como o FlyControl) **não deve aparecer no Google de jeito nenhum** — e para
esse caso o roteiro correto é quase o inverso do vídeo. Isso é o ponto mais
importante para os nossos projetos e está detalhado na seção 3.

**c) Faltou o passo que amarra tudo: registrar no Google Search Console.**

Subir o arquivo `sitemap.xml` e não avisar o Google é como imprimir o cardápio
e deixar ele na gaveta. O Search Console é onde você entrega o cardápio, vê se
o Google aceitou, e descobre se alguma página foi recusada — é a única forma
de saber se funcionou.

**d) "Testar no celular" ficou vago demais.**

Abrir no seu iPhone não é teste. O que quebra na prática é: tela pequena de
Android antigo, teclado que sobe e tampa o botão de finalizar pedido, botão
pequeno demais para o dedo, e a barra do navegador que come o rodapé.

### 2.3 O que o vídeo não citou e é tão ou mais importante

Para um site que **vende** (que é o nosso caso: site de pedidos), faltou:

1. **Velocidade de carregamento.** Site lento perde pedido antes de mostrar o
   cardápio. É o cliente que desiste na fila da porta.
2. **Título e descrição de cada página** (o que aparece escrito no resultado
   do Google) e a **imagem de preview** (o que aparece quando o link é colado
   no WhatsApp). No delivery, o link vai muito mais pro WhatsApp e pro
   Instagram do que pro Google.
3. **Dados estruturados de restaurante** — a ficha técnica que faz o Google
   mostrar endereço, horário de funcionamento e faixa de preço direto na
   busca.
4. **Endereço único de cada página (canonical).** Sem isso o Google pode achar
   que `site.com`, `www.site.com` e `site.com/?fbclid=123` são três
   restaurantes diferentes e dividir a nota entre eles.
5. **HTTPS e redirecionamento.** Sem cadeado, o navegador avisa "site não
   seguro" bem na hora de pagar.
6. **Página de erro decente e monitoramento.** Saber que caiu antes do cliente
   ligar reclamando.
7. **Consentimento de cookies / LGPD**, se houver pixel de rastreamento.

### 2.4 Nota final do conteúdo

**7/10 como conteúdo de rede social.** Os três itens são reais, a ordem é boa
e o formato de checklist funciona. Perde pontos por tratar `robots.txt` como
mecanismo de segurança e por não distinguir site de vitrine de sistema
interno — um iniciante que seguir o vídeo ao pé da letra pode achar que
"escondeu" uma área administrativa que na verdade continua aberta.

---

## 3. Mapa do assunto aplicado aos nossos projetos

O assunto do vídeo se chama, no nosso contexto, **"checklist de publicação"**.
Ele se divide em cinco blocos. Cada bloco vale de um jeito diferente para cada
um dos dois sistemas.

Lembrando a diferença entre eles:

- **FlyControl (`flycontrol-dash`)** — o painel do restaurante. Tem uma parte
  pública pequena (a página de venda, planos, termos, login) e uma parte
  gigante privada (pedidos, cardápio, mesas, equipe, cobrança).
- **SiteCreatorFly (`conectfly`)** — o site de pedidos do cliente final. Aqui
  aparecer no Google **é o produto**.

### Bloco 1 — Ser encontrado (sitemap)

| | FlyControl | SiteCreatorFly |
|---|---|---|
| Vale? | Só para as páginas públicas de venda | **Sim, é o coração** |
| O que fazer | Um `sitemap.xml` curto listando apenas `/`, `/plans`, `/terms`, `/privacy` | Um sitemap **por restaurante**, gerado sozinho, com a home e cada categoria/prato |
| Cuidado | Nunca listar rota de painel, API ou impressão | Precisa se atualizar quando o cardápio muda — sitemap velho é cardápio desatualizado |

> Como cada site do SiteCreatorFly tem cardápio próprio e muda toda semana,
> sitemap escrito à mão não serve. Ele tem que ser **gerado na hora**, lendo o
> cardápio do banco — igual ao cardápio impresso do dia, não o plastificado de
> três anos atrás.

### Bloco 2 — Controlar quem entra (robots + noindex + tranca de verdade)

Três camadas diferentes, que o vídeo mistura numa só:

1. **A tranca (autenticação e permissão)** — sem login, não passa. É a única
   coisa que realmente protege. Já existe hoje nos dois sistemas.
2. **A etiqueta `noindex`** — diz ao Google "essa página existe, mas não
   coloca na lista". É o que tira uma página do resultado de busca.
3. **O `robots.txt`** — organiza o trânsito de robôs e aponta onde está o
   sitemap.

| | FlyControl | SiteCreatorFly |
|---|---|---|
| `robots.txt` | Liberar só as páginas de venda; bloquear o resto | Liberar o site inteiro do restaurante; bloquear carrinho, checkout e acompanhamento de pedido |
| `noindex` | **Obrigatório** em tudo que é painel, login, pagamento, impressão e API | Em página de pedido em andamento e comprovante |
| Tranca | Já existe — não mexer, só não confiar no robots.txt no lugar dela | Idem |

> ⚠️ Ponto de atenção real: se o painel do FlyControl for indexado, uma busca
> no Google pode acabar mostrando títulos de páginas internas e o endereço do
> painel do restaurante. Não vaza pedido nem dinheiro (a tranca segura), mas é
> um convite desnecessário para quem procura sistema para atacar.

### Bloco 3 — Funcionar no celular

Igual e obrigatório nos dois. Diferença: no FlyControl o celular é a
**ferramenta de trabalho** (o dono conferindo pedido no balcão, o garçom na
mesa); no SiteCreatorFly o celular é **onde o dinheiro entra**.

O teste mínimo, sempre nessa ordem:

1. Tela pequena (360px de largura — Android popular), não só iPhone novo.
2. Fluxo completo de ponta a ponta: entrar → escolher prato → adicionar →
   finalizar → pagar.
3. Com o teclado aberto: o botão principal continua visível?
4. Com o dedo, não com o mouse: o botão tem tamanho de dedo (mínimo ~44px)?
5. Girar a tela (deitado) sem quebrar.
6. Conexão ruim: 3G lento, para ver o que aparece antes de tudo carregar.

### Bloco 4 — Aparecer bonito quando compartilham o link

Bloco que o vídeo esqueceu e que, no delivery, vale mais que o Google:

- título e descrição por página;
- imagem de preview do WhatsApp/Instagram — hoje o FlyControl usa uma imagem
  hospedada num endereço temporário de preview (`...lovable.app...` no R2).
  Isso é uma **imagem emprestada**: se aquele endereço sair do ar, todo link
  compartilhado do FlyControl passa a aparecer sem imagem;
- no SiteCreatorFly, a imagem de preview deveria ser **a logo do restaurante**,
  não a nossa.

### Bloco 5 — Confiança e velocidade

- HTTPS obrigatório com redirecionamento (já vem do Cloudflare);
- endereço canônico único por página;
- ficha de restaurante (dados estruturados) no SiteCreatorFly: endereço,
  telefone, horário, faixa de preço, avaliações;
- tempo de carregamento medido no celular, não no computador;
- página de erro amigável (já existe nos dois) e monitoramento de queda.

---

## 4. O que encontramos hoje no FlyControl (diagnóstico do repositório)

Levantamento feito no código atual, sem alterar nada:

| Item | Situação hoje |
|---|---|
| `robots.txt` | ❌ **Não existe** nenhum arquivo no projeto |
| `sitemap.xml` | ❌ **Não existe** |
| `noindex` nas rotas de painel | ❌ Não existe — nada impede o Google de indexar o painel |
| Tag de tela (`viewport`) | ✅ Configurada corretamente, inclusive com `viewport-fit=cover` para o iPhone com notch |
| Título e descrição | ✅ Existem, mas são **os mesmos em todas as páginas** — o Google vê o painel de pedidos com o mesmo título da página de venda |
| Imagem de preview (WhatsApp) | ⚠️ Aponta para um endereço temporário de preview externo — risco de sumir |
| Endereço canônico | ❌ Não configurado |
| HTTPS | ✅ Garantido pela Cloudflare |
| Página 404 e página de erro | ✅ Existem e estão em português |

Nada disso quebra o sistema hoje. É risco de imagem e de descoberta, não de
funcionamento.

---

## 5. Plano de implementação sugerido (em ordem de importância)

### Prioridade alta — fazer antes do próximo lançamento

1. **`robots.txt` no FlyControl** liberando só as páginas de venda e apontando
   o sitemap.
2. **`noindex` em todas as rotas privadas** do FlyControl (painel, login,
   pagamento, impressão, portal do garçom, API). Essa é a que realmente tira
   o painel do Google.
3. **Título e descrição próprios por página** — pelo menos separar "página de
   venda" de "painel".
4. **Imagem de preview própria**, hospedada no nosso domínio, no lugar do
   endereço temporário.

### Prioridade média — junto com o SiteCreatorFly

5. **`sitemap.xml` gerado automaticamente por restaurante** no SiteCreatorFly,
   lendo o cardápio do banco.
6. **`robots.txt` por restaurante** no SiteCreatorFly, apontando para o
   sitemap daquele restaurante.
7. **Ficha de restaurante (dados estruturados)** nas páginas de cardápio.
8. **Endereço canônico** nos dois sistemas.

### Prioridade baixa — melhoria contínua

9. Roteiro fixo de teste no celular, escrito, rodado antes de cada publicação.
10. Registro dos dois domínios no Google Search Console.
11. Medição de velocidade no celular.

---

## 6. O que depende de decisão do dono

- **Domínio de cada site do SiteCreatorFly:** o restaurante vai ter domínio
  próprio (`pizzariadojoao.com.br`) ou vai ser um endereço dentro do nosso
  (`pizzariadojoao.conectfly.com.br`)? A resposta muda como o sitemap e o
  canônico são montados — e muda também quem "ganha" a reputação no Google:
  o restaurante ou a gente.
- **Acesso ao Google Search Console:** precisa de uma conta Google da empresa
  para registrar os domínios. Sem isso não dá para confirmar se o Google
  aceitou o sitemap.
- **Imagem de preview:** precisamos de uma arte definitiva do FlyControl
  (1200×630 pixels) para substituir a temporária.

---

## 7. Resumo em uma frase

O vídeo acerta ao transformar publicação em checklist e acerta em dois dos
três itens; erra ao vender o `robots.txt` como se fosse tranca de porta — e
para nós o item que ele nem cita é o mais urgente: **o painel do FlyControl
precisa ser explicitamente marcado como "não indexar", e hoje não é.**
