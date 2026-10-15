# FlyControl — "Quanto custa vender?": auditoria de taxas, cálculos e produção

Consulta feita em **15/10/2026** (horário UTC registrado em cada arquivo de `auditoria/fontes/`).

## 1. Resumo em uma frase

Num pedido de exemplo de R$ 26,00, sobram **R$ 19,19** no cenário iFood (Plano Entrega), **R$ 22,85** no cenário
99Food (entrega pela 99) e **R$ 25,30** no cenário FlyControl (Plano CENTS). Em 100 pedidos, as taxas desse exemplo
somam R$ 681,20, R$ 314,60 e R$ 70,00. Isso é **receita depois dessas taxas**, não lucro, e não é economia garantida.

## 2. Fontes oficiais consultadas

| Plataforma | Endereço | Arquivo salvo | Situação |
|---|---|---|---|
| iFood | parceiros.ifood.com.br/restaurante/planos-ifood | `ifood-planos.curl.html` / `.txt` | lida |
| 99Food | merchant.99app.com/pt-BR/store | `99food-store-v2.txt`, `99food-entrega-pela-99.png`, `99food-store-pagina-inteira.png` | lida |
| 99Food (guia de cobranças) | 99app.com/99food/restaurantes/guias/entendendo-as-cobrancas-da-99food/ | `99food-guia-cobrancas.*` | **bloqueada**: o site respondeu "HTTP 429 / verificação de segurança" nas 3 tentativas |
| FlyControl | repositório `flycontrol-dash` + banco de dados (só leitura) | trechos citados abaixo | lida |

### iFood (texto da página oficial)
- **Plano Básico:** 12% de comissão sobre pedidos delivery + 3,2% de "taxa para pedidos pagos via iFood";
  R$ 110,00/mês.
- **Plano Entrega** (usado no vídeo): **23%** de comissão + **3,2%** para pedidos pagos via iFood; **R$ 150,00/mês**,
  "mensalidade para faturamento acima de R$ 1.800,00/mês"; "1º mês grátis!"; "verifique a disponibilidade na sua
  região". Inclui entrega com parceiros iFood, rastreio e atendimento até a entrega.
- **Promoção na mesma página:** "Cadastre-se agora e receba 3 meses de mensalidade grátis!".
- Não encontrei taxa de cadastro na página. O vídeo **não fala** em taxa de cadastro do iFood.

### 99Food (texto da página oficial)
- **Entrega feita pela 99** (usado no vídeo): comissão **8,9%**; mensalidade **0**; taxa de saque semanal **0%**;
  **3,2%** de "taxa de intermediação/administrativa: cobrada somente quando o cliente paga na plataforma 99Food";
  **custos logísticos:** "cobrança de taxas de entrega baseada na quilometragem. Os detalhes podem ser consultados
  durante a assinatura do contrato da loja".
- **Entrega própria:** comissão 10,9%; sem taxa de entrega; mesmo 3,2% quando pago na plataforma.
- A página mostra, ao lado, valores de comparação com um concorrente (12%, R$ 150, 1,59%). Esses números não foram
  usados.

### Divergências encontradas (e o que foi adotado)
1. **Mensalidade do iFood:** sites de terceiros citam R$ 130; a página oficial diz **R$ 150** no Plano Entrega.
   Adotei a oficial. A mensalidade **não entra** na conta do vídeo (está no rodapé).
2. **Comissão da 99Food:** a página divulga 8,9% (entrega pela 99) e 10,9% (entrega própria); notícias falam de
   condições negociadas e campanhas de "taxa zero". Adotei o valor publicado de 8,9% e o vídeo avisa que taxas e
   benefícios variam por contrato.
3. **Guia de cobranças da 99Food** não pôde ser lido (bloqueio do site). As informações usadas vieram da página
   oficial da loja, que estava acessível.

## 3. FlyControl: o que vale de verdade (repositório e banco)

| Item | Onde foi conferido | Resultado |
|---|---|---|
| Plano CENTS | `src/lib/billing/plans.ts` + tabela `plan_price_versions` (versão 2, ativa desde **27/08/2026**) | cadastro **R$ 0**, mensalidade **R$ 0**, **R$ 0,70 por pedido**; teste grátis de 30 dias |
| Faixas do CENTS | `src/lib/billing/centsTiers.ts` (`POLITICA_CENTS_V2`) | pedidos 1–100: R$ 0,70 · 101–250: R$ 0,60 · 251–500: R$ 0,50 · 501+: R$ 0,40, contados no **ciclo mensal**; cada faixa vale dali para frente (não é retroativa) |
| O que é cobrado | `billingEngine.ts` (`isBillableOrder`) | só pedidos que entraram em operação (em preparo, saiu, pronto, entregue, concluído). **Não cobra:** novo/pendente, cancelado, recusado, excluído, pedido de teste ou "fantasma" |
| Plano PREMIUM | `plans.ts` | R$ 375,00/mês, sem tarifa por pedido (não usado no vídeo) |
| Acesso legado | banco | alguns estabelecimentos antigos não pagam nada (não usado no vídeo) |
| Clube CENTS | `src/components/club/ClubCentsCard.tsx` | é só o painel que mostra em que faixa a loja está, com a mesma conta da fatura; **não tem custo extra** |
| Pagamento do cliente final | site de pedidos (`conectfly`) | **não há gateway de pagamento**: o restaurante recebe Pix, cartão ou dinheiro por conta própria. Não existe taxa de pagamento do FlyControl, mas a maquininha ou o Pix do restaurante podem cobrar a parte |
| Taxa de cadastro antiga | `plan_price_versions` v1 | a versão 1 do CENTS tinha cadastro de R$ 25,00; foi removida na v2 ("entrada gratuita no CENTS") |

**Conclusão:** o R$ 0,70 é a tarifa real do **Plano CENTS para os 100 primeiros pedidos aceitos do mês**. O vídeo
mostra sempre essa condição. Ele não vale para todos os planos (o PREMIUM cobra mensalidade) nem para todos os
pedidos (depois do 100º o valor cai).

Nada no sistema foi alterado: nenhuma tarifa, rota, pedido ou configuração. As consultas ao banco foram só de leitura.

## 4. Cálculos (todos em centavos inteiros)

Método: taxa percentual = preço × (pontos-base) ÷ 10.000, **arredondada meio-centavo para cima**. Tudo é conta de
inteiros, sem casas decimais, então não há erro de arredondamento. Conferido por programa:
`npx tsx scripts/verificar-calculos.ts` → `auditoria/verificacao-calculos.txt` ("Todos os números conferem.").

### Cenário A — mesmo preço (R$ 26,00)
| | iFood · Plano Entrega | 99Food · entrega pela 99 | FlyControl · Plano CENTS |
|---|---|---|---|
| Taxas consideradas | 23% + 3,2% = **26,2%** | 8,9% + 3,2% = **12,1%** | **R$ 0,70** fixos |
| Taxa no pedido | R$ 6,81 (6,812) | R$ 3,15 (3,146) | R$ 0,70 |
| Sobra após essas taxas | **R$ 19,19** | **R$ 22,85** | **R$ 25,30** |

### Cenário B — quanto cobrar para sobrar R$ 26,00
| iFood | 99Food | FlyControl |
|---|---|---|
| **R$ 35,23** (26 ÷ 0,738 = 35,2304) | **R$ 29,58** (26 ÷ 0,879 = 29,579) | **R$ 26,70** (26 + 0,70) |

Conferido ao contrário: R$ 35,23 − 26,2% (R$ 9,23) = R$ 26,00; R$ 29,58 − 12,1% (R$ 3,58) = R$ 26,00. São preços
**calculados para compensar as taxas**, não os preços praticados nos aplicativos (o vídeo diz isso).

### Cenário C — 100 pedidos de R$ 26,00 (R$ 2.600,00 em vendas)
| iFood | 99Food | FlyControl (faixa 1–100) |
|---|---|---|
| **R$ 681,20** | **R$ 314,60** | **R$ 70,00** |

Diferença nas taxas do exemplo: **R$ 611,20** (frente ao iFood) e **R$ 244,60** (frente à 99Food).
O percentual foi aplicado sobre o total vendido. Para registro: se cada pedido fosse arredondado antes e depois
somado, daria R$ 681,00 e R$ 315,00. A diferença é de centavos e não muda a mensagem.

### O que ficou fora da conta (e aparece no rodapé do vídeo)
Mensalidades (iFood R$ 150 acima de R$ 1.800/mês) · custos de entrega e logística (99Food cobra por km) · anúncios e
tráfego pago · cupons e promoções · taxas da maquininha ou do Pix do próprio restaurante · qualquer custo do
restaurante (insumos, embalagem, entregador próprio).

### Cuidado na leitura (honestidade da comparação)
- Os planos escolhidos são os do pedido do anúncio. Os dois marketplaces **incluem entrega** e **trazem clientes
  pelo aplicativo**. O FlyControl não faz entregas nem traz clientes sozinho: o restaurante entrega e divulga o
  próprio cardápio. O vídeo diz isso no rodapé e não promete substituir entregador, tráfego pago ou captação.
- Se o restaurante usa iFood Básico (12% + 3,2% = 15,2%) ou 99Food com entrega própria (10,9% + 3,2% = 14,1%), a
  diferença por pedido fica menor (R$ 3,95 e R$ 3,67 de taxa em R$ 26,00). O vídeo **não** usa esses números.
- Os 3,2% só existem quando o cliente paga dentro do aplicativo.

## 5. O que aparece no vídeo (cena por cena, versão de 53 s)

| Tempo | Cena | Conteúdo |
|---|---|---|
| 0–5 s | O mesmo hambúrguer | hambúrguer se multiplica; cartões iFood / 99Food / Venda direta; "O MESMO HAMBÚRGUER. MAS QUANTO SOBRA DA VENDA?" |
| 5–12,5 s | iFood | R$ 26,00 → 23% + 3,2% = 26,2% → nota se divide, moedas → R$ 19,19 |
| 12,5–19,5 s | 99Food | entra de lado; 8,9% + 3,2% = 12,1% → R$ 22,85; rodapé "variam conforme contrato" |
| 19,5–23,5 s | A pergunta | os dois resultados congelam e se partem; a música some; "E SE VOCÊ VENDESSE PELO SEU PRÓPRIO CARDÁPIO?" |
| 23,5–31 s | FlyControl | fragmentos convergem, anel laranja, celular com o cardápio real (Açaí Deus Proverá) e a marca oficial; R$ 0,70 → R$ 25,30; depois o Cenário B (R$ 35,23 / R$ 29,58 / R$ 26,70) |
| 31–40 s | 100 pedidos | 100 comandas → gráfico R$ 681,20 / R$ 314,60 / R$ 70,00 → "ATÉ R$ 611,20 DE DIFERENÇA NAS TAXAS DESTE EXEMPLO" |
| 40–47 s | Cardápios | 5 cardápios reais, cada um com o seu vídeo de capa; no centro, o fluxo real: adicionais → carrinho → resumo do pedido |
| 47–53 s | Final | marca, painel em modo claro e dois cardápios; "MAIS CONTROLE SOBRE SUAS VENDAS." · "Seu cardápio. Sua marca. Seus pedidos." · "CONHEÇA O FLYCONTROL"; aviso de marcas |

A versão de **30 s** tira a cena da pergunta e a cena dos cardápios, e acelera as outras. Nela o Cenário B (preço
para sobrar R$ 26,00) **não aparece**, porque não haveria tempo de leitura.

## 6. Imagens usadas (todas originais)
- Cardápios: gravações do site no ar (`conectfly.com.br`) das 5 lojas, cada uma com o próprio vídeo de capa.
- Fluxo de pedido: 5 capturas reais do Açaí Deus Proverá (Açaí na Tigela 500 ml, Nutella, Calda de Morango, Paçoca,
  carrinho "1 item R$ 18,00", tela "Seu pedido"). Os toques e as marcações de adicionais usam recortes dessas mesmas
  capturas. **Nenhum pedido foi finalizado.**
- Painel: quadro de pedidos em Modo Claro, capturado no ambiente de demonstração (dados fictícios).
- Hambúrguer: foto real de produto do cardápio Açaí Deus Proverá, recortada do fundo. Lá ele custa R$ 6,00; os
  R$ 26,00 do vídeo são só o **preço de exemplo** pedido no roteiro ("Exemplo ilustrativo" aparece na tela).
- iFood e 99Food aparecem só por nome e por cor (vermelho e azul), sem logotipos, com o aviso "marcas de seus
  titulares, citadas só para comparação. Sem parceria ou vínculo com o FlyControl".

## 7. Limitações
1. **Narração masculina feita aqui, sem ElevenLabs.** A conta da ElevenLabs tinha 51 créditos e a locução pedia 790,
   então usei o **Piper**, um gerador de voz gratuito que roda no próprio computador da produção, com a voz
   brasileira **"Cadu"** (licença CC0: uso comercial liberado, sem pagar nada e sem citar autor). Cada frase foi
   gravada 3 vezes e um reconhecedor de fala (Whisper) escolheu a tomada mais clara; depois transcrevi a mistura
   final inteira e todas as frases e valores foram entendidos. Para a voz acertar a pronúncia, o texto interno usa
   grafias como "Ifúd", "FláiContról" e "carrdápio" (as legendas usam a grafia normal).
   **Limite honesto:** é uma voz sintética mais simples que a da ElevenLabs. Soa como locução de máquina boa, não
   como um locutor humano. Se quiser trocar depois, o texto e os tempos já estão prontos (`narracao/frases.json`).
   O texto da 30 s é mais curto (só os valores finais), porque a cena passa rápido.
   O arquivo `_SemVoz` agora é diferente: mesma edição de 53 s, só com trilha e efeitos.
2. **Legendas:** `FlyControl_Comparativo_Legendas.srt` acompanha a locução, frase a frase. Os textos-chave da tela
   estão em `..._TextosNaTela.srt`. As legendas não foram gravadas por cima do vídeo, porque a tela já tem muitos
   números; Instagram e TikTok exibem o .srt como legenda opcional.
3. O guia de cobranças da 99Food não abriu (bloqueio do site).
4. Taxas de marketplace mudam com frequência. Antes de publicar daqui a algumas semanas, vale abrir as duas páginas
   de novo e conferir os quatro números (23%, 8,9%, 3,2% e R$ 0,70).

## 8. Checagem final
- [x] Todos os valores do vídeo saem do mesmo arquivo de cálculo (`componentes/calculos.ts`) e foram conferidos por
  programa.
- [x] Contadores animados terminam exatamente no valor final (contagem em centavos inteiros).
- [x] Quadros finais revisados: números legíveis e corretos em todas as cenas.
- [x] Plano, data de consulta e "valores variam por contrato" aparecem em cada cenário.
- [x] Nenhuma alteração no FlyControl, no site de pedidos ou no banco; nenhum pedido real criado.
- [x] Áudio a -14 LUFS (padrão das redes), sem distorção; música abaixa cerca de 8 dB quando o locutor fala.
