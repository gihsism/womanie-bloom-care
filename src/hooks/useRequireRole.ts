import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export const useRequireRole = (role: 'doctor' | 'patient' | 'admin', redirectTo: string = '/') => {
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
        const { data, error } = await supabase.rpc('has_role', {
          _user_id: user.id,
          _role: role,
        });

        if (error || !data) {
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
