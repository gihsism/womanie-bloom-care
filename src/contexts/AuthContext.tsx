import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
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
  /** No consent_log row for the current privacy-policy version (see ConsentGate). */
  consentRequired?: boolean;
  /** 'new' = never accepted; 'updated' = accepted an older version. */
  consentReason?: 'new' | 'updated' | null;
}

interface AuthContextType {
  user: AuthUser | null;
  session: { access_token: string } | null;
  loading: boolean;
  /** Called by the consent screen once the server recorded her acceptance. */
  markConsentAccepted: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  markConsentAccepted: () => {},
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
    // Check session on mount. index.html already started this exact request
    // before the JS bundle downloaded (saves a full round trip on a cold
    // load over mobile data); use it once, else fetch as usual.
    const w = window as unknown as { __womanieMe?: Promise<Response> };
    const early = w.__womanieMe;
    w.__womanieMe = undefined;
    (early ?? fetch('/api/auth/me', { credentials: 'include' }))
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
            consentRequired: data.user.consentRequired === true,
            consentReason: data.user.consentReason ?? null,
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

  const markConsentAccepted = useCallback(() => {
    setUser(u => (u ? { ...u, consentRequired: false, consentReason: null } : u));
  }, []);

  const session = user ? { access_token: user.id } : null;

  return (
    <AuthContext.Provider value={{ user, session, loading, markConsentAccepted }}>
      {children}
    </AuthContext.Provider>
  );
};
