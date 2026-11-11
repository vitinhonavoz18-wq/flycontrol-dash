# Vitrine do site — os alimentos que flutuam no topo da página inicial

O topo da página pública mostra um alimento de verdade, recortado, flutuando
no ar e trocando a cada 3 segundos por outro produto dos cardápios do
FlyDelivery (hambúrguer → pizza → açaí → pastel...). Em volta, os ícones da
plataforma e os avisos de pedido, cada um no seu ritmo.

Enquanto a equipe não escolher nenhum produto, aparece o **hambúrguer da arte
oficial da marca**, recortado com o mesmo processo e incluído no próprio site.

---

## Como funciona, em uma frase por peça

| Peça | Onde | O que faz |
|---|---|---|
| Lista de destaques | tabela `hero_showcase_items` | Quais produtos vão para a vitrine, em que ordem, se estão aprovados e ligados |
| Tela da equipe | Painel → Administração global → **Vitrine do site** (`/admin/vitrine-site`) | Escolher, aprovar, ligar/desligar, ordenar, refazer recorte, remover |
| Recorte | `scripts/vitrine-hero/preparar_vitrine.py` | Tira o fundo da foto, limpa as bordas, confere a qualidade e guarda o WebP transparente |
| Recorte automático | GitHub → Actions → **Vitrine do site — preparar fotos** | Roda de hora em hora; se não há fila, termina em segundos |
| Depósito dos recortes | Supabase Storage → `hero-showcase` (público para leitura) | A foto original do cardápio nunca é alterada |
| Lista para o site | `/api/public/vitrine-hero` | Só nome, tipo e endereço do recorte; guardada em cache por 10 minutos |
| Animação | `src/components/landing/vitrine/` | Flutuação, balanço, troca, sombra, brilho, órbita, ícones e profundidade pelo mouse |
| Regras | `src/lib/vitrine/vitrine.ts` | Tipo de comida, ordem alternada, tamanho igualado, validação |

---

## Primeira configuração (uma vez só)

1. **Banco:** cole `docs/APLICAR-NO-SUPABASE-vitrine-do-site.sql` no
   SQL Editor do Supabase e clique em Run.
2. **Chave do recorte no GitHub:** repositório → Settings → Secrets and
   variables → Actions → New repository secret:
   - Nome: `SUPABASE_SERVICE_ROLE_KEY`
   - Valor: Supabase → Project Settings → API → chave `service_role`.

   (`SUPABASE_URL` já existe.) Essa chave abre todas as portas do banco: ela
   fica **só** nos segredos do GitHub, nunca no código nem no site.
3. Pronto. Sem a chave, o processo do recorte avisa e termina sem erro.

---

## Operação do dia a dia

### Adicionar um produto

Painel → **Vitrine do site** → "Adicionar produto" → busque pelo nome →
botão **+**. O produto entra **aprovado** (escolha manual) e vai para a fila
do recorte. Em até uma hora o recorte fica pronto e o produto aparece no site
(10 minutos de cache depois disso).

Para não esperar a hora cheia: GitHub → Actions → "Vitrine do site — preparar
fotos" → **Run workflow**.

**Dica de foto boa:** alimento inteiro, nítido, sem mão nem pessoa, foto com
pelo menos 480 px no lado menor. Quanto maior, mais nítido no site.

### Deixar o sistema sugerir

"Sugestões automáticas" → **Sugerir produtos**. A lista alterna categorias e
só traz produtos ativos, com foto, de lojas ativas, que não sejam bebida.
Cada sugestão escolhida entra como **sugestão**: é recortada, mas **só vai ao
site depois que alguém clicar em Aprovar** olhando o recorte pronto.

> Por que a aprovação: a foto pertence ao restaurante, e colocá-la na
> vitrine da plataforma é divulgação. Também evita que um recorte torto
> apareça para todo visitante.

### Tirar um produto do site

- Temporariamente: desligue a chave **Ligado**.
- De vez: lixeira (**Remover**). A foto do cardápio da loja não é tocada.

### Refazer o recorte

Botão de setas circulares (**Refazer o recorte**). Se a loja trocar a foto do
produto no cardápio, o recorte é refeito **sozinho** na próxima hora.

### Ordem

Setas para cima/baixo. A escolha manual sempre vem antes das sugestões. Na
hora de mostrar, a vitrine ainda alterna os tipos de comida para não exibir
dois hambúrgueres seguidos.

### Tipo de comida

O tipo é adivinhado pelo nome e pela categoria. Se errar, corrija na caixa
de seleção da linha — ele só serve para alternar os tipos na vitrine.

### Recorte recusado

A linha mostra o motivo, em português. Os motivos possíveis:

| Motivo | O que fazer |
|---|---|
| Foto pequena demais | Peça à loja uma foto maior, ou escolha outro produto |
| Alimento ocupa uma parte muito pequena da foto | Foto com o alimento mais de perto |
| Não foi possível separar o alimento do fundo | Foto com fundo diferente da comida |
| Alimento cortado pela borda da foto | Foto em que o alimento aparece inteiro |
| Foto desfocada | Foto mais nítida |
| Erro ao preparar: … | Geralmente a foto não baixou; tente "Refazer o recorte" |

---

## Ajustes finos (no código)

| O que | Onde |
|---|---|
| Tempo de cada produto (3 s) | `INTERVALO_DA_VITRINE_MS` em `src/lib/vitrine/vitrine.ts` |
| Duração da troca (0,6 s) | `DURACAO_DA_TROCA_MS` no mesmo arquivo + `.vitrine-entra`/`.vitrine-sai` em `src/styles.css` |
| Tamanho dos alimentos | `AREA_ALVO` e `LIMITE` em `src/lib/vitrine/vitrine.ts` |
| Flutuação, balanço, sombra, brilho | bloco "VITRINE DO TOPO DO SITE" em `src/styles.css` |
| Posição dos ícones | `ICONES` em `src/components/landing/vitrine/HeroFoodShowcase.tsx` |
| Quantos produtos no máximo (12) | `LIMIT 12` em `hero_showcase_public()` |
| Modelo do recorte | variável `VITRINE_MODELO` (padrão `birefnet-general-lite`; `birefnet-general` é a versão completa, 3× mais lenta) |
| Frequência do recorte automático | `cron` em `.github/workflows/vitrine-hero.yml` |

Testar o recorte numa foto, no computador (precisa de Python 3.10+):

```bash
pip install -r scripts/vitrine-hero/requirements.txt
```

```bash
python scripts/vitrine-hero/preparar_vitrine.py --arquivo foto.jpg --saida recorte.webp
```

Teste completo do processo (sem internet nem banco):

```bash
python scripts/vitrine-hero/teste_preparar_vitrine.py
```

---

## Limites conhecidos

- **Não há giro 3D de verdade.** Com uma foto só não existe o "outro lado"
  do lanche. Girar a foto de lado mostraria o lanche achatado e espelhado. Por
  isso o movimento é flutuar, balançar alguns graus e responder levemente ao
  mouse. Giro 360° de verdade exigiria fotos de vários ângulos ou um modelo 3D
  de cada produto.
- **O recorte é automático, não perfeito.** O modelo (BiRefNet, código
  aberto) acerta muito bem pão, queijo, alface e molho, mas fumaça e vapor
  costumam sumir, e fotos com fundo da mesma cor da comida podem falhar. Por
  isso as sugestões automáticas passam por aprovação.
- **O hambúrguer da marca** foi recortado da arte de referência, que tem 640 px
  de altura nessa região: em telas muito grandes ele fica levemente menos
  nítido que um produto fotografado em alta resolução.
- Em celulares, as faíscas são reduzidas e o efeito do mouse fica desligado,
  para economizar bateria.
- Quem ativou "reduzir movimento" no aparelho vê o alimento parado, sem troca
  automática.
