import { useState, useEffect } from "react";
import { useTables, useTableSessions, type RestaurantTable, type TableSession } from "@/hooks/useTables";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  QrCode, 
  Plus, 
  Printer, 
  Trash2, 
  Power, 
  PowerOff, 
  LayoutGrid, 
  Table as TableIcon, 
  Receipt, 
  Clock, 
  CheckCircle2,
  RefreshCw,
  ExternalLink
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

interface TablesManagementProps {
  tenantId: string;
  restaurantSlug: string;
}

export function TablesManagement({ tenantId, restaurantSlug }: TablesManagementProps) {
  const { tables, loading: tablesLoading, addTable, updateTable, toggleTable, deleteTable, loadTables } = useTables(tenantId);
  const { sessions, loading: sessionsLoading, closeSession, loadSessions } = useTableSessions(tenantId);
  
  const [newTableNumber, setNewTableNumber] = useState("");
  const [newTableName, setNewTableName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [editName, setEditName] = useState("");
  const [editNumber, setEditNumber] = useState("");

  useEffect(() => {
    if (tables.length > 0 && !newTableNumber) {
      // Find highest table number that is numeric
      const numericTables = tables
        .map(t => parseInt(t.table_number))
        .filter(n => !isNaN(n));
      
      if (numericTables.length > 0) {
        const nextNumber = Math.max(...numericTables) + 1;
        setNewTableNumber(nextNumber.toString().padStart(2, '0'));
        setNewTableName(`Mesa ${nextNumber.toString().padStart(2, '0')}`);
      } else {
        setNewTableNumber((tables.length + 1).toString().padStart(2, '0'));
        setNewTableName(`Mesa ${(tables.length + 1).toString().padStart(2, '0')}`);
      }
    } else if (tables.length === 0 && !newTableNumber) {
      setNewTableNumber("01");
      setNewTableName("Mesa 01");
    }
  }, [tables.length]);

  async function handleAddTable() {
    if (!newTableNumber) {
      toast.error("O número da mesa é obrigatório");
      return;
    }
    
    setIsAdding(true);
    const success = await addTable(newTableNumber, newTableName);
    if (success) {
      setNewTableNumber("");
      setNewTableName("");
      toast.success("Mesa adicionada com sucesso!");
    }
    setIsAdding(false);
  }

  function getQRCodeUrl(token: string) {
    // Requirements: https://conectfly.com.br/{{restaurant_slug}}?mode=table&table_token={{public_token}}
    const baseUrl = "https://conectfly.com.br";
    return `${baseUrl}/${restaurantSlug}?mode=table&table_token=${token}`;
  }

  async function handleRename() {
    if (!editingTable) return;
    const success = await updateTable(editingTable.id, { 
      table_name: editName,
      table_number: editNumber 
    });
    if (success) {
      setEditingTable(null);
    }
  }

  function downloadAllQRCodes() {
    // Note: In a real app, this would generate a PDF. 
    // Here we'll trigger a print of a special view containing all QRCodes.
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const qrCodesHtml = tables.filter(t => t.is_active).map(table => `
      <div class="qr-container">
        <div class="restaurant-name">${restaurantSlug.toUpperCase()}</div>
        <div class="table-title">MESA ${table.table_number}</div>
        <div id="qrcode-${table.id}" class="qrcode-placeholder"></div>
        <div class="footer">Escaneie para fazer seu pedido</div>
      </div>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Todos os QR Codes - ${restaurantSlug}</title>
          <style>
            body { font-family: sans-serif; margin: 0; padding: 20px; }
            .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 40px; }
            .qr-container { 
              border: 2px solid #eee; 
              padding: 30px; 
              border-radius: 15px; 
              text-align: center; 
              break-inside: avoid;
              display: flex;
              flex-direction: column;
              align-items: center;
            }
            .restaurant-name { font-weight: bold; color: #666; margin-bottom: 5px; font-size: 14px; }
            .table-title { font-size: 28px; font-weight: 900; margin-bottom: 20px; }
            .footer { margin-top: 20px; font-weight: 600; font-size: 14px; color: #444; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="grid">${qrCodesHtml}</div>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
          <script>
            ${tables.filter(t => t.is_active).map(table => `
              new QRCode(document.getElementById("qrcode-${table.id}"), {
                text: "${getQRCodeUrl(table.public_token)}",
                width: 200,
                height: 200
              });
            `).join('\n')}
            setTimeout(() => { window.print(); }, 1000);
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  function printQRCode(table: RestaurantTable) {
    const url = getQRCodeUrl(table.public_token);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Imprimir QR Code - Mesa ${table.table_number}</title>
          <style>
            body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { border: 2px solid #000; padding: 40px; border-radius: 20px; text-align: center; max-width: 400px; }
            h1 { margin-bottom: 10px; font-size: 32px; }
            p { color: #666; margin-bottom: 30px; }
            .footer { margin-top: 30px; font-weight: bold; font-size: 18px; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>MESA ${table.table_number}</h1>
            <p>${table.table_name || 'Escaneie para fazer seu pedido'}</p>
            <div id="qrcode"></div>
            <div class="footer">SiteCreatorFly</div>
          </div>
          <button class="no-print" style="margin-top: 20px; padding: 10px 20px; cursor: pointer;" onclick="window.print()">Imprimir</button>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
          <script>
            new QRCode(document.getElementById("qrcode"), {
              text: "${url}",
              width: 256,
              height: 256
            });
            setTimeout(() => { if(!window.location.search.includes('noprint')) window.print(); }, 500);
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <LayoutGrid className="h-6 w-6 text-primary" />
            Mesas e QR Codes
          </h2>
          <p className="text-sm text-muted-foreground">
            Gerencie as mesas do seu estabelecimento e gere QR Codes para pedidos locais.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={downloadAllQRCodes} disabled={tables.length === 0}>
            <Printer className="h-4 w-4 mr-2" />
            Baixar todos os QR Codes
          </Button>
          <Button variant="outline" size="sm" onClick={() => { loadTables(); loadSessions(); }} disabled={tablesLoading || sessionsLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${tablesLoading || sessionsLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="tables" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="tables" className="gap-2">
            <TableIcon className="h-4 w-4" /> Configurar Mesas
          </TabsTrigger>
          <TabsTrigger value="sessions" className="gap-2">
            <Receipt className="h-4 w-4" /> Comandas Abertas
            {sessions.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 w-5 flex items-center justify-center p-0 rounded-full text-[10px]">
                {sessions.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tables" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Cadastrar Nova Mesa</CardTitle>
              <CardDescription>Adicione mesas individualmente para gerar seus QR Codes exclusivos.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3 items-end">
                <div className="space-y-2">
                  <Label htmlFor="tableNumber">Número da Mesa</Label>
                  <Input 
                    id="tableNumber" 
                    placeholder="Ex: 01, 02, A1..." 
                    value={newTableNumber} 
                    onChange={e => setNewTableNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tableName">Nome/Local (Opcional)</Label>
                  <Input 
                    id="tableName" 
                    placeholder="Ex: Varanda, Área VIP..." 
                    value={newTableName} 
                    onChange={e => setNewTableName(e.target.value)}
                  />
                </div>
                <Button onClick={handleAddTable} disabled={isAdding || !newTableNumber} className="gap-2">
                  <Plus className="h-4 w-4" /> Adicionar Mesa
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tables.map(table => (
              <Card key={table.id} className={`overflow-hidden border-2 transition-all ${table.is_active ? 'border-border' : 'border-dashed opacity-60'}`}>
                <div className="p-4 bg-muted/30 border-b flex justify-between items-center">
                  <div className="font-black text-xl">MESA {table.table_number}</div>
                  <Badge variant={table.is_active ? "default" : "secondary"}>
                    {table.is_active ? "Ativa" : "Inativa"}
                  </Badge>
                </div>
                <CardContent className="p-4 space-y-4">
                  <div className="flex flex-col items-center justify-center py-4 bg-white rounded-lg border">
                    <QRCodeSVG value={getQRCodeUrl(table.public_token)} size={120} />
                    <div className="mt-2 text-[10px] text-muted-foreground font-mono truncate max-w-full px-2">
                      {table.public_token}
                    </div>
                  </div>
                  
                  {table.table_name && (
                    <div className="text-xs font-medium text-center text-muted-foreground italic">
                      "{table.table_name}"
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => printQRCode(table)}>
                      <Printer className="h-3 w-3" /> Imprimir
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="gap-1 text-xs"
                      onClick={() => {
                        setEditingTable(table);
                        setEditName(table.table_name || "");
                        setEditNumber(table.table_number);
                      }}
                    >
                      Renomear
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className={`gap-1 text-xs ${table.is_active ? 'text-orange-600' : 'text-green-600'}`}
                      onClick={() => toggleTable(table.id, !table.is_active)}
                    >
                      {table.is_active ? <PowerOff className="h-3 w-3" /> : <Power className="h-3 w-3" />}
                      {table.is_active ? 'Desativar' : 'Ativar'}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="gap-1 text-xs text-destructive"
                      onClick={() => {
                        if(confirm(`Tem certeza que deseja excluir a Mesa ${table.table_number}?`)) {
                          deleteTable(table.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" /> Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            
            {tables.length === 0 && !tablesLoading && (
              <div className="col-span-full py-12 text-center border-2 border-dashed rounded-xl text-muted-foreground">
                <TableIcon className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>Nenhuma mesa cadastrada ainda.</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="sessions" className="space-y-6 pt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sessions.map(session => (
              <Card key={session.id} className="overflow-hidden border-primary/20 shadow-md">
                <CardHeader className="bg-primary/5 pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-2xl font-black">MESA {session.table_number}</CardTitle>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" /> Aberta há {new Date(session.opened_at).toLocaleTimeString()}
                      </div>
                    </div>
                    <Badge className="bg-green-500 hover:bg-green-600">ABERTA</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                  <div className="flex justify-between items-end border-b pb-3">
                    <div className="text-sm font-medium text-muted-foreground uppercase">Total Acumulado</div>
                    <div className="text-2xl font-black text-primary">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(session.total_amount)}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-2">
                    <Button variant="default" size="sm" className="w-full gap-2" onClick={() => {
                      toast.info("Em breve: Visualização detalhada de pedidos da comanda.");
                    }}>
                      <ExternalLink className="h-4 w-4" /> Ver Comanda Detalhada
                    </Button>
                    <Button variant="outline" size="sm" className="w-full gap-2 text-green-600 border-green-200 hover:bg-green-50" onClick={() => {
                      if(confirm(`Deseja fechar a comanda da Mesa ${session.table_number}?`)) {
                        closeSession(session.id);
                      }
                    }}>
                      <CheckCircle2 className="h-4 w-4" /> Fechar Mesa / Comanda
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {sessions.length === 0 && !sessionsLoading && (
              <div className="col-span-full py-20 text-center border-2 border-dashed rounded-xl text-muted-foreground">
                <Receipt className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium">Nenhuma mesa aberta no momento.</p>
                <p className="text-sm">Os pedidos feitos via QR Code aparecerão aqui automaticamente.</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {editingTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Renomear Mesa {editingTable.table_number}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Número da Mesa</Label>
                <Input value={editNumber} onChange={e => setEditNumber(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Nome/Local</Label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditingTable(null)}>Cancelar</Button>
                <Button onClick={handleRename}>Salvar</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
