# Maya 2.0 — Instagram e WhatsApp (n8n)

| Canal | Fluxo no n8n | Situação |
|---|---|---|
| Instagram | **instagram mensagens - MAYA 2.0** (`tFGrw9RxPg2OLolo`) | **No ar** desde 26/10/2026. A v3 foi desligada (continua guardada). |
| WhatsApp | **whatsapp mensagens - MAYA 2.0** (`LsrPRHQiKBhtus7K`) | Ligado em **modo simulado**: pensa e responde, mas não envia nada. Falta a conexão da UAZAPI. |

Cópias de segurança (sem endereços nem senhas): `docs/fluxo-n8n-instagram-maya-2.0.json` e
`docs/fluxo-n8n-whatsapp-maya-2.0.json`.

## O que a 2.0 faz (nos dois canais)

- **Trava "from me"**: quando alguém da equipe responde o cliente (pelo celular, Instagram ou
  Business Suite), a Maya fica calada naquela conversa por 6 h. O prazo renova a cada resposta da
  equipe. As mensagens da própria Maya ficam marcadas e não travam nada.
- **#maya**: a equipe manda uma mensagem contendo `#maya` para o cliente e a Maya volta na hora.
- **Transferência de verdade**: quando a Maya chama atendente, ela se cala e avisa a equipe
  (e-mail e, no WhatsApp, também uma mensagem no WhatsApp da equipe).
- **Memória** de cada cliente (30 dias, últimas 20 trocas).
- **Junta mensagens picadas** ("oi" / "tudo bem?" / "tem fidelidade?" vira uma resposta só).
- **Áudio e imagem**: transcreve áudio e descreve imagem e print de erro.
- **Proteções**: não responde duas vezes a mesma mensagem, no máximo 8 mensagens por minuto por
  cliente (anti-loop), ignora grupos e listas de transmissão (WhatsApp), confere a assinatura da
  Meta (Instagram).
- **IA com 3 tentativas**; se mesmo assim falhar, o cliente recebe um pedido de desculpas e a equipe
  é chamada.
- Instagram: mostra "digitando...". WhatsApp: divide a resposta em até 4 balões, com tempo de
  digitação.

## Testes feitos em 26/10/2026 (clientes fictícios, nenhum cliente real recebeu nada)

| Teste | Instagram | WhatsApp |
|---|---|---|
| Cliente pergunta preço | ✅ respondeu CENTS e Premium | ✅ (4 balões, simulado) |
| Memória da conversa | ✅ | — |
| Mensagens picadas viram uma resposta | ✅ | — |
| Mensagem repetida ignorada | ✅ | — |
| Equipe responde → Maya cala | ✅ | ✅ |
| `#maya` devolve a conversa | ✅ | ✅ |
| Cliente pede atendente → transfere e trava | ✅ | ✅ |
| Grupo e aviso de conexão ignorados | — | ✅ |
| Verificação da Meta com senha errada → recusa | ✅ (403) | — |

## Problemas encontrados e corrigidos durante os testes

1. **A conexão de Redis "fly control instagram" não responde.** Qualquer fluxo que a usasse ficava
   parado para sempre. Os dois fluxos 2.0 usam a conexão **"ivaodonto"**, que é a mesma que o fluxo
   da farmácia usa todo minuto sem erro. As chaves da FlyControl começam com `ig:` e `wa:`; as da
   farmácia, com `farmacia_`, então não se misturam.
2. **O n8n bloqueia `$env`.** A verificação da Meta (usada só ao recadastrar o webhook) nunca
   funcionou, nem na v3. Agora a senha fica escrita no próprio nó "Token de Verificação Correto?".
3. **A mensagem chegava pela segunda saída do Webhook** e o código lia a primeira. Corrigido.
4. **OpenAI demorou demais uma vez.** Agora são 3 tentativas antes de desistir.

Durante esses ajustes a v3 voltou ao ar por alguns minutos; nenhuma mensagem de cliente real se
perdeu (só as de teste passaram pelo fluxo).

## O que você precisa fazer

### Instagram (já no ar)

1. No nó **Configurações**, preencha `emailEquipe` para receber os avisos de transferência.
2. Só se for recadastrar o webhook na Meta: troque o texto `TROQUE-PELO-TOKEN-DE-VERIFICACAO-DA-META`
   no nó "Token de Verificação Correto?" pela senha de verificação cadastrada no app da Meta.
3. Depois de algumas mensagens reais, abra uma execução e veja `assinaturaValida` no nó
   "Separar Eventos". Se vier `true`, troque `modoAssinatura` para `bloquear`.

### WhatsApp (falta ligar)

O fluxo antigo ("receber mensagens fly control") aponta para o servidor
`empresarialconectfly.uazapi.com`, que hoje responde **503 — servidor fora do ar**. Ou seja, a Maya
do WhatsApp provavelmente não está funcionando agora.

1. Diga qual servidor e qual instância da UAZAPI são do WhatsApp da FlyControl (o painel usa
   `flycontrol.uazapi.com`).
2. No nó **Configurações** do fluxo do WhatsApp, preencha `uazapiUrl`, `uazapiToken`,
   `whatsappEquipe` (número que recebe os avisos) e `emailEquipe`.
3. Coloque o seu número em `numerosPermitidos` e troque `modoEnvio` para `real`. Assim só você fala
   com a 2.0.
4. Na UAZAPI, aponte o webhook da instância para o endereço do fluxo 2.0. Ative eventos de mensagem
   **sem** excluir "fromMe": é dele que a trava precisa.
5. Testou e gostou? Esvazie `numerosPermitidos` e desligue o fluxo antigo.

## Pontos de atenção

- O `#maya` aparece para o cliente, porque é uma mensagem normal.
- Enquanto a equipe conduz a conversa, o que o cliente escreve não entra na memória da Maya.
- Reunião: a Maya não consulta agenda; ela coleta a preferência e transfere.
- O token da UAZAPI fica dentro do nó Configurações, como no fluxo antigo. O ideal é guardá-lo como
  credencial do n8n.
- Áudio e imagem reais só dá para conferir com mensagens de verdade.
