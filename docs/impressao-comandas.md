# Impressão de comandas — auditoria e refatoração (nov/2026)

## 1. Diagnóstico — como era

**Onde estava a impressão:** procurei nos quatro sistemas (FlyControl, SiteCreatorFly
`conectfly`, app FlyDelivery `flydelivery` e a busca de código em todos os repositórios
da conta). Toda impressão de comanda acontece no **FlyControl**, em dois lugares:

| Comanda | Arquivo | Como imprimia |
| --- | --- | --- |
| Do pedido | `src/routes/print.$orderId.tsx` | página HTML com Tailwind + `window.print()` |
| Da mesa | `src/components/TablesManagement.tsx` | outro HTML, escrito à mão numa janela nova (`document.write`) |

**O que NÃO existe (e o pedido presumia que existia):**

- **PrintNode**: nenhuma linha de código, chave ou configuração em nenhum dos repositórios.
- **ESC/POS / envio direto**: nenhum.
- **Impressão automática ao chegar pedido**: a coluna `pizzerias.print_auto` existe no banco
  (padrão `true`), mas **nenhum código lê esse valor**. A única coisa automática é: ao abrir
  a página da comanda, a janela de impressão abre sozinha. Isso foi mantido.

**Respostas aos 10 pontos da auditoria:**

1. *Geração*: componente React montando a página com `div`s, `flex`, letras de vários tamanhos.
2. *Formatação*: CSS (`justify-between`, `text-xs/sm/lg`, `ml-4`), sem noção de "letras por linha".
3. *Envio*: só `window.print()` do navegador → driver do Windows/Mac.
4. *Formato*: HTML renderizado pelo navegador (o driver recebe o desenho da página).
5. *Quebras de linha*: o texto do cliente com `\n` caía dentro de `div` com `white-space: normal`
   → **o navegador transforma `\n` em espaço**. Comprovado no código.
6. *Codificação*: página em UTF-8 (correto). O problema aparece no driver "Somente texto", que
   converte para a tabela do Windows e a impressora lê em outra (acento vira símbolo).
7. *Driver*: interfere, sim — ver causa 2 abaixo.
8. *Texto puro, PDF ou ESC/POS?* Nenhum dos três: HTML pelo driver.
9. *Larguras*: 80 mm fixos, depois "auto/80/58/A4" em `papel.ts`, mas a quantidade de letras
   por linha nunca era controlada (dependia do tamanho da fonte e do navegador).
10. *Duplicadas/conflitantes*: sim — duas comandas com regras diferentes (pedido e mesa).
    A da mesa colava nome e observação do cliente **direto no HTML, sem escapar** (ver item 4).

### Causas raiz

1. **Comprovada — quebras de linha engolidas.** Observação do cliente ("sem cebola ⏎ bem
   passada"), observação de item e a descrição da pizza do configurador (`descreverPizza`
   gera texto com `\n`) iam para a página como texto corrido. Resultado: tudo numa linha só.
2. **Provável (não confirmável sem a impressora) — driver "Genérica / Somente texto".**
   É a instalação mais comum de térmica barata no Windows. Esse driver não imprime o desenho
   da página: ele extrai o texto e "adivinha" as linhas pela posição. Com letras de tamanhos
   diferentes na mesma faixa e preço flutuando à direita (`flex justify-between`), ele emenda
   pedaços de linhas diferentes — exatamente o sintoma "tudo junto, desorganizado, só em
   algumas impressoras". Também é ele que troca acento por símbolo.
3. **Comprovada — largura em letras não controlada.** Cada navegador/fonte decidia quantas
   letras cabiam; colunas de preço não alinhavam entre impressoras.
4. **Comprovada — risco de segurança na comanda da mesa.** Observação de cliente escrita como
   código seria executada na tela da loja, numa janela com a sessão do lojista aberta.
5. **Bugs menores encontrados:** desconto não aparecia; referência de entrega
   (`customer_reference`) não era impressa; "subtotal" era calculado como `total − entrega`
   (errado quando havia desconto); `window.close()` 0,5 s depois de `print()` na mesa podia
   cancelar a impressão em alguns navegadores.

## 2. Solução — como ficou

A comanda virou uma **grade de letras de largura fixa**: cada linha tem no máximo N letras
(N vem do perfil da impressora), montada pelo sistema, e é desenhada em fonte monoespaçada com
o tamanho calculado para N letras ocuparem exatamente a largura útil do papel. Cada linha é um
bloco próprio. Consequências:

- driver que desenha a página: imprime igual à prévia;
- driver "Somente texto": recebe linhas homogêneas, mesma fonte, mesmo tamanho, uma por faixa —
  não há o que adivinhar;
- quebras do cliente são respeitadas; textos longos quebram por palavra; nada invade a coluna
  do valor.

### Arquitetura (`src/lib/impressao/`)

| Papel pedido | Arquivo | O que faz |
| --- | --- | --- |
| PrintFormatter | `texto.ts`, `comanda.ts` | limpeza (NFC, `\r\n`/`\r`→`\n`, emoji, símbolos), quebra, alinhamento; monta comanda do pedido e da mesa a partir dos dados do banco, dinheiro em centavos |
| PrinterProfileManager | `perfil.ts` | perfis por loja **neste computador** (até 6 impressoras por loja), normalização, migração da escolha antiga de papel |
| PrintRenderer | `renderizar.ts` + `components/impressao/ComandaImpressa.tsx` | texto puro (LF/CRLF), **HTML** (o usado hoje) e **ESC/POS + base64** (pronto, não ligado) |
| PrintTransport | `transporte.ts` | impressão pelo navegador com trava anti-duplicidade; impressão em quadro invisível |
| PrintValidator | `validar.ts` | linha larga, letra que a impressora não tem, quebra escondida, letra pequena demais, campos faltando, soma ≠ subtotal |
| PrintDiagnostics | `diagnostico.ts` | ficha técnica para o suporte, **sem dados de cliente** |

Tela: nova aba **Minha Loja › Impressão** (`components/impressao/ConfiguracaoDeImpressao.tsx`)
com escolha de impressora, marca, papel, letras por linha, margem, espaçamento, linhas no fim,
tirar acentos, logo, prévia em tamanho real (o mesmo bloco que imprime), teste de alinhamento,
comanda de exemplo, status e "copiar diagnóstico". A página da comanda mantém a escolha rápida
de papel e mostra os avisos do validador.

### Perfis padrão

| Papel | Letras/linha | Largura útil | Letra |
| --- | --- | --- | --- |
| 58 mm | 32 | 48 mm | ≈ 2,45 mm |
| 80 mm | 48 | 72 mm | ≈ 2,45 mm |
| Automático | 42 | até 70 mm (ajusta à folha na hora) | variável |
| A4 | 48 | 106 mm | ≈ 3,6 mm |

São valores típicos das térmicas com a fonte normal; **não são garantia por modelo**. O teste
de alinhamento confirma no papel.

### Por que não há detecção automática do modelo

O navegador não informa ao site qual impressora está ligada nem a largura da bobina. Não existe
dado confiável para detectar. Por isso: perfil "Automático" seguro + configuração manual +
teste de alinhamento. A marca escolhida é só informativa (diagnóstico/suporte).

### ESC/POS e PrintNode

`paraEscPos` gera os comandos (iniciar, tabela CP860/CP850, negrito, altura dupla sem largura
dupla, só LF, avanço, corte parcial `GS V 66 0`, gaveta `ESC p`) e `paraBase64` o formato de
dado bruto que serviços como o PrintNode recebem. **Nada disso está ligado a uma impressora.**
Ligar exige decisão do dono: conta e mensalidade do PrintNode (ou outro agente), programa
instalado em cada computador da loja, chave guardada no servidor (nunca no navegador) e uma
tabela no banco para os vínculos loja ↔ impressora. Os números das tabelas de acentos
seguem a numeração Epson; Bematech/Daruma em modo nativo usam outra — testar antes.

Densidade de impressão não foi implementada: não existe comando padrão entre marcas.

## 3. Testes executados

**Simulados (sem impressora física):**

- `src/lib/impressao/*.test.ts` + `components/impressao/*.test.tsx`: 102 testes — 58 mm,
  80 mm, todas as larguras 24–80, nome longo, observação multilinha, 40 itens, complementos,
  pizza do configurador sem repetir descrição, adicionais no texto do item, acentos/emoji/aspas,
  modo sem acento só ASCII, alinhamento dos valores, centavos (0,1+0,2), endereço extenso,
  pedido mínimo sem "undefined", várias impressoras por loja, lojas diferentes no mesmo
  computador, pedidos simultâneos de lojas diferentes, falha do navegador, clique duplo,
  quadro invisível, escape de HTML, logo só http(s), bytes ESC/POS e base64, regressão por
  instantâneo (snapshot) de 58 e 80 mm.
- Suite completa do projeto: 125 arquivos, 1.903 testes, todos passando. Build de produção ok.
- Medição no Chromium em modo de impressão, folhas de 58, 80 e 210 mm, perfis 58/80/auto/A4:
  nenhuma linha transbordou, todas as linhas com a mesma altura.

**Não aplicáveis / não executados:**

- Falhas de conexão com PrintNode e impressão automática ao chegar pedido: essas funções não
  existem no sistema (ver seção 1). Testei a falha do caminho que existe (navegador).
- **Nenhum teste em impressora física foi feito.**

## 4. Como validar nas impressoras de verdade

Para cada impressora (anote marca, modelo, driver instalado e largura da bobina):

1. Minha Loja › Impressão → escolha o papel → **Imprimir teste de alinhamento**.
2. A régua `1234567890…` saiu numa linha só, de ponta a ponta? Se quebrou, diminua as letras
   por linha; se sobrou papel à direita, aumente. Repita até ficar certo.
3. As setas `<` e `>` encostam nas duas beiradas? Se a da esquerda sumiu, aumente a margem.
4. A linha de acentos saiu legível? Se saiu com símbolos, ligue **Tirar os acentos**.
5. Imprima a **comanda de exemplo**: confira que nenhuma linha está emendada, os valores estão
   na mesma coluna e a observação aparece em negrito em linhas separadas.
6. O corte pegou a última linha? Aumente "Linhas em branco no fim". Corte automático, no
   navegador, é ligado em Windows › Impressoras › (impressora) › Preferências de impressão.
7. No Chrome, na janela de impressão: Margens "Nenhuma", Escala "Padrão" (100%), sem
   "Cabeçalhos e rodapés".
8. Se ainda sair errado: **Copiar diagnóstico para o suporte** e enviar junto com a foto do papel.

Registre o resultado por modelo antes de dizer que um modelo "é compatível".
