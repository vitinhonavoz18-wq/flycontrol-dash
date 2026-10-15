# Gera a narração, uma frase por arquivo, com os tempos de cada palavra (para legendas).
import asyncio, json, sys, os, ssl, edge_tts, edge_tts.communicate as _ec
if os.path.exists("/root/.ccr/ca-bundle.crt"):
    _ec._SSL_CTX = ssl.create_default_context(cafile="/root/.ccr/ca-bundle.crt")
VOZ = "pt-BR-AntonioNeural"
FRASES = [
 "Sexta-feira, horário de pico. O movimento aumenta, e seu WhatsApp não para.",
 "Mas quem cuida de tantas mensagens enquanto os pedidos precisam sair?",
 "Com o FlyControl, seu atendimento ganha uma nova inteligência.",
 "Conecte seu WhatsApp, centralize as conversas e ative a inteligência artificial para auxiliar no atendimento dos clientes.",
 "Tudo integrado ao cardápio digital e à gestão de pedidos, para uma operação muito mais ágil.",
 "Menos tarefas repetitivas. Mais tempo para focar no que realmente importa: o seu negócio.",
 "FlyControl. Inteligência para o seu atendimento. Conheça agora.",
]
RATE = sys.argv[1] if len(sys.argv) > 1 else "+0%"
async def um(i, txt):
    c = edge_tts.Communicate(txt, VOZ, rate=RATE, boundary="WordBoundary")
    palavras = []
    with open(f"public/audio/vo/vo{i+1}.mp3", "wb") as f:
        async for ch in c.stream():
            if ch["type"] == "audio": f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                palavras.append({"t": ch["offset"]/1e7, "d": ch["duration"]/1e7, "w": ch["text"]})
    return {"texto": txt, "palavras": palavras}
async def main():
    out = [await um(i, t) for i, t in enumerate(FRASES)]
    json.dump(out, open("public/audio/vo/palavras.json", "w"), ensure_ascii=False, indent=1)
asyncio.run(main())
