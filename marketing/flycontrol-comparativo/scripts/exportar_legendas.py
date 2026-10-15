"""Gera as legendas .srt com os textos-chave que aparecem na tela (o vídeo não tem narração).
Tempos nominais por cena, convertidos para cada versão com composicoes/roteiro.json.
Uso: python3 scripts/exportar_legendas.py"""
import json, os
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = json.load(open(f'{RAIZ}/composicoes/roteiro.json'))
NOM = R['nominal']

# (cena, início, fim, texto) — os mesmos textos e valores das cenas (componentes/scenes/*.tsx)
TEXTOS = [
    ('s1', 0.5, 2.0, 'O mesmo hambúrguer.'),
    ('s1', 2.0, 4.9, 'Mas quanto sobra da venda?\n(exemplo: pedido de R$ 26,00)'),
    ('s2', 0.5, 1.5, 'Exemplo: iFood · Plano Entrega'),
    ('s2', 1.5, 3.3, '23% de comissão\n+ 3,2% de pagamento pela plataforma'),
    ('s2', 3.3, 5.1, 'Total de 26,2% neste cenário:\nR$ 6,81 em taxas'),
    ('s2', 5.1, 7.3, 'R$ 26,00 − R$ 6,81 = R$ 19,19\napós essas taxas'),
    ('s3', 0.5, 1.5, 'Exemplo: 99Food · entrega pela 99'),
    ('s3', 1.5, 3.3, '8,9% de comissão\n+ 3,2% de intermediação de pagamento'),
    ('s3', 3.3, 5.1, 'Total de 12,1% neste cenário:\nR$ 3,15 em taxas'),
    ('s3', 5.1, 6.8, 'R$ 26,00 − R$ 3,15 = R$ 22,85\napós essas taxas'),
    ('s4', 0.4, 3.7, 'E se você vendesse\npelo seu próprio cardápio?'),
    ('s5', 0.8, 2.4, 'FlyControl'),
    ('s5', 2.4, 4.5, 'Exemplo: venda direta · Plano CENTS\nR$ 0,70 por pedido aceito'),
    ('s5', 4.5, 5.6, 'R$ 26,00 − R$ 0,70 = R$ 25,30\n(primeiros 100 do mês, sem mensalidade)'),
    ('s5', 5.6, 7.3, 'Para sobrar R$ 26,00, o pedido custaria:\niFood R$ 35,23 · 99Food R$ 29,58 · FlyControl R$ 26,70'),
    ('s6', 0.8, 2.3, '100 pedidos\nR$ 2.600,00 em vendas'),
    ('s6', 2.4, 5.4, 'Taxas em 100 pedidos: iFood R$ 681,20\n99Food R$ 314,60 · FlyControl R$ 70,00'),
    ('s6', 5.6, 8.8, 'Até R$ 611,20 de diferença nas taxas\ndeste exemplo (R$ 244,60 frente ao 99Food)'),
    ('s7', 0.2, 3.0, 'Um cardápio com a sua cara:\nidentidade visual, logotipo e vídeo de capa'),
    ('s7', 3.2, 8.1, 'O cliente escolhe, personaliza e pede:\nadicionais, carrinho e resumo do pedido'),
    ('s8', 0.8, 2.4, 'Mais controle sobre suas vendas.\nSeu cardápio. Sua marca. Seus pedidos.'),
    ('s8', 2.4, 5.6, 'Conheça o FlyControl'),
]

def ts(x):
    ms = int(round(x * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'

for versao, nome in [('53s', 'FlyControl_Comparativo_Legendas.srt'), ('30s', 'FlyControl_Comparativo_30s_Legendas.srt')]:
    cen = R['versoes'][versao]['cenas']
    linhas, n = [], 0
    for c, a, b, txt in TEXTOS:
        if c not in cen: continue
        a0, b0 = cen[c][:2]; nom = cen[c][2] if len(cen[c]) > 2 else NOM[c]
        if a >= nom - 0.5: continue
        b = min(b, nom - 0.1); k = nom / (b0 - a0)
        n += 1
        linhas.append(f'{n}\n{ts(a0 + a / k)} --> {ts(a0 + b / k)}\n{txt}\n')
    open(f'{RAIZ}/renders/{nome}', 'w', encoding='utf-8').write('\n'.join(linhas))
    print(nome, n, 'legendas')
