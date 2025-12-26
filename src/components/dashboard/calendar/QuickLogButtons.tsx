import { Heart, Smile, AlertCircle, Droplets } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickLogButtonsProps {
  onLogSymptoms: () => void;
  onLogMood: () => void;
  onLogIntimacy: () => void;
  onLogDischarge: () => void;
}

const QuickLogButtons = ({
  onLogSymptoms,
  onLogMood,
  onLogIntimacy,
  onLogDischarge
}: QuickLogButtonsProps) => {
  return (
    <div className="space-y-4">
      {/* Sexual activity section */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3 px-1">Sexual activity</h4>
        <div className="grid grid-cols-4 gap-3">
          <button
            onClick={onLogIntimacy}
            className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Heart className="h-6 w-6 text-primary" fill="currentColor" />
            </div>
            <span className="text-xs text-muted-foreground text-center">Unprotected sex</span>
          </button>
          
          <button
            onClick={onLogIntimacy}
            className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Heart className="h-6 w-6 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground text-center">Protected sex</span>
          </button>
          
          <button
            onClick={onLogIntimacy}
            className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Heart className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground text-center">Masturbation</span>
          </button>
          
          <button
            onClick={onLogIntimacy}
            className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xl">💋</span>
            </div>
            <span className="text-xs text-muted-foreground text-center">Kissing</span>
          </button>
        </div>
      </div>

      {/* Symptoms section */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h4 className="text-sm font-medium text-muted-foreground">Symptoms</h4>
          <button 
            onClick={onLogSymptoms}
            className="text-xs text-primary font-medium hover:underline"
          >
            Show all →
          </button>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <button
            onClick={onLogDischarge}
            className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center">
              <Droplets className="h-6 w-6 text-secondary" />
            </div>
            <span className="text-xs text-muted-foreground text-center">Cervical mucus</span>
          </button>
          
          <button
            onClick={onLogSymptoms}
            className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <span className="text-xl">🙍‍♀️</span>
            </div>
            <span className="text-xs text-muted-foreground text-center">Abdominal cramps</span>
          </button>
          
          <button
            onClick={onLogSymptoms}
            className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground text-center">Spotting</span>
          </button>
          
          <button
            onClick={onLogSymptoms}
            className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <span className="text-xl">😩</span>
            </div>
            <span className="text-xs text-muted-foreground text-center">Fatigue</span>
          </button>
        </div>
      </div>

      {/* Mood section */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h4 className="text-sm font-medium text-muted-foreground">Mood</h4>
          <button 
            onClick={onLogMood}
            className="text-xs text-primary font-medium hover:underline"
          >
            Show all →
          </button>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {['😊', '😢', '😡', '😰', '🥰'].map((emoji, i) => (
            <button
              key={i}
              onClick={onLogMood}
              className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-muted/50 transition-colors"
            >
              <span className="text-2xl">{emoji}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default QuickLogButtons;