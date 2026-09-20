import { workflow, node, trigger, sticky, newCredential, ifElse, switchCase, splitInBatches, nextBatch, languageModel, memory, tool, expr } from '@n8n/workflow-sdk';

const chegouMensagem = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Chegou mensagem',
    position: [0, 96],
    notes: 'Cole a URL de Producao no FlyControl: Painel Admin > Clientes e Planos > Conexao > Endereco de entrada.',
    parameters: { httpMethod: 'POST', path: 'flycontrol-ia-acai-deus-provera', options: {} }
  },
  output: [{ body: { message: { text: 'quero um acai', chatid: '5571999999999@s.whatsapp.net', messageType: 'conversation', messageid: 'ABC123', fromMe: false }, chat: { lead_name: 'Cliente' } } }]
});

const dadosDaMensagem = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Dados da mensagem',
    position: [224, 96],
    notes: 'A senha desta loja e o endereco do FlyControl. O resto e lido do que a UAZAPI mandou.',
    parameters: {
      assignments: {
        assignments: [
          { id: 'd0', name: 'fly_base', type: 'string', value: 'https://flycontrol.conectfly.com.br' },
          { id: 'd1', name: 'tenant_id', type: 'string', value: 'f73c7dab-b849-4221-8047-4ac0fa6a3982' },
          { id: 'd2', name: 'token', type: 'string', value: 'COLE-AQUI-A-SENHA-DESTA-LOJA' },
          { id: 'd9', name: 'chave_mestra', type: 'string', value: 'COLE-AQUI-A-CHAVE-MESTRA-CRM_N8N_SECRET' },
          { id: 'd6', name: 'from_me', type: 'boolean', value: expr('{{ $json.body.message?.fromMe === true }}') },
          { id: 'd3', name: 'celular', type: 'string', value: expr('{{ ($json.body.message?.chatid || $json.body.chat?.wa_chatid || $json.body.chat?.phone || "").toString().split("@")[0].replace(/\\D/g, "") }}') },
          { id: 'd4', name: 'nome', type: 'string', value: expr('{{ ($json.body.chat?.lead_fullName || $json.body.chat?.lead_name || $json.body.chat?.name || $json.body.chat?.wa_name || $json.body.chat?.wa_contactName || ($json.body.message?.fromMe === true ? "" : ($json.body.message?.senderName || "")) || "").toString().trim() }}') },
          { id: 'd5', name: 'texto', type: 'string', value: expr('{{ $json.body.message?.text || "" }}') },
          { id: 'd7', name: 'tipo', type: 'string', value: expr('{{ ($json.body.message?.messageType || "").toString().toLowerCase() }}') },
          { id: 'd8', name: 'messageid', type: 'string', value: expr('{{ $json.body.message?.messageid || "" }}') },
          { id: 'd10', name: 'familia', type: 'string', value: expr('{{ (() => { const t = ($json.body.message?.messageType || "").toString().toLowerCase().trim(); if (!t) return "texto"; if (t.includes("image") || t.includes("sticker")) return "image"; if (t.includes("audio") || t === "ptt" || t.includes("voice")) return "audio"; if (t.includes("video")) return "video"; if (t.includes("document")) return "document"; return "texto"; })() }}') },
          { id: 'd11', name: 'fileURL', type: 'string', value: expr('{{ $json.body.message?.fileURL || "" }}') }
        ]
      },
      options: {}
    }
  },
  output: [{ fly_base: 'https://flycontrol.conectfly.com.br', tenant_id: 'f73c7dab-b849-4221-8047-4ac0fa6a3982', token: 'COLE-AQUI-A-SENHA-DESTA-LOJA', chave_mestra: 'COLE-AQUI-A-CHAVE-MESTRA-CRM_N8N_SECRET', from_me: false, celular: '5571999999999', nome: 'Cliente', texto: 'quero um acai', tipo: 'conversation', messageid: 'ABC123', familia: 'texto', fileURL: '' }]
});

const registrarNoFlyControl = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Registrar no FlyControl',
    position: [448, 96],
    notes: 'A conversa aparece na aba Chat do painel. A resposta traz a chave do aparelho, usada para baixar audio e imagem.',
    parameters: {
      method: 'POST',
      url: expr('{{ $json.fly_base }}/api/crm/inbox'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Authorization', value: expr('Bearer {{ $json.chave_mestra }}') }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ tenant_id: $json.tenant_id, token: $json.token, phone: $json.celular, name: $json.nome, message: $json.texto, external_id: $json.messageid, from_me: $json.from_me, media_type: $json.familia === "texto" ? null : $json.familia, media_url: $json.fileURL || null }) }}'),
      options: { response: { response: { neverError: true } }, timeout: 15000 }
    }
  },
  output: [{ success: true, uazapi: { baseUrl: 'https://api.uazapi.com', instanceToken: 'xxx' } }]
});

const pausarIa = node({
  type: 'n8n-nodes-base.redis',
  version: 1,
  config: {
    name: 'Pausar a IA por 1 hora',
    position: [896, 0],
    notes: 'O dono respondeu pelo celular dele: a IA se cala por 1 hora nessa conversa. Dois atendendo ao mesmo tempo confunde o cliente.',
    credentials: { redis: { id: '7Fl44abHBi0yjPHM', name: 'CRM FLY CONTROL' } },
    parameters: {
      operation: 'set',
      key: expr('fly_{{ $("Dados da mensagem").item.json.tenant_id }}_{{ $("Dados da mensagem").item.json.celular }}_pausa'),
      value: 'true',
      expire: true,
      ttl: 3600
    }
  },
  output: [{ ok: true }]
});

const iaPausada = node({
  type: 'n8n-nodes-base.redis',
  version: 1,
  config: {
    name: 'A IA esta pausada?',
    position: [896, 192],
    credentials: { redis: { id: '7Fl44abHBi0yjPHM', name: 'CRM FLY CONTROL' } },
    parameters: {
      operation: 'get',
      propertyName: 'pausada',
      key: expr('fly_{{ $("Dados da mensagem").item.json.tenant_id }}_{{ $("Dados da mensagem").item.json.celular }}_pausa'),
      options: { dotNotation: false }
    }
  },
  output: [{ pausada: null }]
});

const foiOAtendente = ifElse({
  version: 2.2,
  config: {
    name: 'Foi o atendente?',
    position: [672, 96],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 1 },
        conditions: [{ leftValue: expr('{{ $("Dados da mensagem").item.json.from_me }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      },
      looseTypeValidation: true,
      options: {}
    }
  }
});

const podeResponder = ifElse({
  version: 2.2,
  config: {
    name: 'Pode responder?',
    position: [1120, 192],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 1 },
        conditions: [{ leftValue: expr('{{ $json.pausada }}'), operator: { type: 'string', operation: 'notEquals' }, rightValue: 'true' }],
        combinator: 'and'
      },
      looseTypeValidation: true,
      options: {}
    }
  }
});

const queTipoDeMensagem = switchCase({
  version: 3.2,
  config: {
    name: 'Que tipo de mensagem?',
    position: [1344, 176],
    notes: 'Audio vira texto, imagem vira descricao, o resto segue como texto.',
    parameters: {
      rules: {
        values: [
          { outputKey: 'audio', conditions: { combinator: 'and', conditions: [{ leftValue: expr('{{ $("Dados da mensagem").item.json.familia }}'), operator: { operation: 'equals', type: 'string' }, rightValue: 'audio' }], options: { caseSensitive: false, leftValue: '', typeValidation: 'loose', version: 1 } } },
          { outputKey: 'imagem', conditions: { combinator: 'and', conditions: [{ leftValue: expr('{{ $("Dados da mensagem").item.json.familia }}'), operator: { operation: 'equals', type: 'string' }, rightValue: 'image' }], options: { caseSensitive: false, leftValue: '', typeValidation: 'loose', version: 1 } } }
        ]
      },
      options: { fallbackOutput: 'extra', renameFallbackOutput: 'texto' }
    }
  }
});

const pegarAudio = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Pegar audio',
    position: [1568, 0],
    parameters: {
      method: 'POST',
      url: expr('{{ $("Registrar no FlyControl").first().json.uazapi.baseUrl }}/message/download'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'token', value: expr('{{ $("Registrar no FlyControl").first().json.uazapi.instanceToken }}') }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ id: $("Dados da mensagem").item.json.messageid }) }}'),
      options: { timeout: 20000 }
    }
  },
  output: [{ fileURL: 'https://arquivo.uazapi.com/audio.ogg' }]
});

const baixarAudio = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Baixar audio',
    position: [1792, 0],
    parameters: { url: expr('{{ $json.fileURL }}'), options: { timeout: 30000 } }
  },
  output: [{ data: 'binario' }]
});

const transcreverAudio = node({
  type: '@n8n/n8n-nodes-langchain.openAi',
  version: 2.3,
  config: {
    name: 'Transcrever audio',
    position: [2016, 0],
    credentials: { openAiApi: { id: 'L64gVmop4Jr2m2mv', name: 'OpenAI account 2' } },
    parameters: { resource: 'audio', operation: 'transcribe', options: {} }
  },
  output: [{ text: 'quero um acai de quinhentos com leite em po' }]
});

const textoDoAudio = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Texto do audio',
    position: [2240, 0],
    parameters: { assignments: { assignments: [{ id: 'a1', name: 'conteudo', type: 'string', value: expr('{{ $json.text }}') }] }, options: {} }
  },
  output: [{ conteudo: 'quero um acai de quinhentos com leite em po' }]
});

const pegarImagem = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Pegar imagem',
    position: [1568, 192],
    parameters: {
      method: 'POST',
      url: expr('{{ $("Registrar no FlyControl").first().json.uazapi.baseUrl }}/message/download'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'token', value: expr('{{ $("Registrar no FlyControl").first().json.uazapi.instanceToken }}') }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ id: $("Dados da mensagem").item.json.messageid }) }}'),
      options: { timeout: 20000 }
    }
  },
  output: [{ fileURL: 'https://arquivo.uazapi.com/foto.jpg' }]
});

const baixarImagem = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Baixar imagem',
    position: [1792, 192],
    parameters: { url: expr('{{ $json.fileURL }}'), options: { timeout: 30000 } }
  },
  output: [{ data: 'binario' }]
});

const descreverImagem = node({
  type: '@n8n/n8n-nodes-langchain.openAi',
  version: 2.3,
  config: {
    name: 'Descrever imagem',
    position: [2016, 192],
    credentials: { openAiApi: { id: 'L64gVmop4Jr2m2mv', name: 'OpenAI account 2' } },
    parameters: {
      resource: 'image',
      operation: 'analyze',
      modelId: { __rl: true, value: 'gpt-4o-mini', mode: 'list', cachedResultName: 'GPT-4O-MINI' },
      text: 'Descreva a imagem em poucas palavras. Se for um comprovante de pagamento (PIX), leia o valor e a data. Se for um print do cardapio ou de um pedido, liste os itens e os complementos que aparecem.',
      inputType: 'base64',
      options: {}
    }
  },
  output: [{ content: [{ text: 'um comprovante de PIX de R$ 25,00' }] }]
});

const textoDaImagem = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Texto da imagem',
    position: [2240, 192],
    parameters: { assignments: { assignments: [{ id: 'i1', name: 'conteudo', type: 'string', value: expr('O cliente enviou uma imagem. Descricao: {{ $json.content?.[0]?.text || $json.text || "" }}') }] }, options: {} }
  },
  output: [{ conteudo: 'O cliente enviou uma imagem. Descricao: um comprovante de PIX de R$ 25,00' }]
});

const textoDireto = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Texto direto',
    position: [2240, 384],
    parameters: { assignments: { assignments: [{ id: 't1', name: 'conteudo', type: 'string', value: expr('{{ $("Dados da mensagem").item.json.texto || ($("Dados da mensagem").item.json.familia === "texto" ? "" : "O cliente enviou um arquivo do tipo " + $("Dados da mensagem").item.json.familia + ". Diga que voce nao consegue abrir esse tipo de arquivo por aqui e peca para ele escrever, mandar foto ou mandar audio.") }}') }] }, options: {} }
  },
  output: [{ conteudo: 'quero um acai' }]
});

const anexarAoPainel = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Anexar ao painel',
    position: [2464, 32],
    onError: 'continueRegularOutput',
    notes: 'Conta ao painel o que a IA entendeu do audio ou da foto. O balao deixa de ficar em branco. Se falhar, a conversa segue.',
    parameters: {
      method: 'POST',
      url: expr('{{ $("Dados da mensagem").item.json.fly_base }}/api/crm/message-media'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Authorization', value: expr('Bearer {{ $("Dados da mensagem").item.json.chave_mestra }}') }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ tenant_id: $("Dados da mensagem").item.json.tenant_id, token: $("Dados da mensagem").item.json.token, external_id: $("Dados da mensagem").item.json.messageid, media_type: $("Dados da mensagem").item.json.familia, media_url: (() => { try { return $("Pegar audio").item.json.fileURL || "" } catch (e) { } try { return $("Pegar imagem").item.json.fileURL || "" } catch (e) { } return $("Dados da mensagem").item.json.fileURL || null })(), transcricao: $json.conteudo }) }}'),
      options: { response: { response: { neverError: true } }, timeout: 15000 }
    }
  },
  output: [{ success: true }]
});

const guardarNaListaDeEspera = node({
  type: 'n8n-nodes-base.redis',
  version: 1,
  config: {
    name: 'Guardar na lista de espera',
    position: [2464, 288],
    notes: 'O cliente manda a frase em pedacos. Em vez de responder cada pedaco, guardamos e esperamos ele terminar.',
    credentials: { redis: { id: '7Fl44abHBi0yjPHM', name: 'CRM FLY CONTROL' } },
    parameters: {
      operation: 'push',
      list: expr('fly_{{ $("Dados da mensagem").item.json.tenant_id }}_{{ $("Dados da mensagem").item.json.celular }}_buffer'),
      messageData: expr('{{ $json.conteudo }}'),
      tail: true
    }
  },
  output: [{ conteudo: 'quero um acai' }]
});

const esperar15Segundos = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: { name: 'Esperar 15 segundos', position: [2688, 288], parameters: { amount: 15 } },
  output: [{ conteudo: 'quero um acai' }]
});

const lerListaDeEspera = node({
  type: 'n8n-nodes-base.redis',
  version: 1,
  config: {
    name: 'Ler a lista de espera',
    position: [2912, 288],
    credentials: { redis: { id: '7Fl44abHBi0yjPHM', name: 'CRM FLY CONTROL' } },
    parameters: {
      operation: 'get',
      propertyName: 'mensagens',
      key: expr('fly_{{ $("Dados da mensagem").item.json.tenant_id }}_{{ $("Dados da mensagem").item.json.celular }}_buffer'),
      options: {}
    }
  },
  output: [{ mensagens: ['quero um acai'] }]
});

const foiAUltima = ifElse({
  version: 2.2,
  config: {
    name: 'Foi a ultima?',
    position: [3136, 288],
    notes: 'So a ultima execucao segue. As anteriores morrem aqui, senao a IA responderia uma vez por pedaco.',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 1 },
        conditions: [{ leftValue: expr('{{ $json.mensagens?.last() }}'), operator: { type: 'string', operation: 'equals' }, rightValue: expr('{{ $("Guardar na lista de espera").item.json.conteudo }}') }],
        combinator: 'and'
      },
      looseTypeValidation: true,
      options: {}
    }
  }
});

const limparALista = node({
  type: 'n8n-nodes-base.redis',
  version: 1,
  config: {
    name: 'Limpar a lista',
    position: [3360, 288],
    credentials: { redis: { id: '7Fl44abHBi0yjPHM', name: 'CRM FLY CONTROL' } },
    parameters: {
      operation: 'delete',
      key: expr('fly_{{ $("Dados da mensagem").item.json.tenant_id }}_{{ $("Dados da mensagem").item.json.celular }}_buffer')
    }
  },
  output: [{ ok: true }]
});

const juntarAsMensagens = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Juntar as mensagens',
    position: [3584, 288],
    parameters: { assignments: { assignments: [{ id: 'j1', name: 'pergunta', type: 'string', value: expr('{{ $("Ler a lista de espera").item.json.mensagens.join(" ") }}') }] }, options: {} }
  },
  output: [{ pergunta: 'quero um acai de 500ml' }]
});

const situacaoDaLoja = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Situacao da loja',
    position: [3808, 288],
    notes: 'O que a loja vende AGORA. Item sem estoque nao vem na lista, entao a IA nao tem como oferecer.',
    parameters: {
      method: 'POST',
      url: expr('{{ $("Dados da mensagem").first().json.fly_base }}/api/crm/products'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Authorization', value: expr('Bearer {{ $("Dados da mensagem").first().json.chave_mestra }}') }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ tenant_id: $("Dados da mensagem").first().json.tenant_id, token: $("Dados da mensagem").first().json.token }) }}'),
      options: { timeout: 15000 }
    }
  },
  output: [{ success: true, loja: { nome: 'Acai Deus provera', tipo: 'Acaiteria', aberta: true, faz_entrega: true } }]
});

const fichaDoCliente = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Ficha do cliente',
    position: [4032, 288],
    notes: 'Nome, foto de perfil, quantos pedidos ja fez e quanto gastou. Atender sabendo quem esta do outro lado e outro atendimento.',
    parameters: {
      method: 'POST',
      url: expr('{{ $("Dados da mensagem").first().json.fly_base }}/api/crm/customer'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Authorization', value: expr('Bearer {{ $("Dados da mensagem").first().json.chave_mestra }}') }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ tenant_id: $("Dados da mensagem").first().json.tenant_id, token: $("Dados da mensagem").first().json.token, phone: $("Dados da mensagem").first().json.celular }) }}'),
      options: { response: { response: { neverError: true } }, timeout: 15000 }
    }
  },
  output: [{ success: true, texto: 'Cliente novo, primeira conversa.' }]
});

const modeloDeLinguagem = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  version: 1.2,
  config: {
    name: 'Modelo de linguagem',
    position: [4272, 528],
    credentials: { openAiApi: { id: 'L64gVmop4Jr2m2mv', name: 'OpenAI account 2' } },
    parameters: { model: { __rl: true, value: 'gpt-4.1-mini', mode: 'list', cachedResultName: 'gpt-4.1-mini' }, options: {} }
  }
});

const memoriaDaConversa = memory({
  type: '@n8n/n8n-nodes-langchain.memoryRedisChat',
  version: 1.4,
  config: {
    name: 'Memoria da conversa',
    position: [4400, 528],
    credentials: { redis: { id: '7Fl44abHBi0yjPHM', name: 'CRM FLY CONTROL' } },
    parameters: {
      sessionIdType: 'customKey',
      sessionKey: expr('fly_{{ $("Dados da mensagem").first().json.tenant_id }}_{{ $("Dados da mensagem").first().json.celular }}'),
      sessionTTL: 86400,
      contextWindowLength: 15
    }
  }
});

const consultarProdutos = tool({
  type: 'n8n-nodes-base.httpRequestTool',
  version: 4.5,
  config: {
    name: 'consultar_produtos',
    position: [4512, 592],
    notes: 'A IA pesquisa o produto na hora e recebe o preco REAL do cardapio, junto com a lista de complementos.',
    parameters: {
      toolDescription: 'Consulta o cardapio REAL da acaiteria e devolve nome, descricao e PRECO REAL, ja considerando o estoque. A resposta com busca VAZIA traz tambem a LISTA DE COMPLEMENTOS (leite em po, granola, Nutella, pacoca e afins). Use SEMPRE antes de falar de preco, tamanho, sabor, complemento ou dizer se tem. Mande o parametro busca com o nome (ou parte do nome) do produto. Para ver o CARDAPIO INTEIRO e os COMPLEMENTOS, mande busca como texto VAZIO. Nunca invente preco, produto nem complemento.',
      method: 'POST',
      url: expr('{{ $("Dados da mensagem").first().json.fly_base }}/api/crm/products'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Authorization', value: expr('Bearer {{ $("Dados da mensagem").first().json.chave_mestra }}') }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ tenant_id: $("Dados da mensagem").first().json.tenant_id, token: $("Dados da mensagem").first().json.token, busca: $fromAI("busca", "Nome ou parte do nome do produto. Deixe VAZIO para receber o cardapio inteiro e a lista de complementos.", "string") }) }}'),
      options: { response: { response: { neverError: true } }, timeout: 15000 }
    }
  }
});

const calcularTaxaEntrega = tool({
  type: 'n8n-nodes-base.httpRequestTool',
  version: 4.5,
  config: {
    name: 'calcular_taxa_entrega',
    position: [4672, 592],
    notes: 'Taxa por bairro, das zonas que o lojista cadastrou. Bairro fora da tabela NAO vira chute: a resposta manda chamar um humano.',
    parameters: {
      toolDescription: 'Diz quanto custa entregar em um bairro, usando as taxas que a loja cadastrou. Use antes de informar qualquer valor de entrega. Para ver TODOS OS BAIRROS onde a loja entrega, quando o cliente perguntar "voces entregam aqui?" ou "onde voces entregam?", mande bairro como texto VAZIO. Se o bairro nao estiver cadastrado, NAO invente: avise que vai confirmar e chame um atendente.',
      method: 'POST',
      url: expr('{{ $("Dados da mensagem").first().json.fly_base }}/api/crm/delivery-fee'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Authorization', value: expr('Bearer {{ $("Dados da mensagem").first().json.chave_mestra }}') }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ tenant_id: $("Dados da mensagem").first().json.tenant_id, token: $("Dados da mensagem").first().json.token, bairro: $fromAI("bairro", "Bairro de entrega informado pelo cliente. Deixe VAZIO para receber a lista de todos os bairros atendidos.", "string") }) }}'),
      options: { response: { response: { neverError: true } }, timeout: 15000 }
    }
  }
});

const fazerPedido = tool({
  type: 'n8n-nodes-base.httpRequestTool',
  version: 4.5,
  config: {
    name: 'fazer_pedido',
    position: [4800, 560],
    notes: 'Monta o pedido. Mande SO nome, quantidade e os complementos na observacao: o preco e a conta sao feitos pelo FlyControl.',
    parameters: {
      toolDescription: 'Faz o pedido do cliente. O pedido vai DIRETO para a loja, ja valendo. Envie APENAS nome, quantidade e observacao de cada item — a observacao e onde vao os COMPLEMENTOS do acai (leite em po, granola, Nutella e afins) e pedidos especiais. O preco e o total sao calculados pelo sistema, nunca por voce. So chame depois que o cliente confirmar os itens e os complementos. Se o cliente MUDAR o pedido, chame de novo: atualiza o mesmo pedido em vez de criar outro.',
      method: 'POST',
      url: expr('{{ $("Dados da mensagem").first().json.fly_base }}/api/crm/order'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Authorization', value: expr('Bearer {{ $("Dados da mensagem").first().json.chave_mestra }}') }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ tenant_id: $(\"Dados da mensagem\").first().json.tenant_id, token: $(\"Dados da mensagem\").first().json.token, phone: $(\"Dados da mensagem\").first().json.celular, itens: $fromAI('itens', 'Lista JSON dos itens confirmados, com nome, quantidade e observacao. A observacao e onde vao os complementos do acai. Exemplo: [{\\\"nome\\\":\\\"Acai na Garrafa com Nutella 500ml\\\",\\\"quantidade\\\":1,\\\"observacao\\\":\\\"com granola, leite em po e leite condensado\\\"}]', 'string'), endereco: $fromAI('endereco', 'Endereco completo de entrega, ou vazio se for retirada no balcao', 'string'), bairro: $fromAI('bairro', 'Bairro da entrega, ou vazio', 'string'), retirada: $fromAI('retirada', 'true se o cliente vai retirar no balcao, false se e entrega', 'boolean'), forma_pagamento: $fromAI('forma_pagamento', 'Como o cliente vai pagar: pix, dinheiro, cartao', 'string'), observacoes: $fromAI('observacoes', 'Observacoes gerais do pedido, como ponto de referencia ou troco. Vazio se nao houver', 'string') }) }}"),
      options: { response: { response: { neverError: true } }, timeout: 20000 }
    }
  }
});

const consultarPedido = tool({
  type: 'n8n-nodes-base.httpRequestTool',
  version: 4.5,
  config: {
    name: 'consultar_pedido',
    position: [4992, 560],
    notes: 'Responde "e o meu pedido?" sozinha. Busca so os pedidos do telefone DESTA conversa.',
    parameters: {
      toolDescription: 'Diz em que pe esta o pedido do cliente: recebido, em preparo, saiu para entrega, entregue ou cancelado. Use sempre que ele perguntar do pedido. NAO prometa horario de entrega — isso voce nao sabe.',
      method: 'POST',
      url: expr('{{ $("Dados da mensagem").first().json.fly_base }}/api/crm/order-status'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Authorization', value: expr('Bearer {{ $("Dados da mensagem").first().json.chave_mestra }}') }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ tenant_id: $("Dados da mensagem").first().json.tenant_id, token: $("Dados da mensagem").first().json.token, phone: $("Dados da mensagem").first().json.celular }) }}'),
      options: { response: { response: { neverError: true } }, timeout: 15000 }
    }
  }
});

const atendenteIa = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 1.9,
  config: {
    name: 'Atendente IA',
    position: [4512, 288],
    notes: 'A situacao da loja e a ficha do cliente entram no prompt a cada mensagem. O cardapio e os complementos ela busca na ferramenta.',
    parameters: {
      promptType: 'define',
      text: expr('{{ $("Juntar as mensagens").first().json.pergunta }}'),
      options: { systemMessage: expr("Você é a atendente virtual da {{ $(\"Situacao da loja\").first().json.loja.nome }} 🍇 — uma açaiteria — e atende os clientes pelo WhatsApp.\n\nSeu objetivo é ATENDER COM CARINHO, VENDER MAIS e DEIXAR A COMPRA FÁCIL.\n\nAja como uma excelente vendedora de açaiteria: simpática, rápida, atenciosa, natural, gulosa na hora de descrever, persuasiva sem ser insistente, e sempre conduzindo a conversa até virar pedido.\n\n━━━━━━━━━━━━━━━━━━━━\n👤 QUEM ESTÁ FALANDO COM VOCÊ\n━━━━━━━━━━━━━━━━━━━━\n\n{{ $(\"Ficha do cliente\").first().json.texto }}\n\nUse essas informações para entender o cliente e conduzir melhor a conversa.\n\nSe ele já comprou antes, trate como cliente de casa:\n\"Vai querer o de sempre hoje? 😋\"\n\nNão invente histórico de compras. Só use o que estiver escrito acima.\n\n━━━━━━━━━━━━━━━━━━━━\n🏪 SITUAÇÃO DA LOJA AGORA\n━━━━━━━━━━━━━━━━━━━━\n\nAberta: {{ $(\"Situacao da loja\").first().json.loja.aberta ? \"SIM\" : \"NAO\" }}\n\nFaz entrega: {{ $(\"Situacao da loja\").first().json.loja.faz_entrega ? \"SIM\" : \"NAO\" }}\n\nSe a loja estiver FECHADA:\n\n* avise o cliente ANTES de tentar montar qualquer pedido;\n* seja carinhosa;\n* não prometa horário de abertura nem de entrega;\n* aproveite para mostrar opções, para ele já ir escolhendo.\n\nExemplo:\n\"A gente está fechadinha agora 😕 Mas posso te mostrar as opções pra você já deixar escolhido 🍇\"\n\n━━━━━━━━━━━━━━━━━━━━\n💬 COMO VOCÊ DEVE FALAR\n━━━━━━━━━━━━━━━━━━━━\n\nFale em Português do Brasil.\n\nSeu tom é:\n\n* simpático 😊\n* humano\n* acolhedor\n* gostoso de ler\n* comercial\n* confiante\n* objetivo\n* espontâneo\n\nEscreva como uma pessoa de verdade atendendo no WhatsApp.\n\nFrases curtas. NO MÁXIMO 3 PARÁGRAFOS CURTOS por resposta.\n\nSepare os parágrafos com uma linha em branco — cada parágrafo vira uma mensagem separada no WhatsApp.\n\nEmojis que combinam com você:\n🍇 🍨 🥣 🍫 🍓 🥜 🍌 🥥 🥤 😋 😍 🔥 ❤️ ✨ 🛵 📦 👌 🙏\n\nUse com naturalidade, sem colocar emoji em toda frase.\n\nNunca fale como robô. Nunca diga que é um robô ou inteligência artificial, a menos que perguntem diretamente.\n\nNÃO diga:\n\"Como posso processar sua solicitação?\"\n\"Seu pedido foi encaminhado ao sistema.\"\n\"Estou verificando em meu banco de dados.\"\n\nPREFIRA:\n\"Claro! 😋\"\n\"Vou conferir pra você 👌\"\n\"Temos sim! 🔥\"\n\"Boa escolha! 😍\"\n\n━━━━━━━━━━━━━━━━━━━━\n🍇 O JEITO CERTO DE MONTAR UM AÇAÍ\n━━━━━━━━━━━━━━━━━━━━\n\nAçaí é venda de montagem: o cliente escolhe o item e depois recheia. Conduza nesta ordem, uma pergunta de cada vez:\n\n1. QUAL O ITEM — use consultar_produtos para ver o que existe (garrafa, vitamina, tamanho, sabor). Nunca invente tamanho nem sabor.\n2. OS COMPLEMENTOS — pergunte o que ele quer por cima.\n3. ALGO PARA ACOMPANHAR — uma porção, um lanche, uma bebida.\n4. ENTREGA OU RETIRADA.\n5. FORMA DE PAGAMENTO.\n6. FECHAR O PEDIDO com fazer_pedido.\n\nNunca despeje tudo de uma vez. Uma pergunta por mensagem, como uma atendente faria no balcão.\n\nExemplo:\n\nCliente: \"Quero um açaí\"\n\nVocê:\n\"Aeee 🍇 Temos algumas opções bem gostosas! Vou te dizer as que tem agora 😋\"\n\n(consulta consultar_produtos e apresenta 3 ou 4 opções)\n\nDepois:\n\"Fechou! 😍 Agora me diz: quais complementos você quer por cima?\"\n\nDepois:\n\"Perfeito! Vai ser entrega ou você vem buscar? 🛵\"\n\n━━━━━━━━━━━━━━━━━━━━\n🍫 COMPLEMENTOS (A PARTE MAIS IMPORTANTE)\n━━━━━━━━━━━━━━━━━━━━\n\nNunca feche um açaí sem perguntar os complementos. Açaí sem recheio escolhido é reclamação na certa.\n\nVocê NÃO sabe de cor quais complementos a loja tem. Para saber, chame consultar_produtos com busca VAZIA: a resposta traz a lista de complementos junto com o cardápio.\n\nOfereça no máximo 5 ou 6 por vez, os mais queridinhos, e diga que tem mais:\n\n\"Temos leite em pó, leite condensado, granola, paçoca, Nutella e morango, entre outros 🍫 Quais você quer?\"\n\nSe o cliente disser \"pode botar o que você achar bom\", escolha 3 complementos que existam na lista e confirme:\n\"Vou caprichar então: leite em pó, granola e leite condensado 😋 Pode ser assim?\"\n\nNUNCA ofereça complemento que não apareceu na ferramenta. Prometer Nutella e a loja não ter é decepção na porta do cliente.\n\nQuando for fazer o pedido, escreva os complementos escolhidos no campo observacao daquele item.\n\n━━━━━━━━━━━━━━━━━━━━\n🍟 A LOJA NÃO VENDE SÓ AÇAÍ\n━━━━━━━━━━━━━━━━━━━━\n\nAlém de açaí e vitaminas, a loja também tem lanches, marmitas e porções.\n\nSe o cliente pedir comida salgada, atenda normalmente — consulte consultar_produtos e siga o mesmo caminho.\n\nNunca diga \"aqui só vendemos açaí\".\n\n━━━━━━━━━━━━━━━━━━━━\n💰 AUMENTAR O PEDIDO, COM JEITO\n━━━━━━━━━━━━━━━━━━━━\n\nSempre que houver oportunidade REAL, faça UMA sugestão complementar por vez:\n\n🍇 Açaí → sugerir um complemento extra ou uma bebida gelada.\n🥤 Vitamina → sugerir um lanche ou uma porção.\n🍟 Porção → sugerir uma bebida.\n🍔 Lanche → sugerir batata ou bebida.\n👨‍👩‍👧 Pedido grande → perguntar se quer levar mais um para alguém de casa.\n\nExemplo:\n\"Esse combina demais com uma batatinha 🍟 Quer acrescentar?\"\n\nSe recusar:\n\"Tranquilo 😊 Vamos só com o açaí então.\"\n\nNão insista. Não ofereça vários produtos de uma vez. Não invente combo, promoção nem desconto.\n\n━━━━━━━━━━━━━━━━━━━━\n🎯 CLIENTE INDECISO\n━━━━━━━━━━━━━━━━━━━━\n\nQuando ele disser \"não sei\", \"me indica\", \"o que você recomenda\", \"qual o melhor\":\n\nPrimeiro consulte consultar_produtos. Depois recomende 2 ou 3 opções que EXISTAM.\n\nNão despeje o cardápio inteiro.\n\nExemplo:\n\"Tenho umas opções que saem muito 😍 Tem uma mais docinha, uma mais reforçada e uma bem completa. Quer que eu te diga os valores?\"\n\nNunca diga que um produto é \"o mais vendido\" ou \"o queridinho da casa\" se a ferramenta não disse isso.\n\n━━━━━━━━━━━━━━━━━━━━\n📋 CARDÁPIO E PRODUTOS\n━━━━━━━━━━━━━━━━━━━━\n\nREGRA OBRIGATÓRIA: você NÃO tem o cardápio decorado.\n\nAntes de falar de produto, preço, tamanho, sabor, complemento, disponibilidade, combo ou promoção, chame consultar_produtos.\n\nSe o cliente pedir \"me manda o cardápio\", \"o que vocês têm?\", \"qual o menu?\", chame consultar_produtos com busca VAZIA.\n\nQuando receber o cardápio inteiro, NÃO mande tudo. Apresente 3 ou 4 opções e pergunte qual combina mais com ele.\n\n━━━━━━━━━━━━━━━━━━━━\n💵 PREÇOS\n━━━━━━━━━━━━━━━━━━━━\n\nNunca invente preço. Sempre consulte consultar_produtos antes de dizer qualquer valor.\n\nSe o cliente disser um preço e perguntar se está certo (\"o açaí não é 15?\"), consulte a ferramenta e use EXATAMENTE o valor que ela devolver.\n\n━━━━━━━━━━━━━━━━━━━━\n🛵 ENTREGA\n━━━━━━━━━━━━━━━━━━━━\n\nAntes de informar qualquer valor de entrega, use calcular_taxa_entrega.\n\nSe ele informar o bairro, consulte com o bairro. Se ele perguntar onde vocês entregam sem dizer o bairro, consulte com bairro VAZIO.\n\nNunca invente bairro atendido. Nunca invente taxa.\n\nSe o bairro não estiver cadastrado:\n\"Vou chamar alguém da equipe pra confirmar a entrega pra você 😊\"\nE pare de tentar resolver.\n\nSe a ferramenta disser que a loja não cadastrou nenhum bairro: não prometa entrega, peça o endereço, avise que um atendente confirma o valor e chame um atendente.\n\n━━━━━━━━━━━━━━━━━━━━\n📍 ENTREGA OU RETIRADA\n━━━━━━━━━━━━━━━━━━━━\n\nQuando for preciso para fechar o pedido, pergunte se é:\n\n🛵 Entrega\nou\n🏪 Retirada na loja\n\nNão pergunte de novo o que ele já respondeu.\n\n━━━━━━━━━━━━━━━━━━━━\n🛒 FECHAMENTO DA VENDA\n━━━━━━━━━━━━━━━━━━━━\n\nReconheça os sinais de que ele quer fechar:\n\n\"pode fazer\", \"manda\", \"pode mandar\", \"é isso\", \"confirma\", \"fechou\", \"quero esse\", \"pode pedir\", \"vou querer\", \"isso mesmo\"\n\nQuando ele já informou os itens e confirmou: CHAME fazer_pedido IMEDIATAMENTE.\n\nNão peça confirmação de novo. Não diga \"tem certeza?\", \"posso confirmar?\", \"você confirma o pedido?\".\n\nSó faça mais perguntas se faltar algo realmente necessário:\n\n* qual produto;\n* quantidade;\n* complementos do açaí;\n* entrega ou retirada;\n* endereço, quando for entrega;\n* forma de pagamento.\n\n━━━━━━━━━━━━━━━━━━━━\n🧾 COMO USAR fazer_pedido\n━━━━━━━━━━━━━━━━━━━━\n\nA ferramenta fazer_pedido manda o pedido DIRETO para a loja, e ele passa a valer.\n\nEnvie, de cada item:\n\n* nome do produto, EXATAMENTE como veio de consultar_produtos;\n* quantidade;\n* observacao, com os complementos e pedidos especiais daquele item.\n\nExemplo de observacao: \"com leite em pó, granola e leite condensado, sem banana\".\n\nNUNCA mande preço. O valor é calculado pelo sistema da loja, nunca por você.\n\nSe o cliente mudar o pedido depois, CHAME fazer_pedido DE NOVO: isso atualiza o mesmo pedido, em vez de criar outro.\n\n━━━━━━━━━━━━━━━━━━━━\n🚨 REGRA ABSOLUTA SOBRE PEDIDOS\n━━━━━━━━━━━━━━━━━━━━\n\nSÓ diga que o pedido foi feito se fazer_pedido devolver um NÚMERO DE PEDIDO.\n\nSe voltar \"NAO DEU CERTO\" ou qualquer resposta sem número de pedido, o pedido NÃO EXISTE.\n\nNesse caso diga:\n\"Não consegui registrar seu pedido agora 😕 Vou chamar alguém da equipe pra te ajudar.\"\nE pare de tentar resolver.\n\nNUNCA diga \"pedido feito\", \"já está confirmado\" ou \"está tudo certo\" sem o número do pedido na mão.\n\n━━━━━━━━━━━━━━━━━━━━\n✅ DEPOIS DO PEDIDO\n━━━━━━━━━━━━━━━━━━━━\n\nQuando fazer_pedido devolver o número do pedido:\n\n1. avise que foi registrado;\n2. repita os itens e os complementos;\n3. informe o total que a ferramenta devolveu;\n4. informe o número do pedido.\n\nExemplo:\n\n\"Pedido registrado! 😍\n\n🍇 1 Açaí na Garrafa 500ml\n🍫 com leite em pó, granola e leite condensado\n\nTotal: R$ XX,XX\nPedido nº XXXX ❤️\"\n\nUse apenas os valores que a ferramenta devolveu. Não invente total.\n\n━━━━━━━━━━━━━━━━━━━━\n🔎 ACOMPANHAMENTO DO PEDIDO\n━━━━━━━━━━━━━━━━━━━━\n\nSempre que perguntarem \"e meu pedido?\", \"já saiu?\", \"cadê meu açaí?\", \"tá pronto?\", chame consultar_pedido.\n\nNunca invente status. Nunca diga que está \"a caminho\", \"sendo preparado\" ou \"pronto\" sem a ferramenta dizer.\n\n━━━━━━━━━━━━━━━━━━━━\n⏰ PRAZO E ❄️ DERRETIMENTO\n━━━━━━━━━━━━━━━━━━━━\n\nNunca invente horário. Nunca prometa \"chega em 30 minutos\", \"chega às 20h\" ou \"vai chegar rapidinho\".\n\nAçaí derrete: se o cliente perguntar sobre isso, pode dizer que a loja embala com cuidado e manda o quanto antes — mas NUNCA prometa tempo de entrega.\n\n━━━━━━━━━━━━━━━━━━━━\n🎧 ÁUDIO\n━━━━━━━━━━━━━━━━━━━━\n\nQuando o cliente mandar áudio, você recebe o que foi falado em texto. Responda normalmente.\n\nNunca diga \"não consigo ouvir áudio\". Não repita a transcrição sem necessidade.\n\n━━━━━━━━━━━━━━━━━━━━\n📸 FOTO\n━━━━━━━━━━━━━━━━━━━━\n\nQuando o cliente mandar foto, você recebe a descrição do que aparece nela. Responda normalmente.\n\nSe for comprovante de pagamento, agradeça e diga que a equipe vai conferir — você NÃO confirma pagamento sozinha.\n\nNão diga que não consegue ver a foto. Não repita a descrição sem necessidade.\n\n━━━━━━━━━━━━━━━━━━━━\n👨‍💼 QUANDO CHAMAR UM HUMANO\n━━━━━━━━━━━━━━━━━━━━\n\nChame um atendente humano na hora quando houver:\n\n* reclamação;\n* pedido que veio errado;\n* cobrança ou problema de pagamento;\n* comprovante de PIX para conferir;\n* troco;\n* cancelamento;\n* demora;\n* bairro sem taxa cadastrada;\n* falha de ferramenta;\n* qualquer coisa que você não resolva com segurança;\n* cliente pedindo para falar com alguém.\n\nUse:\n\"Vou chamar alguém da equipe pra te ajudar 😊\"\n\nE PARE de tentar resolver. Não fique repetindo perguntas.\n\n━━━━━━━━━━━━━━━━━━━━\n❌ CANCELAMENTO\n━━━━━━━━━━━━━━━━━━━━\n\nVocê NÃO cancela pedido. Quem verifica se já começou o preparo é uma pessoa da equipe.\n\n\"Vou chamar alguém da equipe pra verificar o cancelamento pra você 😊\"\n\nE pare.\n\n━━━━━━━━━━━━━━━━━━━━\n🚫 REGRAS CONTRA INVENÇÃO\n━━━━━━━━━━━━━━━━━━━━\n\nNunca invente:\n\npreço, produto, sabor, tamanho, complemento, disponibilidade, promoção, desconto, taxa, bairro atendido, prazo, horário, número de pedido, status do pedido, confirmação de pagamento, ou qualquer informação da operação.\n\nSe a informação depende de ferramenta, USE A FERRAMENTA. Se a ferramenta não deu a informação, não invente.\n\n━━━━━━━━━━━━━━━━━━━━\n🧠 MEMÓRIA DA CONVERSA\n━━━━━━━━━━━━━━━━━━━━\n\nPreste atenção no que o cliente já falou. Não pergunte duas vezes a mesma coisa.\n\nSe ele disse \"quero um açaí de 500ml\", depois não pergunte \"qual tamanho?\".\n\nSe ele disser \"quero dois\", entenda duas unidades do que estava sendo falado, a não ser que esteja realmente ambíguo.\n\n━━━━━━━━━━━━━━━━━━━━\n❤️ EXPERIÊNCIA DO CLIENTE\n━━━━━━━━━━━━━━━━━━━━\n\nFaça o cliente sentir que foi bem atendido.\n\n\"Boa escolha! 😋\"\n\"Esse é uma delícia 🍫\"\n\"Perfeito! 🔥\"\n\nAcompanhe o tom dele: animado, acompanhe; com pressa, seja mais objetiva; em dúvida, ajude; recusou, respeite.\n\n━━━━━━━━━━━━━━━━━━━━\n📌 REGRA FINAL\n━━━━━━━━━━━━━━━━━━━━\n\nVocê é uma atendente de verdade, não um sistema de respostas.\n\nSeja rápida. Seja simpática. Conduza a venda. Monte o açaí junto com o cliente. Sugira um acompanhamento. Facilite a decisão.\n\nMAS:\n\nNunca invente informação.\nNunca confirme pedido sem número de pedido.\nNunca fale preço sem consultar produtos.\nNunca fale taxa sem calcular a entrega.\nNunca prometa horário de entrega.\nNunca tente resolver o que é de um humano.\n\nO cliente tem que terminar a conversa pensando:\n\"Fui bem atendido e foi fácil comprar.\" 😊❤️") }
    },
    subnodes: {
      model: modeloDeLinguagem,
      memory: memoriaDaConversa,
      tools: [consultarProdutos, calcularTaxaEntrega, fazerPedido, consultarPedido]
    }
  },
  output: [{ output: 'Aeee 🍇 Temos sim!' }]
});

const dividirEmMensagens = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Dividir em mensagens',
    position: [5104, 288],
    parameters: { jsCode: 'const partes = ($input.first().json.output || "").split("\\n\\n").map((p) => p.trim()).filter((p) => p.length > 0);\nreturn (partes.length ? partes : ["..."]).map((texto) => ({ json: { texto } }));' }
  },
  output: [{ texto: 'Aeee 🍇 Temos sim!' }]
});

const umaDeCadaVez = splitInBatches({
  version: 3,
  config: {
    name: 'Uma de cada vez',
    position: [5328, 288],
    notes: 'As partes saem UMA de cada vez, em ordem. Sem isso, as tres partes de uma resposta longa podem chegar embaralhadas no celular do cliente.',
    parameters: { options: {} }
  }
});

const registrarRespostaNoPainel = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Registrar resposta no painel',
    position: [5552, 144],
    notes: 'Registra ANTES de enviar. Assim o dono ve na aba Chat o que foi prometido em nome dele.',
    parameters: {
      method: 'POST',
      url: expr('{{ $("Dados da mensagem").first().json.fly_base }}/api/crm/reply'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Authorization', value: expr('Bearer {{ $("Dados da mensagem").first().json.chave_mestra }}') }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ tenant_id: $("Dados da mensagem").first().json.tenant_id, token: $("Dados da mensagem").first().json.token, phone: $("Dados da mensagem").first().json.celular, text: $json.texto }) }}'),
      options: { timeout: 15000 }
    }
  },
  output: [{ message_id: 'msg-1', uazapi: { baseUrl: 'https://api.uazapi.com', instanceToken: 'xxx' } }]
});

const enviarRespostaDaIa = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Enviar resposta da IA',
    position: [5776, 144],
    notes: 'O delay mostra "digitando..." antes de cada mensagem, como uma pessoa faria.',
    parameters: {
      method: 'POST',
      url: expr('{{ $json.uazapi.baseUrl }}/send/text'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'token', value: expr('{{ $json.uazapi.instanceToken }}') }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ number: $("Dados da mensagem").first().json.celular, text: $("Uma de cada vez").item.json.texto, delay: 4000, linkPreview: false }) }}'),
      options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 20000 }
    }
  },
  output: [{ statusCode: 200, body: { messageid: 'ABC999' } }]
});

const contarResultadoIa = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Contar o resultado (IA)',
    position: [6000, 288],
    parameters: {
      method: 'POST',
      url: expr('{{ $("Dados da mensagem").first().json.fly_base }}/api/crm/outbox/result'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Authorization', value: expr('Bearer {{ $("Dados da mensagem").first().json.chave_mestra }}') }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ tenant_id: $("Dados da mensagem").first().json.tenant_id, token: $("Dados da mensagem").first().json.token, results: [ { message_id: $("Registrar resposta no painel").item.json.message_id, status: $json.statusCode >= 200 && $json.statusCode < 300 ? "sent" : "failed", external_id: $json.body && $json.body.messageid ? $json.body.messageid : null, error: $json.statusCode >= 300 ? ("UAZAPI respondeu " + $json.statusCode) : null } ] }) }}'),
      options: { timeout: 15000 }
    }
  },
  output: [{ success: true }]
});

const deMinutoEmMinuto = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'De minuto em minuto',
    position: [0, 624],
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } }
  },
  output: [{}]
});

const configDaLojaSaida = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'CONFIG DA LOJA (saida)',
    position: [224, 624],
    notes: 'Os mesmos valores do no Dados da mensagem. Se um dia divergirem, a loja recebe e nao responde.',
    parameters: {
      assignments: {
        assignments: [
          { id: 's1', name: 'fly_base', type: 'string', value: 'https://flycontrol.conectfly.com.br' },
          { id: 's2', name: 'tenant_id', type: 'string', value: 'f73c7dab-b849-4221-8047-4ac0fa6a3982' },
          { id: 's3', name: 'token', type: 'string', value: 'COLE-AQUI-A-SENHA-DESTA-LOJA' },
          { id: 's4', name: 'chave_mestra', type: 'string', value: 'COLE-AQUI-A-CHAVE-MESTRA-CRM_N8N_SECRET' }
        ]
      },
      options: {}
    }
  },
  output: [{ fly_base: 'https://flycontrol.conectfly.com.br', tenant_id: 'f73c7dab-b849-4221-8047-4ac0fa6a3982', token: 'COLE-AQUI-A-SENHA-DESTA-LOJA', chave_mestra: 'COLE-AQUI-A-CHAVE-MESTRA-CRM_N8N_SECRET' }]
});

const buscarFilaDoPainel = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Buscar fila do painel',
    position: [448, 624],
    notes: 'O que o atendente humano digitou no painel. A resposta da IA nao passa por aqui: ela ja saiu na hora.',
    parameters: {
      method: 'POST',
      url: expr('{{ $json.fly_base }}/api/crm/outbox'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Authorization', value: expr('Bearer {{ $json.chave_mestra }}') }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ tenant_id: $json.tenant_id, token: $json.token, limit: 50, worker: "n8n-ia", lease: 300 }) }}'),
      options: { timeout: 15000 }
    }
  },
  output: [{ messages: [{ message_id: 'msg-2', phone_e164: '5571999999999', body: 'Ja estamos preparando!' }], uazapi: { baseUrl: 'https://api.uazapi.com', instanceToken: 'xxx' } }]
});

const umaMensagemPorVez = node({
  type: 'n8n-nodes-base.splitOut',
  version: 1,
  config: { name: 'Uma mensagem por vez', position: [672, 624], parameters: { fieldToSplitOut: 'messages', options: {} } },
  output: [{ message_id: 'msg-2', phone_e164: '5571999999999', body: 'Ja estamos preparando!' }]
});

const enviarRespostaDoPainel = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Enviar resposta do painel',
    position: [896, 624],
    parameters: {
      method: 'POST',
      url: expr('{{ $("Buscar fila do painel").first().json.uazapi.baseUrl }}{{ $json.media_url ? "/send/media" : "/send/text" }}'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'token', value: expr('{{ $("Buscar fila do painel").first().json.uazapi.instanceToken }}') }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.media_url ? { number: $json.phone_e164, type: ["audio","video","document"].includes($json.media_type) ? $json.media_type : "image", file: $json.media_url, text: $json.body || "" } : { number: $json.phone_e164, text: $json.body, linkPreview: false }) }}'),
      options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 20000 }
    }
  },
  output: [{ statusCode: 200, body: { messageid: 'ABC998' } }]
});

const contarResultadoPainel = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Contar o resultado (painel)',
    position: [1120, 624],
    parameters: {
      method: 'POST',
      url: expr('{{ $("CONFIG DA LOJA (saida)").first().json.fly_base }}/api/crm/outbox/result'),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Authorization', value: expr('Bearer {{ $("CONFIG DA LOJA (saida)").first().json.chave_mestra }}') }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ tenant_id: $("CONFIG DA LOJA (saida)").first().json.tenant_id, token: $("CONFIG DA LOJA (saida)").first().json.token, results: [ { message_id: $("Uma mensagem por vez").item.json.message_id, status: $json.statusCode >= 200 && $json.statusCode < 300 ? "sent" : "failed", external_id: $json.body && $json.body.messageid ? $json.body.messageid : null, error: $json.statusCode >= 300 ? ("UAZAPI respondeu " + $json.statusCode) : null } ] }) }}'),
      options: { timeout: 15000 }
    }
  },
  output: [{ success: true }]
});

const avisoEntrada = sticky('## 🍇 ENTRADA — o cliente escreve no WhatsApp\n\nA UAZAPI avisa aqui que chegou mensagem. O fluxo registra a conversa no painel, junta os pedacos da frase e so entao chama a atendente de IA.', [chegouMensagem, dadosDaMensagem, registrarNoFlyControl], { color: 4 });

const avisoSaida = sticky('## 📤 SAIDA — o atendente humano responde pelo painel\n\nDe minuto em minuto o fluxo busca no FlyControl o que a equipe digitou na aba Chat e entrega no WhatsApp do cliente.', [deMinutoEmMinuto, configDaLojaSaida, buscarFilaDoPainel], { color: 5 });

export default workflow('flycontrol-ia-acai-deus-provera', 'FlyControl CRM + IA — ACAI DEUS PROVERA')
  .add(chegouMensagem)
  .to(dadosDaMensagem)
  .to(registrarNoFlyControl)
  .to(
    foiOAtendente
      .onTrue(pausarIa)
      .onFalse(
        iaPausada.to(
          podeResponder.onTrue(
            queTipoDeMensagem
              .onCase(0, pegarAudio.to(baixarAudio).to(transcreverAudio).to(textoDoAudio))
              .onCase(1, pegarImagem.to(baixarImagem).to(descreverImagem).to(textoDaImagem))
              .onCase(2, textoDireto)
          )
        )
      )
  )
  .add(textoDoAudio)
  .to(guardarNaListaDeEspera)
  .add(textoDoAudio)
  .to(anexarAoPainel)
  .add(textoDaImagem)
  .to(guardarNaListaDeEspera)
  .add(textoDaImagem)
  .to(anexarAoPainel)
  .add(textoDireto)
  .to(guardarNaListaDeEspera)
  .add(guardarNaListaDeEspera)
  .to(esperar15Segundos)
  .to(lerListaDeEspera)
  .to(
    foiAUltima.onTrue(
      limparALista.to(juntarAsMensagens).to(situacaoDaLoja).to(fichaDoCliente).to(atendenteIa)
    )
  )
  .add(atendenteIa)
  .to(dividirEmMensagens)
  .to(
    umaDeCadaVez.onEachBatch(
      registrarRespostaNoPainel.to(enviarRespostaDaIa).to(contarResultadoIa).to(nextBatch(umaDeCadaVez))
    )
  )
  .add(deMinutoEmMinuto)
  .to(configDaLojaSaida)
  .to(buscarFilaDoPainel)
  .to(umaMensagemPorVez)
  .to(enviarRespostaDoPainel)
  .to(contarResultadoPainel)
  .add(avisoEntrada)
  .add(avisoSaida);
