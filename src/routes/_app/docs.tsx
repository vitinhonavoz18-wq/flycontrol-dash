import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/docs")({ component: DocsPage });

function DocsPage() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "https://flycontrol.lovable.app";
  const orderEndpoint = `${origin}/api/orders`;
  const healthEndpoint = `${origin}/api/health`;

  const examplePayload = `{
  "api_key": "SUA_API_KEY",
  "customer": {
    "name": "João Silva",
    "phone": "71999999999",
    "address": "Rua das Flores, 123 - Centro"
  },
  "items": [
    {
      "name": "Pizza Calabresa G",
      "qty": 1,
      "price": 49.90
    },
    {
      "name": "Coca-Cola 2L",
      "qty": 1,
      "price": 12.00
    }
  ],
  "total": 61.90
}`;

  const curlExample = `curl -X POST ${orderEndpoint} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer SUA_API_KEY" \\
  -d '${examplePayload}'`;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Documentação de Integração</h1>
        <p className="mt-2 text-muted-foreground">
          Aprenda como conectar o SiteCreatorFly (ou qualquer outro sistema) ao painel FlyControl.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Como Conectar uma Pizzaria</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <p>Existem duas formas de integrar uma pizzaria:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Nova Pizzaria:</strong> Ao criar uma pizzaria no FlyControl, uma <code>API Key</code> exclusiva é gerada. Copie esta chave e cole nas configurações do seu site no SiteCreatorFly.
            </li>
            <li>
              <strong>Pizzaria Existente:</strong> Se você já tem uma pizzaria no SiteCreatorFly com uma API Key, use a opção <strong>"Conectar Pizzaria Existente"</strong> no Dashboard do FlyControl e cole a chave original.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Endpoints da API</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Criar Pedido (POST)</h3>
            <div className="flex items-center gap-2 p-2 bg-muted rounded border font-mono text-xs">
              <span className="text-primary font-bold">POST</span>
              <span className="flex-1 truncate">{orderEndpoint}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copy(orderEndpoint, "endpoint")}>
                {copied === "endpoint" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Envie pedidos novos para processamento imediato.</p>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Health Check (GET)</h3>
            <div className="flex items-center gap-2 p-2 bg-muted rounded border font-mono text-xs">
              <span className="text-success font-bold">GET</span>
              <span className="flex-1 truncate">{healthEndpoint}</span>
            </div>
            <p className="text-xs text-muted-foreground">Verifique se o sistema está online.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Autenticação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>Você pode autenticar suas requisições de duas formas:</p>
          <div className="space-y-3">
            <div>
              <p className="font-medium mb-1">Via Header (Recomendado):</p>
              <code className="block p-2 bg-muted rounded border text-xs">Authorization: Bearer SUA_API_KEY</code>
            </div>
            <div>
              <p className="font-medium mb-1">Via Payload JSON:</p>
              <code className="block p-2 bg-muted rounded border text-xs">"api_key": "SUA_API_KEY"</code>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Exemplo de Requisição (cURL)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <pre className="p-4 bg-slate-950 text-slate-50 rounded-lg overflow-x-auto text-xs leading-relaxed">
              {curlExample}
            </pre>
            <Button 
              variant="secondary" 
              size="sm" 
              className="absolute top-2 right-2 h-7"
              onClick={() => copy(curlExample, "curl")}
            >
              {copied === "curl" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied === "curl" ? " Copiado" : " Copiar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
