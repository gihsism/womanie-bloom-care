import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { NO_REMOTE_IMAGES } from '@/lib/safeMarkdown';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ChevronDown, ExternalLink, FileText } from 'lucide-react';
import { safeDocumentUrl } from '@/lib/doctorPatient';
import type { HealthDocument } from './types';

// Documents tab of the doctor's patient chart. Each row: name, type, date
// and "Open". The AI summary is folded away behind "Summary" so the list
// stays scannable.

const PatientDocuments = ({ documents }: { documents: HealthDocument[] }) => {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [openSummary, setOpenSummary] = useState<string | null>(null);

  if (documents.length === 0) {
    return <Card className="p-6 text-center text-sm text-muted-foreground">The patient has not uploaded any documents yet.</Card>;
  }

  const q = query.trim().toLowerCase();
  const visible = q
    ? documents.filter(d =>
        (d.file_name || '').toLowerCase().includes(q)
        || (d.ai_suggested_name || '').toLowerCase().includes(q)
        || (d.document_type || '').toLowerCase().includes(q)
        || (d.ai_summary || '').toLowerCase().includes(q))
    : documents;

  const openDoc = (doc: HealthDocument) => {
    const url = safeDocumentUrl(doc.file_path);
    if (!url) {
      toast({ variant: 'destructive', title: 'File not available', description: 'This document has no file to open.' });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-3">
      {documents.length > 5 && (
        <Input
          placeholder="Search documents"
          aria-label="Search documents"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      )}
      {visible.length === 0 ? (
        <p className="text-muted-foreground text-center py-8 text-sm">No documents match “{query}”.</p>
      ) : (
        <Card className="divide-y">
          {visible.map(doc => (
            <div key={doc.id} className="p-3">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{doc.ai_suggested_name || doc.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(doc.document_type || 'Document').replace(/_/g, ' ')} · {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : 'date unknown'}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => openDoc(doc)} className="shrink-0">
                  <ExternalLink className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  Open
                </Button>
              </div>
              {doc.ai_summary && (
                <>
                  <button
                    type="button"
                    className="mt-2 ml-8 text-xs text-primary inline-flex items-center gap-1"
                    aria-expanded={openSummary === doc.id}
                    onClick={() => setOpenSummary(s => (s === doc.id ? null : doc.id))}
                  >
                    Summary
                    <ChevronDown className={`h-3 w-3 transition-transform ${openSummary === doc.id ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  {openSummary === doc.id && (
                    <div className="mt-2 ml-8 prose prose-sm max-w-none dark:prose-invert text-sm">
                      <ReactMarkdown disallowedElements={NO_REMOTE_IMAGES}>{doc.ai_summary}</ReactMarkdown>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
};

export default PatientDocuments;
