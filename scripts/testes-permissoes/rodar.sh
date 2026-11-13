#!/usr/bin/env bash
# ============================================================================
# Prova, num PostgreSQL descartável, que a trava de segurança funciona.
# ============================================================================
#
# Sobe um PostgreSQL temporário (pasta temporária, porta 55499), monta o banco
# de mentira de simulacao-supabase.sql e roda docs/VALIDAR-NO-SUPABASE-tranca.sql
# em cada etapa. São dois caminhos, cada um num banco limpo, para um não
# esconder defeito do outro:
#
#   Caminho A — a trava sozinha
#     1. antes da trava ........................... espera 19 de 46 ok
#     2. depois da trava completa ................. espera 46 de 46 ok
#     3. com o CRM 2.0 (20261022120000) junto ..... continua 46 de 46 ok
#     4. depois da reversão ....................... volta a 19 de 46 ok
#
#   Caminho B — contenção primeiro, trava depois
#     5. depois da contenção imediata ............. espera 28 de 46 ok
#     6. trava completa por cima .................. espera 46 de 46 ok
#
#   Caminho C — o arquivo que vai para o SQL Editor
#     7. docs/APLICAR-NO-SUPABASE-tranca-de-seguranca.sql ... 46 de 46 ok
#     8. anotou só a versão 20261022160000 no caderno, uma vez
#     9. rodar o mesmo arquivo de novo não quebra nem duplica
#
# Não conecta em nenhum banco real. Precisa do PostgreSQL 15+ instalado
# (initdb, pg_ctl, psql). Se não estiverem no PATH, informe a pasta:
#   PG_BIN=/usr/lib/postgresql/16/bin scripts/testes-permissoes/rodar.sh
# ============================================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="${PG_BIN:-$(dirname "$(command -v initdb || echo /usr/lib/postgresql/16/bin/initdb)")}"
PORTA=55499
TMP="$(mktemp -d)"
PASTA="$TMP/dados"

# O PostgreSQL não roda como root; num contêiner como root, usa o usuário postgres.
como_dono() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
[ "$(id -u)" = 0 ] && chown -R postgres "$TMP"

limpar() { como_dono "'$BIN/pg_ctl' -D '$PASTA' stop -m fast" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap limpar EXIT

como_dono "'$BIN/initdb' -D '$PASTA' -A trust -U postgres" >/dev/null
como_dono "'$BIN/pg_ctl' -D '$PASTA' -o '-p $PORTA -k $TMP' -l '$TMP/log' start" >/dev/null
sleep 2

PSQL=("$BIN/psql" -h "$TMP" -p "$PORTA" -U postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -c "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;"

banco_limpo() {
  "${PSQL[@]}" -c "drop database if exists teste" -c "create database teste"
  "${PSQL[@]}" -d teste -f "$RAIZ/scripts/testes-permissoes/simulacao-supabase.sql"
}

FALHAS=0
conferir() {
  local etapa="$1" esperado="$2" obtido
  obtido=$("${PSQL[@]}" -d teste -A -F'|' -f "$RAIZ/docs/VALIDAR-NO-SUPABASE-tranca.sql" \
    | awk -F'|' 'NF==5 && $5=="t" {ok++} NF==5 && ($5=="t"||$5=="f") {tot++} END {print ok"/"tot}')
  if [ "$obtido" = "$esperado" ]; then
    echo "  ✓ $etapa: $obtido ok"
  else
    echo "  ✗ $etapa: $obtido ok (esperado $esperado)"
    FALHAS=$((FALHAS + 1))
  fi
}

echo "Trava de segurança — teste de permissões num banco descartável"

echo "Caminho A — a trava sozinha"
banco_limpo
conferir "1. antes da trava" "19/46"
"${PSQL[@]}" -d teste -1 -f "$RAIZ/supabase/migrations/20261022160000_tranca_funcoes_e_visoes_expostas.sql"
conferir "2. depois da trava completa" "46/46"
"${PSQL[@]}" -d teste -1 -f "$RAIZ/supabase/migrations/20261022120000_chat_crm_2_tipos_de_documento.sql"
conferir "3. com o CRM 2.0 aplicado junto" "46/46"
"${PSQL[@]}" -d teste -f "$RAIZ/docs/REVERTER-NO-SUPABASE-tranca-funcoes-e-visoes.sql"
conferir "4. depois da reversão" "19/46"

echo "Caminho B — contenção primeiro, trava depois"
banco_limpo
"${PSQL[@]}" -d teste -f "$RAIZ/docs/CONTENCAO-IMEDIATA-faturamento-e-whatsapp.sql"
conferir "5. depois da contenção imediata" "28/46"
"${PSQL[@]}" -d teste -1 -f "$RAIZ/supabase/migrations/20261022160000_tranca_funcoes_e_visoes_expostas.sql"
conferir "6. trava completa por cima" "46/46"

echo "Caminho C — o arquivo que vai para o SQL Editor"
banco_limpo
"${PSQL[@]}" -d teste -f "$RAIZ/docs/APLICAR-NO-SUPABASE-tranca-de-seguranca.sql"
conferir "7. arquivo de aplicação" "46/46"
anotadas=$("${PSQL[@]}" -d teste -Atc "select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations")
if [ "$anotadas" = "20261001120000,20261022160000" ]; then echo "  ✓ 8. caderno: $anotadas"; else echo "  ✗ 8. caderno: $anotadas"; FALHAS=$((FALHAS + 1)); fi
"${PSQL[@]}" -d teste -f "$RAIZ/docs/APLICAR-NO-SUPABASE-tranca-de-seguranca.sql"
conferir "9. aplicado duas vezes" "46/46"

if [ "$FALHAS" -gt 0 ]; then
  echo "Resultado: $FALHAS etapa(s) fora do esperado."
  exit 1
fi
echo "Resultado: todas as etapas como esperado."
