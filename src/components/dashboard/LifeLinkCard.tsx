import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { ChevronRight, type LucideIcon } from 'lucide-react';

// A tappable card that opens a life-cycle page (Labour & birth, Baby).
export default function LifeLinkCard({ to, icon: Icon, title, description }: { to: string; icon: LucideIcon; title: string; description: string }) {
  const navigate = useNavigate();
  return (
    <Card role="link" tabIndex={0} onClick={() => navigate(to)} onKeyDown={e => { if (e.key === 'Enter') navigate(to); }}
      className="p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/40 transition-colors">
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Card>
  );
}
