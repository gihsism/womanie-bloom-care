import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { syncAccountData } from '@/lib/account-data';

interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  isAdmin?: boolean;
  hasPassword?: boolean;
  user_metadata?: {
    full_name?: string;
  };
  created_at?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  session: { access_token: string } | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check session on mount
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.user) {
          // Remembered so the login page can pre-fill it next time.
          try {
            if (data.user.email) localStorage.setItem('womanie_last_email', data.user.email);
            // Google-only accounts have no password: the login page then leads with Google.
            if (data.user.hasPassword === false) localStorage.setItem('womanie_last_method', 'google');
          } catch { /* storage blocked */ }
          setUser({
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            isAdmin: Boolean(data.user.isAdmin),
            hasPassword: data.user.hasPassword !== false,
            created_at: data.user.created_at ?? undefined,
            user_metadata: { full_name: data.user.name },
          });
          // Bring device-only personal data into the account (only where
          // the account has nothing yet) and refresh the local copy from it.
          void syncAccountData(data.user.id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const session = user ? { access_token: user.id } : null;

  return (
    <AuthContext.Provider value={{ user, session, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
