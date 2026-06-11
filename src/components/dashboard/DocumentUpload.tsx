import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, X, File, CheckCircle2 } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { emitHealthDataChange } from '@/lib/data-events';

interface DocumentUploadProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
  onUploaded?: () => void;
}

const DocumentUpload = ({ open: controlledOpen, onOpenChange, showTrigger = true, onUploaded }: DocumentUploadProps) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = (v: boolean) => {
    onOpenChange?.(v);
    setInternalOpen(v);
  };
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState('');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const documentTypes = [
    'Lab Result',
    'Imaging Report',
    'Medical Record',
    'Prescription',
    'Test Result',
    'Other'
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      
      // Validate file size (200MB)
      if (selectedFile.size > 200 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: 'Please select a file smaller than 200MB',
          variant: 'destructive',
        });
        return;
      }

      // Validate file type. We accept formats Claude vision can read
      // (JPEG, PNG, WebP) plus PDF and DOCX, which we handle separately.
      // HEIC / HEIF (iPhone default) is *not* supported by Claude vision,
      // so we reject it at the door with a useful hint rather than
      // accepting an upload that will silently fail at analysis time.
      const allowedMimes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
      ];
      const ext = (selectedFile.name.split('.').pop() || '').toLowerCase();
      const allowedExts = ['pdf', 'docx', 'jpg', 'jpeg', 'png', 'webp'];
      const blockedHeic = ext === 'heic' || ext === 'heif'
        || selectedFile.type === 'image/heic'
        || selectedFile.type === 'image/heif';
      if (blockedHeic) {
        toast({
          title: 'HEIC photos not yet supported',
          description: 'iPhone defaults to HEIC. Change Settings → Camera → Formats to "Most Compatible" (JPEG), or convert this photo first.',
          variant: 'destructive',
        });
        return;
      }
      if (!allowedMimes.includes(selectedFile.type) && !allowedExts.includes(ext)) {
        toast({
          title: 'Invalid file type',
          description: 'Please upload a PDF, DOCX, or image (JPG, PNG, WebP).',
          variant: 'destructive',
        });
        return;
      }

      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file || !documentType || !user) {
      toast({
        title: 'Missing information',
        description: 'Please select a file and document type',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);

    try {
      // Browser uploads directly to Vercel Blob via short-lived token.
      // Bypasses the 4.5 MB serverless gateway cap so large PDFs work.
      const { upload } = await import('@vercel/blob/client');
      const blob = await upload(
        `${user.id}/${Date.now()}-${file.name}`,
        file,
        {
          access: 'public',
          handleUploadUrl: '/api/upload',
          contentType: file.type,
        }
      );
      const fileUrl = blob.url;

      // Save metadata to database
      const { data: insertData, error: dbError } = await db
        .from('health_documents')
        .insert({
          user_id: user.id,
          file_name: file.name,
          file_path: fileUrl,
          document_type: documentType,
          file_size: file.size,
          mime_type: file.type,
          notes: notes || null,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // Reset form and close dialog
      setFile(null);
      setDocumentType('');
      setNotes('');
      setIsOpen(false);

      toast({
        title: 'Uploaded!',
        description: 'Analyzing in the background — results will appear in Health Records shortly.',
      });

      // Let the parent know so it can refetch its doc list — otherwise
      // the just-uploaded doc won't appear until the next reload.
      onUploaded?.();
      // Broadcast a data-change so any insight widget on-screen can
      // refetch (HealthSummary, lab insights, timeline, etc.).
      emitHealthDataChange();

      // Fire-and-forget: Vercel runs the handler to completion regardless
      // of whether the browser is still listening, so we don't block the
      // UI on a 30–120s Claude call. MedicalHistory polls for ai_summary
      // and refreshes the card once analysis lands.
      // Pass the user's timezone so "Today: <date>" in the prompt is in
      // their local calendar day rather than UTC.
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      fetch('/api/analyze-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: insertData.id,
          userId: user.id,
          filePath: fileUrl,
          fileName: file.name,
          mimeType: file.type,
          timezone,
        }),
        keepalive: true,
      }).catch(e => console.error('Analysis dispatch error:', e));
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: 'There was an error uploading your document',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Card className="p-5 cursor-pointer hover:bg-primary/5 hover:border-primary/30 transition-all border-dashed border-2">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/10 flex items-center justify-center flex-shrink-0">
                <Upload className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-base">Upload Health Document</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Lab results, prescriptions, imaging reports — AI will analyze and explain everything
                </p>
              </div>
            </div>
          </Card>
        </DialogTrigger>
      )}
      
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Upload Health Document</DialogTitle>
          <DialogDescription>
            Upload lab results, imaging reports, or other medical documents (Max 200MB)
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="file">Select File</Label>
            <div className="flex items-center gap-2">
              <Input
                id="file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.docx"
                onChange={handleFileChange}
                className="flex-1"
              />
            </div>
            {file && (
              <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                <File className="h-4 w-4 text-primary" />
                <span className="text-sm flex-1">{file.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFile(null)}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Document Type */}
          <div className="space-y-2">
            <Label htmlFor="type">Document Type</Label>
            <Select value={documentType} onValueChange={setDocumentType}>
              <SelectTrigger>
                <SelectValue placeholder="Select document type" />
              </SelectTrigger>
              <SelectContent>
                {documentTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any relevant notes about this document..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Upload Button */}
          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              className="flex-1"
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              className="flex-1"
              disabled={!file || !documentType || uploading}
            >
              {uploading ? (
                <>
                  <Upload className="h-4 w-4 mr-2 animate-pulse" />
                  Uploading...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Upload Document
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentUpload;
