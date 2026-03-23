// OAuth integration — works on both Lovable and Vercel hosting.

import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

async function getLovableAuth() {
  try {
    const mod = await import("@lovable.dev/cloud-auth-js");
    return mod.createLovableAuth();
  } catch {
    return null;
  }
}

export const lovable = {
  auth: {
    signInWithOAuth: async (provider: "google" | "apple", opts?: SignInOptions) => {
      // Try Lovable auth first (only works on .lovable.app domains)
      const lovableAuth = await getLovableAuth();
      if (lovableAuth) {
        try {
          const result = await lovableAuth.signInWithOAuth(provider, {
            redirect_uri: opts?.redirect_uri,
            extraParams: { ...opts?.extraParams },
          });

          if (result.redirected) return result;
          if (result.error) return result;

          try {
            await supabase.auth.setSession(result.tokens);
          } catch (e) {
            return { error: e instanceof Error ? e : new Error(String(e)) };
          }
          return result;
        } catch {
          // Fall through to Supabase OAuth
        }
      }

      // Fallback: use Supabase OAuth directly
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: opts?.redirect_uri || window.location.origin,
          queryParams: opts?.extraParams,
        },
      });

      if (error) return { error };
      return { redirected: true };
    },
  },
};
