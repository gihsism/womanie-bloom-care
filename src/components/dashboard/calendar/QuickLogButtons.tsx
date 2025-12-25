import { Droplet, Heart, Moon, Smile, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface QuickLogButtonsProps {
  onLogPeriod: () => void;
  onLogSymptoms: () => void;
  onLogMood: () => void;
  onLogIntimacy: () => void;
  isPeriodActive?: boolean;
}

const QuickLogButtons = ({
  onLogPeriod,
  onLogSymptoms,
  onLogMood,
  onLogIntimacy,
  isPeriodActive = false
}: QuickLogButtonsProps) => {
  const buttons = [
    {
      label: isPeriodActive ? 'End Period' : 'Log Period',
      icon: Droplet,
      onClick: onLogPeriod,
      variant: 'primary' as const,
      className: 'bg-primary hover:bg-primary/90 text-primary-foreground'
    },
    {
      label: 'Symptoms',
      icon: Plus,
      onClick: onLogSymptoms,
      variant: 'secondary' as const,
      className: 'bg-muted hover:bg-muted/80 text-muted-foreground'
    },
    {
      label: 'Mood',
      icon: Smile,
      onClick: onLogMood,
      variant: 'secondary' as const,
      className: 'bg-muted hover:bg-muted/80 text-muted-foreground'
    },
    {
      label: 'Intimacy',
      icon: Heart,
      onClick: onLogIntimacy,
      variant: 'secondary' as const,
      className: 'bg-muted hover:bg-muted/80 text-muted-foreground'
    }
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2">
      {buttons.map((button) => {
        const Icon = button.icon;
        return (
          <Button
            key={button.label}
            onClick={button.onClick}
            variant="ghost"
            size="sm"
            className={cn(
              "flex-shrink-0 gap-1.5 rounded-full px-4 h-9",
              button.className
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="text-xs font-medium">{button.label}</span>
          </Button>
        );
      })}
    </div>
  );
};

export default QuickLogButtons;
