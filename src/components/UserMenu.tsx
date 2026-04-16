import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export default function UserMenu() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 text-xs text-muted-foreground hover:text-destructive"
      onClick={() => { window.location.href = '/api/auth/logout'; }}
    >
      <LogOut className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Log out</span>
    </Button>
  );
}
