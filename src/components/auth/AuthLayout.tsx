import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

// Patient log in / sign up / get started (idea 4): Back + wordmark,
// a big bold title, the form on white. Same frame as the doctor log-in.
export default function AuthLayout({ backHref, title, sub, children }: { backHref: string; title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="w-full max-w-md mx-auto px-4 pt-3 min-h-12 flex items-center justify-between">
        <a href={backHref} className="flex items-center gap-2 min-h-11 -ml-1 px-1 text-foreground hover:text-stage-accent">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          <span className="text-[15px] font-medium">Back</span>
        </a>
        <a href="/" className="text-xl font-extrabold text-stage-accent hover:opacity-80">Womanie</a>
      </div>
      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-8 pb-16">
        <h1 className="page-title text-[2rem]">{title}</h1>
        {sub && <p className="page-sub mt-2">{sub}</p>}
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}

/** Text inputs on the auth pages: tall, pill-shaped, room for an icon. */
export const AUTH_INPUT = 'h-12 rounded-full pl-11 text-[16px] md:text-[16px]';
export const AUTH_ICON = 'absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground';

export function OrDivider({ label = 'or' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 my-6 text-[14px] text-muted-foreground" role="separator">
      <span className="h-px flex-1 bg-line" />
      {label}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function GoogleButton() {
  return (
    <button
      type="button"
      className="w-full min-h-12 inline-flex items-center justify-center gap-3 rounded-full border border-input bg-background px-5 text-[16px] font-semibold hover:bg-muted/60"
      onClick={() => { window.location.href = '/api/auth/google'; }}
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
      Continue with Google
    </button>
  );
}
