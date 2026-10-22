# Chat CRM 2.0 — o que mudou, como publicar e como desfazer

## O que muda para quem atende

| Antes | Agora |
|---|---|
| Áudio, foto, vídeo e PDF do cliente apareciam só como a palavra "Áudio"/"Foto" — **~4.900 mensagens** sem arquivo | O painel busca o arquivo no WhatsApp na primeira vez que alguém olha, guarda na pasta fechada da loja e mostra |
| Tocador de áudio do navegador, sem velocidade | Tocador próprio: tocar/pausar, barra de progresso, tempo, velocidade 1x/1,5x/2x, "ouvir de novo" |
| PDF abria em outra aba | PDF abre por cima da conversa, com "abrir em nova aba" e "baixar" |
| Áudio gravado ia direto como anexo, sem ouvir | Prévia: dá para ouvir antes de mandar |
| Gravação em webm (formato que o WhatsApp **não** lista como aceito) | Grava em AAC/MP4 ou OGG quando o navegador sabe; webm só como último recurso |
| ✓✓ "entregue" assim que o WhatsApp aceitava | ✓ "enviada" — honesto: o sistema ainda não recebe o aviso de entregue/lido |
| Mensagem que falhou: só o aviso | Botão "Tentar de novo" (a mesma mensagem volta à fila) |
| Busca só nas 30 conversas da tela | Busca na loja inteira, por nome ou telefone |
| Só as 30 conversas mais recentes | Filtros (Todas, Não lidas, Abertas, Aguardando, Resolvidas) e "Carregar mais" |
| Só as últimas 100 mensagens | "Carregar mensagens anteriores" — histórico inteiro |
| Mensagem nova puxava a tela para baixo mesmo lendo o passado | Só desce se a pessoa já estava no fim; senão aparece "Novas mensagens ↓" |
| Mensagem chegando na conversa aberta acendia "não lida" | Conversa aberta e visível é marcada como lida |
| Sem ficha do cliente | Ficha ao lado (tela larga) ou em gaveta: pedidos, quanto gastou, etiquetas (as mesmas do Marketing) e anotações |

## Como os arquivos são buscados (e por que é seguro)

1. A tela pede `carregarMidia(messageId)`. O servidor confere **dono da loja + Chat contratado** (o porteiro de sempre).
2. A mensagem é procurada **com a loja junto** — número de mensagem de outra loja não é encontrado.
3. Se já está na pasta: só gera um endereço assinado de 1 hora.
4. Se não: chama a UAZAPI `POST /message/download {id}` (áudio pede MP3, que toca em qualquer navegador, inclusive iPhone).
5. Só baixa de endereço **https da própria UAZAPI configurada** (nada de baixar de qualquer lugar).
6. Para no 20º MB; confere o **tipo verdadeiro pelos primeiros bytes** (uma página da internet disfarçada de foto é recusada; PDF que não começa como PDF é dado como corrompido).
7. Guarda em `crm-chat-media/<loja>/<conversa>/...` (pasta fechada) e grava o caminho **só se ninguém gravou antes** — duas telas abertas não criam dois arquivos.
8. Erro do fornecedor nunca chega cru à tela; fica no registro do servidor **sem token**.

Fotos são buscadas sozinhas (no máximo 3 ao mesmo tempo); áudio, vídeo e PDF só quando a pessoa pede — uma conversa com 30 áudios não baixa 30 arquivos que ninguém vai ouvir.

## Quais lojas recebem

É um sistema só para todas as lojas (multi-loja): **toda loja com o Chat contratado recebe a versão nova junto, na publicação**. Em 22/10/2026 eram 3:

| Loja | Fluxo n8n | WhatsApp conectado |
|---|---|---|
| AÇAI E LOVE | ativo | sim |
| Açai Deus provera | ativo | sim |
| ADMIN FLYCONTROL (loja de teste) | ativo | sim |

Nenhuma configuração por loja precisa mudar. Nenhum fluxo do n8n precisa mudar.

## Publicar

1. **Banco (opcional):** `docs/APLICAR-NO-SUPABASE-chat-crm-2.sql` no SQL Editor. Só amplia os tipos aceitos na pasta (Word, Excel, texto). Sem isso tudo funciona; esses documentos só aparecem como "veja no celular".
   - O robô de migrações (`.github/workflows/migrations.yml`) vai tentar aplicar sozinho ao juntar na `main`, mas o histórico do banco está desencontrado do repositório e a trava dele deve **parar sem aplicar nada** — por isso o arquivo para colar à mão.
2. **Código:** juntar o PR na `main`. O `deploy.yml` publica no Cloudflare sozinho.
3. **Conferir na loja de teste (ADMIN FLYCONTROL):**
   - abrir uma conversa com áudio antigo → apertar tocar → deve tocar;
   - abrir uma conversa com foto → deve aparecer sozinha; clicar → amplia; Esc fecha;
   - abrir um PDF recebido → abre por cima; fechar volta à conversa;
   - gravar um áudio → ouvir a prévia → enviar → conferir que chegou **no celular** do destinatário e que toca lá;
   - buscar um cliente antigo pelo nome → tem de aparecer.
4. Se a loja de teste estiver ok, as outras já estão com a mesma versão.

## Desfazer (se algo der errado)

- **Código:** no GitHub, "Revert" do PR e juntar o revert na `main` — o Cloudflare volta à versão anterior em poucos minutos. Nenhuma mensagem é perdida: a versão nova só **acrescenta** o caminho do arquivo nas mensagens; a antiga simplesmente ignora esse campo.
- **Banco:** `docs/REVERTER-NO-SUPABASE-chat-crm-2.sql`.
- **Arquivos já guardados:** ficam na pasta fechada; não atrapalham a versão antiga.

## O que ainda depende de fora

- **Envio de áudio como "mensagem de voz":** os fluxos do n8n mandam o áudio do painel com `type: "audio"` (chega como arquivo de áudio). Para chegar como mensagem de voz (a bolinha com microfone), o nó "Enviar resposta do painel" de cada loja precisa usar `type: "ptt"` quando `media_type` for `audio`. É mudança no n8n de produção das lojas — não foi feita sem autorização.
- **Entregue / lido (✓✓ azul):** a UAZAPI está configurada só com os eventos `messages` e `connection`. Para mostrar entregue/lido é preciso assinar o evento de atualização de mensagem e criar a gravação desse status — fica para uma etapa própria.
- **Arquivos muito antigos:** o WhatsApp só guarda as mídias por um tempo. Mensagens antigas demais vão aparecer como "O WhatsApp não tem mais este arquivo" — isso não tem como recuperar.
