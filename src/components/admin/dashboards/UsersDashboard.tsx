import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const UsersDashboard = () => {
  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data: profiles, error: pError } = await supabase
        .from("profiles")
        .select("*");
      if (pError) throw pError;

      const { data: roles, error: rError } = await supabase
        .from("user_roles")
        .select("*");
      if (rError) throw rError;

      return profiles.map(p => ({
        ...p,
        roles: roles.filter(r => r.user_id === p.id).map(r => r.role)
      }));
    },

  });

  if (isLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Usuários</h1>
      <div className="bg-card border rounded-lg p-6 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Função</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Criado em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users?.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.full_name || "N/A"}</TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {u.roles?.map((role: string, i: number) => (
                      <Badge key={i} variant={role === "super_admin" ? "default" : "secondary"}>
                        {role}
                      </Badge>
                    ))}
                  </div>
                </TableCell>

                <TableCell>{u.phone || "N/A"}</TableCell>
                <TableCell>{new Date(u.created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

