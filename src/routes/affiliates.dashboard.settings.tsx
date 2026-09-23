import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { CampoDeSenha } from "@/components/afiliados/portal/Casca";
import {
  BotaoPrincipal,
  Campo,
  Painel,
  TituloDaPagina,
  classeDoCampo,
} from "@/components/afiliados/portal/Pecas";
import { usePerfil } from "@/components/afiliados/portal/perfilContexto";
import { supabase } from "@/integrations/supabase/client";
import { atualizarMeusDados } from "@/lib/afiliados/portal";
import {
  TIPOS_DE_PIX,
  mensagemDeErro,
  porcentagemDeBps,
  problemaNaChavePix,
  type TipoDePix,
} from "@/lib/afiliados/validacao";
import { formatPhone, validateBrazilianPhone, validatePassword } from "@/lib/signup/validation";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/affiliates/dashboard/settings")({
  component: Configuracoes,
});

/**
 * O que o parceiro pode mudar sozinho: nome, celular, Pix e senha.
 *
 * Código de indicação e porcentagem aparecem só para leitura. Não há campo
 * para eles — e, mesmo que alguém montasse um pedido à mão, a função do
 * banco que salva os dados nem recebe esses dois.
 */
function Configuracoes() {
  const perfil = usePerfil();
  const queryClient = useQueryClient();

  const [nome, setNome] = useState(perfil.nome);
  const [telefone, setTelefone] = useState(perfil.telefone ? formatPhone(perfil.telefone) : "");
  const [pixTipo, setPixTipo] = useState<TipoDePix | "">(perfil.pix_tipo ?? "");
  const [pixChave, setPixChave] = useState(perfil.pix_chave ?? "");
  const [erros, setErros] = useState<{ nome?: string; telefone?: string; pix?: string }>({});
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const novos: typeof erros = {};
    if (nome.trim().replace(/\s+/g, " ").length < 3) novos.nome = "Informe seu nome completo.";
    if (telefone.trim()) {
      const t = validateBrazilianPhone(telefone);
      if (!t.valid) novos.telefone = t.message.replace("WhatsApp", "celular");
    }
    const problema = problemaNaChavePix(pixTipo || null, pixChave);
    if (problema) novos.pix = problema;
    setErros(novos);
    if (Object.values(novos).some(Boolean)) return;

    setSalvando(true);
    try {
      await atualizarMeusDados({
        nome,
        telefone: telefone || null,
        pixTipo: pixTipo || null,
        pixChave: pixChave.trim() || null,
      });
      await queryClient.invalidateQueries({ queryKey: ["afiliado", "perfil"] });
      toast.success("Dados salvos.");
    } catch (erro) {
      toast.error(mensagemDeErro(erro));
    } finally {
      setSalvando(false);
    }
  }

  const exemplo = TIPOS_DE_PIX.find((t) => t.valor === pixTipo)?.exemplo;

  return (
    <div className="space-y-6">
      <TituloDaPagina titulo="Configurações" texto="Seus dados de contato e de pagamento." />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Painel>
          <form onSubmit={salvar} className="space-y-4" noValidate>
            <h2 className="text-sm font-medium text-white">Dados pessoais</h2>
            <Campo id="cfg-nome" rotulo="Nome completo" erro={erros.nome}>
              <input
                id="cfg-nome"
                autoComplete="name"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className={classeDoCampo}
              />
            </Campo>
            <Campo id="cfg-tel" rotulo="Celular (WhatsApp)" erro={erros.telefone}>
              <input
                id="cfg-tel"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                value={telefone}
                onChange={(e) => setTelefone(formatPhone(e.target.value))}
                className={classeDoCampo}
              />
            </Campo>

            <h2 className="pt-2 text-sm font-medium text-white">Recebimento (Pix)</h2>
            <div className="grid gap-4 sm:grid-cols-[11rem_1fr]">
              <Campo id="cfg-pix-tipo" rotulo="Tipo de chave">
                <select
                  id="cfg-pix-tipo"
                  value={pixTipo}
                  onChange={(e) => setPixTipo(e.target.value as TipoDePix | "")}
                  className={cn(classeDoCampo, "appearance-none")}
                >
                  <option value="">Sem chave</option>
                  {TIPOS_DE_PIX.map((t) => (
                    <option key={t.valor} value={t.valor}>
                      {t.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo
                id="cfg-pix"
                rotulo="Chave Pix"
                erro={erros.pix}
                ajuda="Os saques são pagos nesta chave."
              >
                <input
                  id="cfg-pix"
                  value={pixChave}
                  placeholder={exemplo}
                  disabled={!pixTipo}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => setPixChave(e.target.value)}
                  className={classeDoCampo}
                />
              </Campo>
            </div>

            <BotaoPrincipal type="submit" disabled={salvando} className="w-full sm:w-auto">
              {salvando ? "Salvando..." : "Salvar dados"}
            </BotaoPrincipal>
          </form>
        </Painel>

        <div className="space-y-4">
          <Painel>
            <h2 className="flex items-center gap-2 text-sm font-medium text-white">
              <Lock className="size-4 text-white/45" /> Definidos pelo FlyControl
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-white/50">E-mail de acesso</dt>
                <dd className="min-w-0 truncate text-white">{perfil.email}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-white/50">Código de indicação</dt>
                <dd className="font-mono font-semibold tracking-[0.1em] text-white">
                  {perfil.codigo}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-white/50">Comissão</dt>
                <dd className="text-white">{porcentagemDeBps(perfil.comissao_bps)} recorrente</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-white/40">
              O código não muda: trocá-lo quebraria todos os links que você já divulgou.
            </p>
          </Painel>

          <TrocarSenha email={perfil.email} />
        </div>
      </div>
    </div>
  );
}

/**
 * Troca de senha pelo próprio Supabase. Pede a senha ATUAL antes: quem
 * pegou o celular desbloqueado do parceiro não consegue trancar o dono do
 * lado de fora da própria conta.
 */
function TrocarSenha({ email }: { email: string }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function trocar(e: React.FormEvent) {
    e.preventDefault();
    const regra = validatePassword(nova);
    if (!atual) return setErro("Informe a senha atual.");
    if (!regra.valid) return setErro(regra.message);
    if (nova !== confirma) return setErro("As senhas novas não coincidem.");
    setErro(null);
    setSalvando(true);
    try {
      const { data: sessao } = await supabase.auth.getUser();
      const emailDaConta = sessao.user?.email ?? email;
      const { error: conferencia } = await supabase.auth.signInWithPassword({
        email: emailDaConta,
        password: atual,
      });
      if (conferencia) {
        setErro("Senha atual incorreta.");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: nova });
      if (error) {
        setErro("Não foi possível trocar a senha agora. Tente novamente.");
        return;
      }
      setAtual("");
      setNova("");
      setConfirma("");
      toast.success("Senha trocada.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Painel>
      <form onSubmit={trocar} className="space-y-4" noValidate>
        <h2 className="text-sm font-medium text-white">Trocar senha</h2>
        <Campo id="senha-atual" rotulo="Senha atual">
          <CampoDeSenha
            id="senha-atual"
            valor={atual}
            aoMudar={setAtual}
            autoComplete="current-password"
          />
        </Campo>
        <Campo
          id="senha-nova"
          rotulo="Senha nova"
          ajuda="Mínimo de 8 caracteres, com letra e número."
        >
          <CampoDeSenha
            id="senha-nova"
            valor={nova}
            aoMudar={setNova}
            autoComplete="new-password"
          />
        </Campo>
        <Campo id="senha-confirma" rotulo="Repita a senha nova" erro={erro}>
          <CampoDeSenha
            id="senha-confirma"
            valor={confirma}
            aoMudar={setConfirma}
            autoComplete="new-password"
            invalido={Boolean(erro)}
          />
        </Campo>
        <BotaoPrincipal type="submit" disabled={salvando} className="w-full">
          {salvando ? "Trocando..." : "Trocar senha"}
        </BotaoPrincipal>
      </form>
    </Painel>
  );
}
