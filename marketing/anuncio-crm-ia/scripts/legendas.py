# Monta as legendas a partir dos tempos de cada palavra da narração.
# Saídas: src/legendas.json (legenda animada no vídeo) e o .srt de entrega.
import json, re, sys
tempos = json.load(open("src/tempos.json"))
falas = json.load(open("public/audio/vo/palavras.json"))
inicios = tempos["narracao_inicio_s"]
MAX_PAL, MAX_CAR = 5, 30

# Quebras escolhidas à mão, por sentido (o "|" marca onde troca a legenda).
QUEBRAS = [
 "Sexta-feira, horário de pico. | O movimento aumenta, | e seu WhatsApp não para.",
 "Mas quem cuida | de tantas mensagens | enquanto os pedidos | precisam sair?",
 "Com o FlyControl, | seu atendimento ganha | uma nova inteligência.",
 "Conecte seu WhatsApp, | centralize as conversas | e ative a inteligência artificial | para auxiliar no atendimento | dos clientes.",
 "Tudo integrado | ao cardápio digital | e à gestão de pedidos, | para uma operação | muito mais ágil.",
 "Menos tarefas repetitivas. | Mais tempo para focar | no que realmente importa: | o seu negócio.",
 "FlyControl. | Inteligência para o seu atendimento. | Conheça agora.",
]
blocos = []
for fala, ini, q in zip(falas, inicios, QUEBRAS):
    tokens = fala["texto"].split()
    bounds = fala["palavras"]
    assert len(tokens) == len(bounds), (fala["texto"], [b["w"] for b in bounds])
    assert q.replace(" |", "").split() == tokens, q
    pal = [{"w": tk, "t": round(ini + b["t"], 3), "f": round(ini + b["t"] + b["d"], 3)} for tk, b in zip(tokens, bounds)]
    k = 0
    for parte in q.split("|"):
        n = len(parte.split())
        blocos.append(pal[k:k + n]); k += n

saida = []
for i, b in enumerate(blocos):
    ini = b[0]["t"]
    fim = b[-1]["f"] + 0.25
    if i + 1 < len(blocos):
        fim = min(fim, blocos[i + 1][0]["t"] - 0.02) if blocos[i + 1][0]["t"] - b[-1]["f"] < 0.6 else fim
    saida.append({"ini": round(ini, 3), "fim": round(fim, 3), "palavras": b})
json.dump(saida, open("src/legendas.json", "w"), ensure_ascii=False, indent=1)

def ts(s):
    ms = int(round(s * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s_, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s_:02},{ms:03}"
with open(sys.argv[1] if len(sys.argv) > 1 else "flycontrol_crm_legendas.srt", "w", encoding="utf-8") as f:
    for i, b in enumerate(saida, 1):
        f.write(f"{i}\n{ts(b['ini'])} --> {ts(b['fim'])}\n{' '.join(p['w'] for p in b['palavras'])}\n\n")
for b in saida: print(f"{b['ini']:6.2f}-{b['fim']:6.2f}  {' '.join(p['w'] for p in b['palavras'])}")
