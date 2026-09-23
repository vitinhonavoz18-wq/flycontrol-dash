import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { buscarResumoAdmin } from "@/lib/afiliados/admin";
import { lembreteDeRepasses } from "@/lib/afiliados/adminRotulos";

/**
 * Quem cuida dos repasses dos afiliados é a conta administrativa. Nos dias
 * 10 e 20 o sistema monta os repasses sozinho, mas o Pix quem faz é gente —
 * então, ao abrir o painel com repasse esperando, a conta administrativa
 * recebe um aviso com atalho para a lista.
 *
 * É o bilhete colado no caixa: "tem motoboy para acertar hoje". Aparece uma
 * vez por sessão do navegador, e não aparece quando não há nada a fazer.
 */
export function LembreteDeRepasses() {
  const { user, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const caminho = useRouterState({ select: (s) => s.location.pathname });
  const conferido = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !isSuperAdmin) return;
    if (conferido.current === user.id) return;
    // No portal do parceiro e na própria lista de repasses, o aviso sobra.
    if (caminho.startsWith("/affiliates") || caminho.startsWith("/admin/affiliates/withdrawals"))
      return;
    conferido.current = user.id;

    const chave = `fly-lembrete-repasses:${user.id}`;
    try {
      if (sessionStorage.getItem(chave)) return;
    } catch {
      // Navegador sem acesso ao armazenamento: segue e avisa mesmo assim.
    }

    let cancelado = false;
    buscarResumoAdmin()
      .then((resumo) => {
        const aviso = lembreteDeRepasses(resumo);
        if (cancelado || !aviso) return;
        try {
          sessionStorage.setItem(chave, "1");
        } catch {
          // Sem armazenamento, o pior caso é o aviso voltar na próxima aba.
        }
        toast(aviso.titulo, {
          description: aviso.detalhe,
          duration: 15000,
          action: {
            label: "Ver repasses",
            onClick: () => void navigate({ to: "/admin/affiliates/withdrawals" }),
          },
        });
      })
      .catch(() => {
        // O lembrete é conforto: se o banco não responder, o painel segue normal.
      });
    return () => {
      cancelado = true;
    };
  }, [user, isSuperAdmin, caminho, navigate]);

  return null;
}
