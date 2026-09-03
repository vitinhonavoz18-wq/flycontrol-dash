// Camada única de descadastro/reativação/exclusão definitiva de lojas —
// usada pelas telas "Usuários" e "FlyPizzarias" do admin, para as duas
// nunca se comportarem de um jeito diferente uma da outra.
//
// status = "inactive" (não "deleted") para o descadastro reversível: a
// view pizzeria_financial_metrics, usada pela própria tela FlyPizzarias, já
// escondia qualquer loja com status "deleted" — reaproveitar esse valor
// faria a loja sumir do painel do admin também, tornando impossível
// reativá-la ou excluí-la ali. "inactive" bloqueia o dashboard do dono e os
// pedidos (mesmos ~17 pontos do código que já excluíam "deleted" agora
// também excluem "inactive"), mas continua visível para o admin.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { deprovisionRestaurantInSF } from "@/integrations/sitecreatorfly/provision.server";

const STORAGE_BUCKET = "menu-images";

export type LifecycleResult = {
  success: boolean;
  error?: string;
  warning?: string;
};

async function logAdminAction(params: {
  adminUserId: string;
  action: "STORE_DEACTIVATED" | "STORE_REACTIVATED" | "STORE_PERMANENTLY_DELETED";
  targetStoreId: string;
  targetUserId: string | null;
  status: "success" | "error";
  details?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from("admin_audit_logs").insert({
    admin_user_id: params.adminUserId,
    action: params.action,
    target_store_id: params.targetStoreId,
    target_user_id: params.targetUserId,
    status: params.status,
    details: params.details ?? null,
  } as any);
  if (error) console.error("[PizzeriaLifecycle] falha ao gravar log de auditoria:", error);
}

/** Extrai o caminho interno do arquivo a partir de uma signed URL do Supabase Storage. */
export function extractStoragePath(signedUrl: string | null | undefined): string | null {
  if (!signedUrl) return null;
  const match = signedUrl.match(/\/object\/sign\/menu-images\/([^?]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** Junta os arquivos de imagem/vídeo pertencentes só a esta loja, para apagar na exclusão definitiva. */
async function collectStoragePaths(
  pizzeriaId: string,
  pz: { logo_url?: string | null; hero_image_url?: string | null; hero_video_url?: string | null },
): Promise<string[]> {
  const urls: (string | null | undefined)[] = [pz.logo_url, pz.hero_image_url, pz.hero_video_url];

  const [{ data: products }, { data: combosRows }] = await Promise.all([
    supabaseAdmin.from("menu_products").select("image_url").eq("pizzeria_id", pizzeriaId),
    supabaseAdmin.from("combos").select("image_url").eq("pizzeria_id", pizzeriaId),
  ]);
  for (const p of products ?? []) urls.push((p as any).image_url);
  for (const c of combosRows ?? []) urls.push((c as any).image_url);

  const paths = new Set<string>();
  for (const url of urls) {
    const path = extractStoragePath(url);
    if (path) paths.add(path);
  }
  return Array.from(paths);
}

async function fetchPizzeria(pizzeriaId: string) {
  const { data, error } = await supabaseAdmin
    .from("pizzerias")
    .select("id, name, slug, owner_id, status, logo_url, hero_image_url, hero_video_url")
    .eq("id", pizzeriaId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deactivatePizzeria(
  pizzeriaId: string,
  adminUserId: string,
): Promise<LifecycleResult> {
  const pz = await fetchPizzeria(pizzeriaId);
  if (!pz) return { success: false, error: "store_not_found" };

  const { error: updErr } = await supabaseAdmin
    .from("pizzerias")
    .update({ status: "inactive" } as any)
    .eq("id", pizzeriaId);

  if (updErr) {
    await logAdminAction({
      adminUserId,
      action: "STORE_DEACTIVATED",
      targetStoreId: pizzeriaId,
      targetUserId: pz.owner_id,
      status: "error",
      details: { error: updErr.message },
    });
    return { success: false, error: updErr.message };
  }

  const sf = await deprovisionRestaurantInSF(pizzeriaId, "deactivate");

  await logAdminAction({
    adminUserId,
    action: "STORE_DEACTIVATED",
    targetStoreId: pizzeriaId,
    targetUserId: pz.owner_id,
    status: "success",
    details: { sf_ok: sf.ok, sf_error: sf.ok ? undefined : sf.error },
  });

  if (!sf.ok) {
    return {
      success: true,
      warning:
        "Loja descadastrada no FlyControl, mas não foi possível confirmar a atualização no site público agora. Ele deve refletir em instantes.",
    };
  }
  return { success: true };
}

export async function reactivatePizzeria(
  pizzeriaId: string,
  adminUserId: string,
): Promise<LifecycleResult> {
  const pz = await fetchPizzeria(pizzeriaId);
  if (!pz) return { success: false, error: "store_not_found" };

  const { error: updErr } = await supabaseAdmin
    .from("pizzerias")
    .update({ status: "active" } as any)
    .eq("id", pizzeriaId);

  if (updErr) {
    await logAdminAction({
      adminUserId,
      action: "STORE_REACTIVATED",
      targetStoreId: pizzeriaId,
      targetUserId: pz.owner_id,
      status: "error",
      details: { error: updErr.message },
    });
    return { success: false, error: updErr.message };
  }

  const sf = await deprovisionRestaurantInSF(pizzeriaId, "reactivate");

  await logAdminAction({
    adminUserId,
    action: "STORE_REACTIVATED",
    targetStoreId: pizzeriaId,
    targetUserId: pz.owner_id,
    status: "success",
    details: { sf_ok: sf.ok, sf_error: sf.ok ? undefined : sf.error },
  });

  if (!sf.ok) {
    return {
      success: true,
      warning:
        "Loja reativada no FlyControl, mas não foi possível confirmar a atualização no site público agora. Ele deve refletir em instantes.",
    };
  }
  return { success: true };
}

/**
 * Apaga também a conta de acesso do dono, quando é seguro.
 *
 * POR QUE ISSO EXISTE
 *
 * Excluir a loja apaga a loja inteira, mas deixa o LOGIN do dono de pé. Para
 * uma loja de teste isso é justamente o que atrapalha: a conta continua
 * aparecendo na lista de usuários, misturada com cliente de verdade, e o
 * e-mail continua "ocupado" — não dá para cadastrar de novo com ele.
 *
 * É tirar a loja da rua e deixar a placa com o nome pendurada no poste.
 *
 * AS TRÊS TRAVAS
 *
 * Apagar conta é irreversível e não tem lixeira. Então a conta só vai embora
 * se as três coisas forem verdade:
 *
 *   1. Ela não é dona de NENHUMA outra loja. Senão o dono de duas lojas
 *      perderia o acesso à que sobrou.
 *   2. Ela não é administrador da plataforma. Ninguém apaga o próprio
 *      chaveiro sem querer.
 *   3. Ela não é a conta de quem está clicando.
 *
 * Falhando qualquer uma, a loja é excluída do mesmo jeito e a conta fica —
 * com um aviso explicando o motivo. Melhor sobrar uma conta do que sumir o
 * acesso de um cliente que paga.
 */
async function apagarContaDoDono(
  ownerId: string,
  adminUserId: string,
): Promise<{ apagada: boolean; motivo?: string }> {
  if (ownerId === adminUserId) {
    return { apagada: false, motivo: "é a sua própria conta" };
  }

  const { data: outras, error: erroOutras } = await supabaseAdmin
    .from("pizzerias")
    .select("id")
    .eq("owner_id", ownerId)
    .limit(1);

  if (erroOutras) return { apagada: false, motivo: "não consegui conferir as outras lojas" };
  if ((outras ?? []).length > 0) {
    return { apagada: false, motivo: "esta conta ainda é dona de outra loja" };
  }

  const { data: papeis } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", ownerId);

  const ehAdmin = (papeis ?? []).some(
    (p) =>
      (p as { role?: string }).role === "super_admin" || (p as { role?: string }).role === "admin",
  );
  if (ehAdmin) return { apagada: false, motivo: "esta conta é administrador da plataforma" };

  // A ordem importa: primeiro as linhas que apontam para o usuário, depois o
  // usuário. Não existe chave estrangeira ligando estas tabelas ao cadastro
  // de login, então o banco não limpa sozinho — se a gente apagasse o login
  // primeiro, sobrariam fichas apontando para um nome que não existe mais.
  await supabaseAdmin.from("user_roles").delete().eq("user_id", ownerId);
  await supabaseAdmin.from("profiles").delete().eq("id", ownerId);

  const { error: erroAuth } = await supabaseAdmin.auth.admin.deleteUser(ownerId);
  if (erroAuth) return { apagada: false, motivo: erroAuth.message };

  return { apagada: true };
}

export async function deletePizzeriaPermanently(
  pizzeriaId: string,
  adminUserId: string,
  confirmName: string,
  /** Apagar junto o login do dono. Só faz sentido para loja de teste. */
  alsoDeleteOwner = false,
): Promise<LifecycleResult> {
  const pz = await fetchPizzeria(pizzeriaId);
  if (!pz) return { success: false, error: "store_not_found" };

  if (confirmName.trim() !== pz.name) {
    return { success: false, error: "name_mismatch" };
  }

  const storagePaths = await collectStoragePaths(pizzeriaId, pz);

  // Avisa o SiteCreatorFly e invalida a chave antes de apagar por aqui — se
  // isso falhar, ainda vale seguir com a exclusão local (é o que foi pedido),
  // mas o aviso final deixa claro que precisa conferir o outro lado.
  const sf = await deprovisionRestaurantInSF(pizzeriaId, "delete");

  const { error: delErr } = await supabaseAdmin.from("pizzerias").delete().eq("id", pizzeriaId);

  if (delErr) {
    await logAdminAction({
      adminUserId,
      action: "STORE_PERMANENTLY_DELETED",
      targetStoreId: pizzeriaId,
      targetUserId: pz.owner_id,
      status: "error",
      details: { error: delErr.message },
    });
    return { success: false, error: delErr.message };
  }

  let removedFiles = 0;
  if (storagePaths.length > 0) {
    const { data: removed, error: storageErr } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .remove(storagePaths);
    if (storageErr) {
      console.error("[PizzeriaLifecycle] falha ao remover arquivos do storage:", storageErr);
    } else {
      removedFiles = removed?.length ?? 0;
    }
  }

  // A conta só é apagada DEPOIS da loja: se apagássemos antes e a exclusão da
  // loja falhasse, sobraria uma loja sem dono — órfã, sem ninguém para
  // acessá-la nem para excluí-la.
  let conta: { apagada: boolean; motivo?: string } = { apagada: false };
  if (alsoDeleteOwner && pz.owner_id) {
    conta = await apagarContaDoDono(pz.owner_id, adminUserId);
  }

  await logAdminAction({
    adminUserId,
    action: "STORE_PERMANENTLY_DELETED",
    targetStoreId: pizzeriaId,
    targetUserId: pz.owner_id,
    status: "success",
    details: {
      sf_ok: sf.ok,
      sf_error: sf.ok ? undefined : sf.error,
      files_found: storagePaths.length,
      files_removed: removedFiles,
      conta_do_dono_apagada: conta.apagada,
      conta_do_dono_motivo: conta.motivo,
    },
  });

  const avisos: string[] = [];
  if (!sf.ok) {
    avisos.push(
      "não foi possível confirmar a invalidação no SiteCreatorFly agora — verifique se o cardápio público ainda responde",
    );
  }
  if (alsoDeleteOwner && !conta.apagada) {
    avisos.push(`a conta de acesso do dono foi mantida: ${conta.motivo ?? "motivo desconhecido"}`);
  }

  if (avisos.length > 0) {
    return { success: true, warning: `Loja excluída, mas ${avisos.join("; ")}.` };
  }
  return { success: true };
}
