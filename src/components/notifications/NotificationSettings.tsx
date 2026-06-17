import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Volume2, Bell, BellRing, AlertTriangle } from "lucide-react";
import {
  loadSettings,
  saveSettings,
  playSound,
  unlockAudio,
  type NotificationSettings as Settings,
} from "@/lib/notification-sounds";

export function NotificationSettings() {
  const [settings, setSettings] = useState<Settings>({ enabled: true, volume: 0.7 });

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  function update(patch: Partial<Settings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  }

  async function test(kind: "new_order" | "close_request" | "alert") {
    await unlockAudio();
    playSound(kind);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="h-5 w-5 text-primary" /> Notificações Sonoras
        </CardTitle>
        <CardDescription>
          Configure os sons de alerta para novos pedidos e pedidos de fechamento de mesa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="notif-enabled" className="font-medium">Ativar sons de notificação</Label>
            <p className="text-xs text-muted-foreground">Sons tocam mesmo com o painel em segundo plano.</p>
          </div>
          <Switch
            id="notif-enabled"
            checked={settings.enabled}
            onCheckedChange={(v) => update({ enabled: v })}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="font-medium">Volume</Label>
            <span className="text-sm text-muted-foreground">{Math.round(settings.volume * 100)}%</span>
          </div>
          <Slider
            value={[Math.round(settings.volume * 100)]}
            min={0}
            max={100}
            step={5}
            onValueChange={(v) => update({ volume: (v[0] ?? 0) / 100 })}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-3 pt-2">
          <Button variant="outline" size="sm" onClick={() => test("new_order")}>
            <Bell className="h-4 w-4 mr-2" /> Testar Novo Pedido
          </Button>
          <Button variant="outline" size="sm" onClick={() => test("close_request")}>
            <BellRing className="h-4 w-4 mr-2" /> Testar Fechar Mesa
          </Button>
          <Button variant="outline" size="sm" onClick={() => test("alert")}>
            <AlertTriangle className="h-4 w-4 mr-2" /> Testar Alerta
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Se o navegador bloquear o áudio, um botão aparecerá no canto inferior direito para ativar os sons.
        </p>
      </CardContent>
    </Card>
  );
}
