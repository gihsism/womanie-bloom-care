import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// "We couldn't load X." + Try again — the same card Find a Doctor already
// shows when its list fails, shared so a failed load never looks like an
// empty account ("No documents yet") or a screen that just stays blank.
export function LoadFailed({ message, onRetry, className }: { message: string; onRetry: () => void; className?: string }) {
  return (
    <Card className={cn('p-8 text-center', className)} role="alert">
      <p className="text-muted-foreground mb-4">{message}</p>
      <Button variant="outline" onClick={onRetry}>Try again</Button>
    </Card>
  );
}
