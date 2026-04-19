import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface Group {
  user_id: string;
  doc_count: number;
  data_count: number;
  first_upload: string | null;
  last_upload: string | null;
  is_current_user: boolean;
  known_auth_user: { id: string; email: string } | null;
  claimable: boolean;
}

interface DiagnoseResponse {
  current_user: { id: string; email?: string };
  total_groups: number;
  groups: Group[];
}

const RecoverDocuments = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<DiagnoseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth/login');
  }, [user, authLoading, navigate]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/diagnose-docs', { credentials: 'include' });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      setData(await r.json());
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const claim = async (oldUserId: string) => {
    setClaiming(oldUserId);
    try {
      const r = await fetch('/api/admin/claim-docs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldUserId }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || 'Claim failed');
      toast({
        title: 'Recovered',
        description: `${result.claimed_documents} documents, ${result.claimed_extracted_data} data rows.`,
      });
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : String(e) });
    } finally {
      setClaiming(null);
    }
  };

  if (loading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const orphanGroups = data.groups.filter(g => !g.is_current_user);
  const currentGroup = data.groups.find(g => g.is_current_user);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Recover Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Logged in as <span className="font-mono">{data.current_user.email}</span> (id: <span className="font-mono">{data.current_user.id}</span>)
        </p>
      </div>

      {currentGroup && (
        <Card className="p-4">
          <p className="font-medium">Currently owned</p>
          <p className="text-sm text-muted-foreground">
            {currentGroup.doc_count} documents, {currentGroup.data_count} extracted data rows.
          </p>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="font-medium">Other user_ids with documents in the DB</h2>
        {orphanGroups.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">
            No other user_ids found. If you're missing documents, they were never written to this database.
          </Card>
        ) : (
          orphanGroups.map(g => (
            <Card key={g.user_id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 text-sm">
                  <p className="font-mono break-all">{g.user_id}</p>
                  <p className="text-muted-foreground">
                    {g.doc_count} documents · {g.data_count} data rows
                    {g.first_upload && ` · ${new Date(g.first_upload).toLocaleDateString()}–${new Date(g.last_upload!).toLocaleDateString()}`}
                  </p>
                  {g.known_auth_user ? (
                    <p className="text-muted-foreground">
                      Linked to auth_users: <span className="font-mono">{g.known_auth_user.email}</span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground">Orphan (no auth_users row)</p>
                  )}
                </div>
                <Button
                  onClick={() => claim(g.user_id)}
                  disabled={!g.claimable || claiming === g.user_id}
                  size="sm"
                >
                  {claiming === g.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Claim'}
                </Button>
              </div>
              {!g.claimable && (
                <p className="text-xs text-destructive">
                  Not claimable — belongs to a different account.
                </p>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default RecoverDocuments;
