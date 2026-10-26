# Maya 2.0 no Instagram Direct (n8n)

Fluxo no n8n: **"instagram mensagens - MAYA 2.0"** (id `tFGrw9RxPg2OLolo`).
Cópia de segurança deste fluxo: `docs/fluxo-n8n-instagram-maya-2.0.json`
(o endereço do webhook foi tirado da cópia de propósito).

## O que estava errado na v3

| Problema na v3 | Na prática | Como ficou na 2.0 |
|---|---|---|
| Mensagem "from me" (equipe respondendo) só era ignorada naquele momento | A equipe respondia o cliente e, na mensagem seguinte do cliente, a Maya entrava por cima da conversa | A Maya fica calada naquela conversa por 6 h, e o prazo renova a cada resposta da equipe |
| Não diferenciava a resposta da Maya da resposta da equipe | — | Cada mensagem que a Maya envia fica marcada; o eco dela não trava nada |
| "Precisa de humano?" tinha os dois caminhos ligados ao mesmo envio | A transferência não fazia nada: ninguém era avisado e a Maya continuava respondendo | A transferência cala a Maya e avisa a equipe por e-mail |
| Sem memória | A Maya esquecia o que o cliente tinha acabado de dizer | Memória por cliente (Redis, 30 dias, últimas 20 trocas) |
| Respondia cada mensagem picada | Cliente manda "oi" / "tudo bem?" / "quanto custa?" e recebe 3 respostas | Espera 8 s o cliente terminar de escrever e responde tudo de uma vez |
| Só lia o primeiro evento do pacote da Meta | Mensagens que chegavam juntas se perdiam | Lê todos |
| Sem proteção contra repetição | Quando a Meta reenvia o mesmo aviso, o cliente recebe a resposta duas vezes | Cada mensagem é atendida uma vez só |
| Não conferia a assinatura da Meta | Qualquer pessoa que descobrisse o endereço podia fazer a Maya mandar mensagens | Confere a assinatura (ver "modoAssinatura" abaixo) |
| Áudio e imagem recebiam resposta genérica | — | Áudio é transcrito, imagem e print de erro são descritos para a Maya |

## Novidades

- Comando **#maya**: a equipe manda uma mensagem contendo `#maya` no Direct do cliente e a Maya volta a atender na hora.
- "Digitando..." aparece enquanto a Maya pensa.
- Textos longos são divididos (o Instagram aceita até 1000 caracteres por mensagem).
- Se a Meta falhar no envio, tenta de novo até 3 vezes.
- Anti-loop: no máximo 8 mensagens por minuto por cliente (evita conversa infinita com outro robô).
- Data, hora e horário da equipe (07h–23h) chegam para a Maya, que avisa quando está fora do horário.
- Ficha do lead salva no Redis (`ig:lead:<id do cliente>`): nome, @, última mensagem, status.
- Instruções da Maya ganharam a seção 76, com as regras do Instagram (sem asteriscos, marca de transferência, reunião sem agenda).

## Como ligar

1. No n8n, abra o nó **Configurações** e preencha `emailEquipe` com o e-mail que recebe os avisos de transferência.
2. **Desative** o fluxo "instagram mensagens - MAYA v3".
3. **Ative** o "instagram mensagens - MAYA 2.0". O endereço do webhook é o mesmo; nada muda na Meta.
4. Mande uma mensagem de teste por outra conta do Instagram.

## Pontos de atenção

- **Assinatura da Meta**: começa em `modoAssinatura = avisar` (só registra). Abra uma execução e veja se o campo
  `assinaturaValida` no nó "Separar Eventos" aparece `true`. Se aparecer, troque para `bloquear`. Se aparecer
  `false` em mensagens reais, a chave guardada na credencial "Meta App Secret (Crypto)" não é a chave do
  aplicativo do Instagram. Nesse caso é preciso corrigir a chave antes de bloquear; senão a Maya para de responder.
- O comando `#maya` aparece para o cliente, porque é uma mensagem normal no Direct.
- Enquanto a equipe conduz a conversa, o que o cliente escreve não entra na memória da Maya.
- Reunião: a Maya não consulta agenda. Ela coleta a preferência do cliente e transfere para a equipe confirmar.
- Os testes foram feitos no n8n com dados simulados (cliente pedindo atendente, equipe respondendo pelo Instagram).
  Áudio e imagem reais só dá para conferir com mensagens reais depois de ligar.
