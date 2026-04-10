import { createContext, useContext, ReactNode } from 'react';
import { useUser, useAuth as useClerkAuth } from '@clerk/clerk-react';

interface AuthUser {
  id: string;
  email?: string;
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
  const { user: clerkUser, isLoaded } = useUser();
  const { getToken } = useClerkAuth();

  const user: AuthUser | null = clerkUser ? {
    id: clerkUser.id,
    email: clerkUser.primaryEmailAddress?.emailAddress,
    user_metadata: {
      full_name: clerkUser.fullName || undefined,
    },
    created_at: clerkUser.createdAt?.toISOString(),
  } : null;

  // Provide a session-like object for components that need an access token
  const session = clerkUser ? {
    get access_token() {
      // Components should use getToken() directly, but this provides compatibility
      return clerkUser.id;
    }
  } : null;

  return (
    <AuthContext.Provider value={{ user, session, loading: !isLoaded }}>
      {children}
    </AuthContext.Provider>
  );
};
