import { useAdminPizzerias } from "@/hooks/admin/use-admin-pizzerias";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink, Store, Copy, Check } from "lucide-react";
import { toast } from "sonner";

export const PizzeriasDashboard = () => {
  const { data, isLoading, error } = useAdminPizzerias();
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredData = useMemo(() => {
    if (!data) return [];
    return data.filter(p => 
      p.pizzeria_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.pizzeria_id?.toLowerCase().includes(search.toLowerCase())
    );
  }, [data, search]);

  const copyLink = (slug: string, id: string) => {
    const url = `https://sitecreatorfly.lovable.app/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast.success("Link copiado!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (isLoading) return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
  if (error) return <div className="p-8 text-destructive">Erro ao carregar lojas.</div>;

  return (
    <div className="p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <h1 className="text-3xl font-bold">FlyPizzarias</h1>
        <Input 
          placeholder="Buscar por nome ou ID..." 
          className="max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-card border rounded-lg shadow-sm overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loja</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pedidos (Hoje)</TableHead>
              <TableHead>Receita (Hoje)</TableHead>
              <TableHead>Último Pedido</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((p) => (
              <TableRow key={p.pizzeria_id}>
                <TableCell>
                  <div className="font-semibold text-foreground">{p.pizzeria_name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{p.pizzeria_id}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge variant={p.status === "active" ? "default" : "secondary"} className="w-fit">
                      {p.status === "active" ? "Ativa" : "Inativa"}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-bold">
                    {p.orders_day || 0}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium text-emerald-600">
                  R$ {Number(p.revenue_day || 0).toFixed(2)}
                </TableCell>
                <TableCell className="text-xs">
                  {p.last_order_at ? new Date(p.last_order_at).toLocaleString() : "N/A"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="icon" asChild title="Abrir Cardápio">
                      <a href={`https://sitecreatorfly.lovable.app/${p.pizzeria_id}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => copyLink(p.pizzeria_id || "", p.pizzeria_id || "")}
                      title="Copiar Link"
                    >
                      {copiedId === p.pizzeria_id ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    <Button variant="outline" size="icon" asChild title="Ver no Painel">
                      <a href={`/dashboard?pizzeriaId=${p.pizzeria_id}`}>
                        <Store className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredData.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhuma loja encontrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};


