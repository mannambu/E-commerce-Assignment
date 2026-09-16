import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  unit?: string;
  change: string;
  isPositive: boolean;
  icon: ReactNode;
  iconBgColor: string;
  className?: string;
}

export default function StatCard({
  title,
  value,
  unit,
  change,
  isPositive,
  icon,
  iconBgColor,
  className,
}: StatCardProps) {
  return (
    <div className={cn("bg-white p-5 rounded-[24px] shadow-sm border border-gray-50 flex items-center gap-4", className)}>
      <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0", iconBgColor)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{title}</p>
        <div className="flex items-baseline gap-1 mt-1">
          <h3 className="text-xl font-black text-gray-900">{value}</h3>
          {unit && <span className="text-xs font-bold text-gray-400">{unit}</span>}
        </div>
        <div className={cn(
          "flex items-center gap-1 mt-1 text-[10px] font-bold",
          isPositive ? "text-green-500" : "text-red-500"
        )}>
          {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          <span>{change} vs last week</span>
        </div>
      </div>
    </div>
  );
}
