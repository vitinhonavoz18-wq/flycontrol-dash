import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Layout, PieChart, Zap, Smartphone, CheckCircle2, Home, ArrowRight } from "lucide-react";
import logo from "@/assets/flycontrol-logo-hero.png";

export const Route = createFileRoute("/presentation")({
  component: PresentationPage,
});

const slides = [
  {
    title: "FlyControl",
    subtitle: "A revolução na gestão do seu delivery",
    content: "O sistema centralizado que conecta seus sites de vendas diretamente à sua operação.",
    icon: <img src={logo} alt="Logo" className="w-64 md:w-80 mx-auto mb-8 drop-shadow-2xl" />,
    color: "from-orange-500 to-red-600",
  },
  {
    title: "O Problema",
    subtitle: "O caos na gestão de pedidos",
    content: "Pedidos perdidos no WhatsApp, demora na cozinha e falta de visão do faturamento real. O delivery manual não escala.",
    features: [
      "Pedidos espalhados em múltiplas fontes",
      "Erros de anotação e esquecimento",
      "Dificuldade em medir o ticket médio",
      "Processo lento de impressão e preparo"
    ],
    icon: <Layout className="w-20 h-20 text-red-400 mb-6" />,
    color: "from-red-600 to-pink-700",
  },
  {
    title: "A Solução",
    subtitle: "Ecossistema FlyControl + SiteCreatorFly",
    content: "Uma ponte direta entre o cliente e o seu painel. O pedido sai do site e aparece instantaneamente na sua tela.",
    features: [
      "Integração via API Key super simples",
      "Recebimento em tempo real (Real-time)",
      "Alerta sonoro para cada novo pedido",
      "Interface limpa e focada na produtividade"
    ],
    icon: <Zap className="w-20 h-20 text-yellow-400 mb-6" />,
    color: "from-orange-400 to-yellow-600",
  },
  {
    title: "Funcionalidades Elite",
    subtitle: "Tudo o que você precisa em um só lugar",
    content: "Desenvolvido para pizzarias e deliveries que buscam profissionalismo.",
    features: [
      "Impressão Automática (Comandas formatadas)",
      "Dashboard de Métricas e Faturamento",
      "Integração FIQON (Sincronização externa)",
      "Multi-tenant (Várias lojas em um só usuário)"
    ],
    icon: <PieChart className="w-20 h-20 text-blue-400 mb-6" />,
    color: "from-blue-600 to-indigo-700",
  },
  {
    title: "Como Funciona?",
    subtitle: "Fluxo simplificado",
    content: "O ciclo de vida de um pedido no ecossistema FlyControl.",
    steps: [
      "1. Cliente faz o pedido no SiteCreatorFly",
      "2. FlyControl recebe via Webhook/API",
      "3. Notificação sonora e visual no painel",
      "4. Impressão e despacho para entrega"
    ],
    icon: <Smartphone className="w-20 h-20 text-green-400 mb-6" />,
    color: "from-green-600 to-emerald-700",
  },
  {
    title: "Pronto para decolar?",
    subtitle: "Comece hoje mesmo a transformar seu delivery",
    content: "O FlyControl é a ferramenta definitiva para quem quer crescer com organização.",
    icon: <CheckCircle2 className="w-24 h-24 text-primary mb-6 animate-bounce" />,
    color: "from-primary to-orange-700",
    isLast: true
  }
];

function PresentationPage() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev === slides.length - 1 ? prev : prev + 1));
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev === 0 ? prev : prev - 1));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") nextSlide();
      if (e.key === "ArrowLeft") prevSlide();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextSlide, prevSlide]);

  const slide = slides[currentSlide];

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-background font-sans text-foreground transition-all duration-700">
      {/* Background Gradient */}
      <div 
        className={`absolute inset-0 -z-10 bg-gradient-to-br opacity-20 transition-all duration-1000 ${slide.color}`} 
      />
      
      {/* Navigation Header */}
      <header className="flex items-center justify-between p-6 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <img src={logo} alt="Logo" className="h-8 w-auto" />
          <span className="text-sm font-medium opacity-60">Apresentação Oficial</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="sm" className="gap-2">
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Página Inicial</span>
            </Button>
          </Link>
          <div className="text-sm font-mono opacity-50">
            {currentSlide + 1} / {slides.length}
          </div>
        </div>
      </header>

      {/* Slide Content */}
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div 
          key={currentSlide}
          className="mx-auto flex max-w-4xl flex-col items-center text-center animate-in fade-in slide-in-from-bottom-8 duration-500"
        >
          {slide.icon && (
            <div className="mb-6">
              {slide.icon}
            </div>
          )}
          
          <h1 className="mb-2 text-4xl font-extrabold tracking-tight md:text-6xl lg:text-7xl">
            {slide.title}
          </h1>
          
          <h2 className="mb-8 text-xl font-medium text-primary md:text-2xl">
            {slide.subtitle}
          </h2>
          
          <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
            {slide.content}
          </p>

          {slide.features && (
            <div className="mt-10 grid gap-4 text-left md:grid-cols-2">
              {slide.features.map((f, i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg border border-border/50 bg-card/40 p-4 backdrop-blur-sm">
                  <CheckCircle2 className="mt-1 h-5 w-5 flex-shrink-0 text-primary" />
                  <span className="text-base">{f}</span>
                </div>
              ))}
            </div>
          )}

          {slide.steps && (
            <div className="mt-10 flex flex-col gap-4 text-left w-full max-w-xl">
              {slide.steps.map((s, i) => (
                <div key={i} className="flex items-center gap-4 rounded-xl border border-primary/20 bg-primary/5 p-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                    {i + 1}
                  </div>
                  <span className="text-lg font-medium">{s}</span>
                </div>
              ))}
            </div>
          )}

          {slide.isLast && (
            <div className="mt-12 flex flex-col gap-4 sm:flex-row">
              <Link to="/signup" className="w-full sm:w-auto">
                <Button size="lg" className="h-14 w-full px-8 text-lg font-bold shadow-lg shadow-primary/20 sm:w-auto">
                  Criar Conta Grátis
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/login" className="w-full sm:w-auto">
                <Button variant="outline" size="lg" className="h-14 w-full px-8 text-lg font-semibold sm:w-auto">
                  Acessar Painel
                </Button>
              </Link>
            </div>
          )}
        </div>
      </main>

      {/* Progress Bar */}
      <div className="h-1 w-full bg-border/20">
        <div 
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${((currentSlide + 1) / slides.length) * 100}%` }}
        />
      </div>

      {/* Navigation Controls */}
      <footer className="flex items-center justify-between p-6">
        <Button
          variant="outline"
          size="icon"
          onClick={prevSlide}
          disabled={currentSlide === 0}
          className="h-12 w-12 rounded-full border-border/60 bg-card/40"
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>

        <div className="hidden gap-2 md:flex">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                currentSlide === i ? "w-8 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
              }`}
            />
          ))}
        </div>

        <Button
          onClick={nextSlide}
          disabled={currentSlide === slides.length - 1}
          className="group h-12 w-12 rounded-full shadow-lg shadow-primary/20"
        >
          <ChevronRight className="h-6 w-6 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </footer>
    </div>
  );
}
