import { Component, type ReactNode } from 'react';
import { captureException } from '@/lib/monitoring';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from '@/components/icons';
import { hardReload, isStaleChunkError, reloadOnceForStaleChunk } from '@/lib/staleChunk';
import { ArtEmptyState } from '@/components/ArtEmptyState';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Code from the previous deploy is gone: reload once instead of showing the error.
    if (isStaleChunkError(error) && reloadOnceForStaleChunk()) return;
    console.error('ErrorBoundary caught:', error, info.componentStack);
    // Forward to Sentry so renders that crash the tree show up in the
    // dashboard alongside the API errors. componentStack lands on the
    // event as the React component stack context.
    captureException(error, {
      contexts: { react: { componentStack: info.componentStack } },
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      const stale = isStaleChunkError(this.state.error);

      // Offline: a page whose code was not cached yet cannot load. Say so
      // plainly with the offline drawing instead of "something went wrong".
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return (
          <div className="min-h-[50vh] flex items-center justify-center px-4">
            <ArtEmptyState kind="offline" testId="offline-empty">
              <Button size="sm" onClick={() => window.location.reload()}>
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Try again
              </Button>
            </ArtEmptyState>
          </div>
        );
      }

      return (
        <div className="min-h-[50vh] flex items-center justify-center px-4">
          <div className="max-w-sm text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
            <h2 className="text-lg font-bold">{stale ? 'Womanie was just updated' : 'Something went wrong'}</h2>
            <p className="text-sm text-muted-foreground">
              {stale
                ? 'Loading the new version. If this screen stays, tap Refresh.'
                : 'An unexpected error occurred. Try refreshing the page.'}
            </p>
            <div className="flex gap-2 justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.assign('/')}
              >
                <Home className="h-4 w-4 mr-1.5" />
                Home
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  // Drop the offline cache too: a plain reload can bring back
                  // the same stale page from the service worker.
                  void hardReload();
                }}
              >
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
