import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Copy, ExternalLink, Download, FileText, Share2 } from "lucide-react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { useRef, useState } from "react";

interface PizzeriaPromotionProps {
  pizzeria: {
    id: string;
    name: string;
    slug: string;
  };
}

export function PizzeriaPromotion({ pizzeria }: PizzeriaPromotionProps) {
  const qrRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);

  // URL base - Pode ser configurada via variável de ambiente no futuro
  const baseUrl = "https://conectfly.com.br";
  const publicUrl = `${baseUrl}/${pizzeria.slug}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(publicUrl);
    toast.success("Link do cardápio copiado!");
  };

  const openMenu = () => {
    window.open(publicUrl, "_blank");
  };

  const downloadPng = async () => {
    if (!qrRef.current) return;
    setLoading(true);
    try {
      const dataUrl = await toPng(qrRef.current, { backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.download = `qrcode-conectfly-${pizzeria.slug}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("QR Code baixado com sucesso!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao baixar QR Code");
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = async () => {
    if (!qrRef.current) return;
    setLoading(true);
    try {
      const dataUrl = await toPng(qrRef.current, { backgroundColor: "#ffffff" });
      const pdf = new jsPDF();
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      // Adicionar Título
      pdf.setFontSize(20);
      pdf.text("Cardápio Digital", pdfWidth / 2, 20, { align: "center" });
      pdf.setFontSize(16);
      pdf.text(pizzeria.name, pdfWidth / 2, 30, { align: "center" });

      // Adicionar QR Code centralizado
      const qrSize = 100;
      const x = (pdfWidth - qrSize) / 2;
      pdf.addImage(dataUrl, "PNG", x, 40, qrSize, qrSize);

      // Adicionar Link
      pdf.setFontSize(12);
      pdf.setTextColor(0, 0, 255);
      pdf.text(publicUrl, pdfWidth / 2, 40 + qrSize + 10, { align: "center" });

      pdf.save(`qrcode-conectfly-${pizzeria.slug}.pdf`);
      toast.success("PDF gerado com sucesso!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar PDF");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mt-6 border-t border-border pt-4 p-4">
      <div className="mb-4 flex items-center gap-2">
        <Share2 className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Divulgação do Cardápio</h3>
      </div>

      <p className="mb-6 text-sm text-muted-foreground">
        Compartilhe seu cardápio com seus clientes usando o link ou QR Code abaixo.
      </p>

      <div className="flex flex-col items-center gap-8 md:flex-row md:items-start md:justify-around">
        {/* QR Code Preview */}
        <div className="flex flex-col items-center gap-4">
          <div 
            ref={qrRef}
            className="rounded-xl border border-border bg-white p-4 shadow-sm"
          >
            <QRCodeSVG 
              value={publicUrl} 
              size={180} 
              level="H"
              includeMargin={false}
            />
          </div>
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
            Scan para Pedir
          </span>
        </div>

        {/* Actions */}
        <div className="flex w-full flex-col gap-4 md:max-w-xs">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Link Público</label>
            <div className="flex items-center gap-2">
              <input 
                readOnly 
                value={publicUrl} 
                className="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <Button size="icon" variant="outline" onClick={copyToClipboard} title="Copiar Link">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={openMenu} className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Abrir Cardápio
            </Button>
            <Button 
              variant="outline" 
              onClick={downloadPng} 
              disabled={loading}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Baixar PNG
            </Button>
            <Button 
              variant="outline" 
              onClick={downloadPdf} 
              disabled={loading}
              className="gap-2 sm:col-span-2"
            >
              <FileText className="h-4 w-4" />
              Baixar PDF do Cardápio
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
