import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Search, Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  roles: string[];
  status: string;
  created_at: string;
  last_sign_in_at: string | null;
  restaurant_name: string;
}

export const UsersDashboard = () => {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: users, isLoading, error } = useQuery({
    queryKey: ["admin-users-list"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('admin-list-users');
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to fetch users');
      return data.users as AdminUser[];
    },
  });

  const filteredUsers = users?.filter(user => 
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.restaurant_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.roles.some(role => role.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-64" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Ocorreu um erro ao carregar os usuários."}
            <br />
            Certifique-se de que você tem permissões de super_admin.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-3xl font-bold">Usuários</h1>
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por e-mail, nome, restaurante ou perfil..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Restaurante</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead>Último Acesso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers && filteredUsers.length > 0 ? (
              filteredUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span>{u.full_name || "N/A"}</span>
                      <span className="text-xs text-muted-foreground">{u.phone || ""}</span>
                    </div>
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {u.roles?.map((role, i) => (
                        <Badge key={i} variant={role === "super_admin" ? "default" : "secondary"}>
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{u.restaurant_name}</TableCell>
                  <TableCell>
                    <Badge variant={u.status === 'active' ? 'outline' : 'destructive'}>
                      {u.status === 'active' ? 'Ativo' : 'Pendente'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(u.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-sm">
                    {u.last_sign_in_at 
                      ? new Date(u.last_sign_in_at).toLocaleString() 
                      : "Nunca"}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  Nenhum usuário encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
