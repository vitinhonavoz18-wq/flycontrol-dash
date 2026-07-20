import { useEffect, useRef, useState, memo } from "react";

interface Stat {
  value: number;
  suffix: string;
  label: string;
}

const STATS: Stat[] = [
  { value: 120, suffix: "+", label: "Restaurantes ativos" },
  { value: 45000, suffix: "+", label: "Pedidos realizados" },
  { value: 99.9, suffix: "%", label: "Disponibilidade" },
];

function useCountUp(target: number, duration = 1800, start = false) {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!start) return;
    const startTime = performance.now();
    const startVal = 0;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(startVal + (target - startVal) * eased);
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, start]);

  return count;
}

function StatItem({ stat, animate }: { stat: Stat; animate: boolean }) {
  const count = useCountUp(stat.value, 1800, animate);
  const display =
    stat.value >= 1000
      ? `${Math.floor(count / 1000)}k`
      : stat.value % 1 !== 0
        ? count.toFixed(1)
        : Math.floor(count).toString();

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-2xl font-black tracking-tight text-white md:text-3xl">
        {display}
        <span className="text-primary">{stat.suffix}</span>
      </span>
      <span className="text-[11px] font-medium uppercase tracking-wider text-white/40">
        {stat.label}
      </span>
    </div>
  );
}

export const HeroStats = memo(function HeroStats() {
  const [animate, setAnimate] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setAnimate(true); },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="mt-10 flex items-center justify-center gap-8 md:gap-14"
    >
      {STATS.map((stat, i) => (
        <div key={i} className="flex items-center gap-8 md:gap-14">
          <StatItem stat={stat} animate={animate} />
          {i < STATS.length - 1 && (
            <div className="h-8 w-px bg-white/10" />
          )}
        </div>
      ))}
    </div>
  );
});
