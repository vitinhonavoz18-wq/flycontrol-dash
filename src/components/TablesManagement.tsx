import { useState, useEffect } from "react";
import { useTables, useTableSessions, type RestaurantTable, type TableSession } from "@/hooks/useTables";
import { supabase } from "@/integrations/supabase/client";
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
  const { sessions, loading: sessionsLoading, closeSession, loadSessions, toggleServiceFee } = useTableSessions(tenantId);
  const [selectedSession, setSelectedSession] = useState<TableSession | null>(null);
  const [sessionOrders, setSessionOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  
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

  function getQRCodeUrl(table: RestaurantTable) {
    const baseUrl = "https://conectfly.com.br";
    return `${baseUrl}/${restaurantSlug}?mode=table&table_number=${table.table_number}&table_token=${table.public_token}`;
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
                text: "${getQRCodeUrl(table)}",
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
    const url = getQRCodeUrl(table);
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

  async function loadSessionOrders(sessionId: string) {
    setLoadingOrders(true);
    const { data, error } = await supabase
      .from("table_session_orders")
      .select(`
        order_id,
        orders (*)
      `)
      .eq("table_session_id", sessionId);

    if (error) {
      toast.error("Erro ao carregar pedidos: " + error.message);
    } else {
      setSessionOrders((data || []).map((d: any) => d.orders));
    }
    setLoadingOrders(false);
  }

  function handlePrintComanda(session: TableSession, orders: any[]) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const itemsHtml = orders.map(order => `
      <div class="order-block">
        <div class="order-header">Pedido #${order.id.substring(0, 8)} - ${new Date(order.created_at).toLocaleTimeString()}</div>
        <div class="customer">${order.customer_name || 'Cliente'}</div>
        <div class="items">
          ${(order.items || []).map((item: any) => `
            <div class="item">
              <span class="qty">${item.quantity}x</span>
              <span class="name">${item.product_name || item.name}</span>
              <span class="price">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total_price || (item.quantity * (item.unit_price || item.price || 0)))}</span>
            </div>
          `).join('')}
        </div>
        ${order.notes ? `<div class="notes">Obs: ${order.notes}</div>` : ''}
      </div>
    `).join('<hr/>');

    printWindow.document.write(`
      <html>
        <head>
          <title>Comanda Mesa ${session.table_number}</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; width: 300px; padding: 10px; font-size: 12px; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
            .restaurant { font-weight: bold; font-size: 16px; margin-bottom: 5px; }
            .title { font-size: 14px; font-weight: bold; }
            .order-block { margin-bottom: 10px; }
            .order-header { font-weight: bold; margin-bottom: 3px; }
            .customer { font-style: italic; margin-bottom: 5px; }
            .item { display: flex; justify-content: space-between; margin-bottom: 2px; }
            .qty { width: 30px; }
            .name { flex: 1; }
            .price { width: 70px; text-align: right; }
            .notes { font-size: 10px; color: #555; margin-top: 3px; }
            .summary { margin-top: 20px; border-top: 1px dashed #000; pt-5; }
            .summary-row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 14px; }
            .total-row { font-weight: bold; font-size: 18px; border-top: 1px solid #000; padding-top: 5px; }
            .footer { text-align: center; margin-top: 30px; border-top: 1px dashed #000; padding-top: 10px; font-weight: bold; }
            hr { border: none; border-top: 1px dotted #ccc; margin: 10px 0; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="restaurant">${restaurantSlug.toUpperCase()}</div>
            <div class="title">MESA ${session.table_number}</div>
            <div>Sessão: ${session.id.substring(0, 8)}</div>
            <div>Abertura: ${new Date(session.opened_at).toLocaleString()}</div>
            ${session.status === 'closed' ? `<div>Fechamento: ${new Date().toLocaleString()}</div>` : ''}
          </div>
          
          <div class="content">
            ${itemsHtml}
          </div>

          <div class="summary">
            <div class="summary-row">
              <span>Subtotal:</span>
              <span>${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(session.subtotal_amount)}</span>
            </div>
            ${session.service_fee_enabled ? `
              <div class="summary-row">
                <span>Taxa Garçom (15%):</span>
                <span>${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(session.service_fee_amount)}</span>
              </div>
              <div style="font-size: 9px; text-align: right; margin-bottom: 5px;">Taxa de garçom de 15% aplicada ao total.</div>
            ` : ''}
            <div class="summary-row total-row">
              <span>TOTAL FINAL:</span>
              <span>${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(session.total_amount)}</span>
            </div>
          </div>

          <div class="footer">
            Obrigado pela preferência!
          </div>
          <script>
            setTimeout(() => { window.print(); window.close(); }, 500);
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
                    <QRCodeSVG value={getQRCodeUrl(table)} size={120} />
                    <div className="mt-4 w-full space-y-1 px-2">
                      <div className="flex justify-between text-[10px] text-muted-foreground border-b pb-1">
                        <span className="font-bold">Token:</span>
                        <span className="font-mono">{table.public_token}</span>
                      </div>
                      <div className="flex flex-col text-[9px] text-muted-foreground pt-1 overflow-hidden">
                        <span className="font-bold">URL do QR Code:</span>
                        <span className="font-mono break-all leading-tight bg-muted/50 p-1 rounded mt-1">
                          {getQRCodeUrl(table)}
                        </span>
                      </div>
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
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-muted-foreground">Pedidos:</span>
                    <Badge variant="outline" className="font-bold">{session.order_count || 0}</Badge>
                  </div>
                  <div className="space-y-2 text-sm border-b pb-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal:</span>
                      <span className="font-medium">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(session.subtotal_amount)}</span>
                    </div>
                    {session.service_fee_enabled && (
                      <div className="flex justify-between text-orange-600">
                        <span>Taxa Garçom (15%):</span>
                        <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(session.service_fee_amount)}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-end pb-3">
                    <div className="text-sm font-bold uppercase">Total Final</div>
                    <div className="text-2xl font-black text-primary">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(session.total_amount)}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className={`col-span-2 gap-2 ${session.service_fee_enabled ? 'text-destructive border-destructive/20' : 'text-orange-600 border-orange-200'}`} 
                      onClick={() => toggleServiceFee(session.id, !session.service_fee_enabled)}
                    >
                      <Receipt className="h-4 w-4" /> 
                      {session.service_fee_enabled ? "Remover 15%" : "Adicionar 15%"}
                    </Button>
                    <Button variant="default" size="sm" className="gap-2" onClick={() => {
                      setSelectedSession(session);
                      loadSessionOrders(session.id);
                    }}>
                      <ExternalLink className="h-4 w-4" /> Ver Comanda
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2" onClick={async () => {
                      const { data: ordersData } = await supabase
                        .from("table_session_orders")
                        .select("orders (*)")
                        .eq("table_session_id", session.id);
                      handlePrintComanda(session, (ordersData || []).map((d: any) => d.orders) || []);
                    }}>
                      <Printer className="h-4 w-4" /> Imprimir Prévia
                    </Button>
                    <Button variant="outline" size="sm" className="col-span-2 gap-2 text-green-600 border-green-200 hover:bg-green-50" onClick={() => {
                      setSelectedSession(session);
                      setShowPrintModal(true);
                      loadSessionOrders(session.id);
                    }}>
                      <CheckCircle2 className="h-4 w-4" /> Fechar Mesa
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
      {selectedSession && !showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <CardHeader className="border-b">
              <div className="flex justify-between items-center">
                <CardTitle>Comanda Mesa {selectedSession.table_number}</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setSelectedSession(null)}>Fechar</Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-6">
              {loadingOrders ? (
                <div className="flex justify-center py-10"><RefreshCw className="animate-spin h-8 w-8 text-primary" /></div>
              ) : sessionOrders.length === 0 ? (
                <p className="text-center py-10 text-muted-foreground">Nenhum pedido vinculado a esta sessão.</p>
              ) : (
                sessionOrders.map((order, idx) => (
                  <div key={order.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-start border-b pb-2">
                      <div>
                        <span className="font-bold text-lg">Pedido #{order.id.substring(0, 8)}</span>
                        <div className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString()}</div>
                      </div>
                      <Badge variant="outline">{order.customer_name}</Badge>
                    </div>
                    <div className="space-y-2">
                      {(order.items || []).map((item: any, i: number) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span>{item.quantity}x {item.product_name || item.name}</span>
                          <span className="font-mono">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total_price || (item.quantity * (item.unit_price || item.price || 0)))}
                          </span>
                        </div>
                      ))}
                    </div>
                    {order.notes && <div className="text-xs italic bg-muted p-2 rounded">Obs: {order.notes}</div>}
                    <div className="flex justify-end pt-2 font-bold border-t">
                      Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total)}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
            <div className="border-t p-4 bg-muted/20 space-y-3">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span className="font-medium">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedSession.subtotal_amount)}</span>
              </div>
              {selectedSession.service_fee_enabled && (
                <div className="flex justify-between text-sm text-orange-600">
                  <span>Taxa Garçom (15%):</span>
                  <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedSession.service_fee_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-black text-primary pt-2 border-t">
                <span>TOTAL FINAL:</span>
                <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedSession.total_amount)}</span>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => handlePrintComanda(selectedSession, sessionOrders)}>
                  <Printer className="h-4 w-4 mr-2" /> Imprimir
                </Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => {
                  setShowPrintModal(true);
                }}>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Fechar Mesa
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {showPrintModal && selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Fechar Mesa {selectedSession.table_number}</CardTitle>
              <CardDescription>Confira o resumo final antes de fechar a comanda.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 py-4">
              <div className="space-y-2 border-b pb-4">
                <div className="flex justify-between text-sm">
                  <span>Mesa:</span>
                  <span className="font-bold">{selectedSession.table_number}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Pedidos:</span>
                  <span className="font-bold">{sessionOrders.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span className="font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedSession.subtotal_amount)}</span>
                </div>
                {selectedSession.service_fee_enabled && (
                  <div className="flex justify-between text-sm text-orange-600">
                    <span>Taxa Garçom (15%):</span>
                    <span className="font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedSession.service_fee_amount)}</span>
                  </div>
                )}
              </div>
              <div className="flex justify-between text-2xl font-black text-primary py-2">
                <span>TOTAL:</span>
                <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedSession.total_amount)}</span>
              </div>
              {selectedSession.service_fee_enabled && (
                <p className="text-[10px] text-center text-muted-foreground">
                  Taxa de garçom de 15% aplicada ao total da comanda.
                </p>
              )}
            </CardContent>
            <div className="p-4 bg-muted/20 border-t flex flex-col gap-2">
              <Button className="w-full h-12 text-lg font-bold" onClick={() => {
                handlePrintComanda(selectedSession, sessionOrders);
                closeSession(selectedSession.id);
                setSelectedSession(null);
                setShowPrintModal(false);
              }}>
                Confirmar e Imprimir
              </Button>
              <Button variant="ghost" onClick={() => setShowPrintModal(false)}>Cancelar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
