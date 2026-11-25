import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

// Idea 4: the one header for every page one level below a tab (the stage
// page, Me's rows, a Records panel). Same white page-head as the tab pages,
// a round back button that says where it goes, a plain title, and at most
// ONE small action on the right. No account menu, no logo, no icon in
// front of the title.
interface Props {
  title: string;
  /** Where the back button goes, e.g. '/dashboard/settings'. */
  backTo: string;
  /** Spoken name of that place: "Me", "Home", "Records". */
  backLabel: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}

export default function SubPageHeader({ title, backTo, backLabel, subtitle, action }: Props) {
  return (
    <header className="page-head sticky top-0 z-10">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-3 py-3">
        <Link
          to={backTo}
          aria-label={`Back to ${backLabel}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-stage-accent"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="subpage-title truncate">{title}</h1>
          {subtitle && <p className="page-sub truncate">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
