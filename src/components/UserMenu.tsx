import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, Shield } from 'lucide-react';

export default function UserMenu() {
  const navigate = useNavigate();
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="flex items-center gap-1">
      {user.isAdmin && (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs text-muted-foreground hover:text-primary"
          onClick={() => navigate('/admin/doctors')}
          aria-label="Admin doctor approvals"
        >
          <Shield className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Admin</span>
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-xs text-muted-foreground hover:text-destructive"
        onClick={() => { window.location.href = '/api/auth/logout'; }}
      >
        <LogOut className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Log out</span>
      </Button>
    </div>
  );
}
