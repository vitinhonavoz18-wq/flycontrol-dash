-- Reaplicação do limite de tentativas de cadastro por IP.
--
-- POR QUE ESTA MIGRAÇÃO EXISTE DUAS VEZES
--
-- A migração 20260814150000 estava marcada como aplicada no histórico do
-- banco, mas a tabela nunca foi criada — o registro entrou sem o SQL ter
-- rodado. É como o caderno da portaria dizer que a fechadura foi trocada
-- quando ninguém trocou: a porta parece protegida e não está.
--
-- Consequência enquanto faltou: a contagem de tentativas voltava vazia e o
-- servidor liberava TODOS os cadastros, sem limite. Um script poderia abrir
-- centenas de contas, cada uma gerando um link de pagamento real.
--
-- Tudo aqui é "se não existir", então rodar de novo em um banco que já tem a
-- tabela não faz nada.

CREATE TABLE IF NOT EXISTS public.signup_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signup_attempts_ip_idx
  ON public.signup_attempts(ip_address, created_at DESC);

CREATE INDEX IF NOT EXISTS signup_attempts_created_at_idx
  ON public.signup_attempts(created_at);

ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;

-- Nenhuma policy: nem cliente autenticado nem anônimo enxerga ou escreve
-- aqui. Só o servidor (service role, que ignora RLS) lê e grava.
