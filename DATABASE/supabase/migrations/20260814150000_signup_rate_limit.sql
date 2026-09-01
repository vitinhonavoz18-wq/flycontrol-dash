-- Limite de tentativas de cadastro por IP.
--
-- Sem isso, um script poderia criar cadastros repetidamente sem parar, cada
-- um gerando um link de pagamento real na InfinityPay — não rouba dinheiro
-- diretamente, mas enche o banco de contas fantasmas e sobrecarrega a conta
-- da InfinityPay. A tabela só registra tentativas (sucesso ou não); quem lê
-- e decide bloquear é o servidor, nunca o cliente.

CREATE TABLE IF NOT EXISTS public.signup_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signup_attempts_ip_idx
  ON public.signup_attempts(ip_address, created_at DESC);

-- Registro de curta duração: nada aqui precisa sobreviver mais que a janela
-- de contagem. Evita a tabela crescer para sempre sem manutenção manual.
CREATE INDEX IF NOT EXISTS signup_attempts_created_at_idx
  ON public.signup_attempts(created_at);

ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;

-- Nenhuma policy: nem cliente autenticado nem anônimo enxerga ou escreve
-- aqui. Só o servidor (service role, que ignora RLS) lê e grava.
