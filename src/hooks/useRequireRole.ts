import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

// Gate a page on the session user having a specific role.
//
// Previously used `db.rpc('has_role', …)` which never shipped with
// the Supabase→Neon migration — the shim doesn't expose rpc at all,
// so this hook threw every render and bounced real doctors back to
// the login page.
//
// Current implementation: read the user_roles row through /api/db.
// The ownership enforcement injects `user_id = session.id`
// automatically, so the filter is safe and minimal.

export const useRequireRole = (
  role: 'doctor' | 'patient' | 'admin',
  redirectTo: string = '/'
) => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [hasRole, setHasRole] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      navigate(redirectTo);
      return;
    }

    const checkRole = async () => {
      try {
        const { data } = await db
          .from('user_roles')
          .select('role')
          .eq('role', role)
          .maybeSingle();

        if (!data) {
          setHasRole(false);
          toast({
            variant: 'destructive',
            title: 'Access denied',
            description: `You do not have ${role} privileges.`,
          });
          navigate(redirectTo);
        } else {
          setHasRole(true);
        }
      } catch {
        setHasRole(false);
        navigate(redirectTo);
      } finally {
        setChecking(false);
      }
    };

    checkRole();
  }, [user, authLoading, role, redirectTo, navigate, toast]);

  return { hasRole, loading: authLoading || checking };
};
