import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import UserMenu from '@/components/UserMenu';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import {
  ArrowLeft,
  Send,
  Bot,
  User,
  Sparkles,
  Loader2,
  Trash2,
  Download,
  Cpu,
  Stethoscope,
  MessageCircle,
  Search,
  Calendar,
  Star,
  Shield,
  Copy,
  Check,
} from 'lucide-react';
import { Card } from '@/components/ui/card';

type ChatMode = 'ai' | 'real';
type Msg = { role: 'user' | 'assistant'; content: string };

const CHAT_URL = '/api/ai-doctor-chat';

const AI_MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku', description: 'Fast responses' },
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet', description: 'Best analysis' },
  { id: 'claude-opus-4-20250514', label: 'Claude Opus', description: 'Most capable' },
];

async function streamChat({
  messages,
  model,
  onDelta,
  onDone,
  onError,
}: {
  messages: Msg[];
  model: string;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, model }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: 'Unknown error' }));
    onError(body.error || `Error ${resp.status}`);
    return;
  }

  if (!resp.body) {
    onError('No response stream');
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done = false;

  while (!done) {
    const { done: readerDone, value } = await reader.read();
    if (readerDone) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      let line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.startsWith(':') || line.trim() === '') continue;
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') {
        done = true;
        break;
      }
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        buffer = line + '\n' + buffer;
        break;
      }
    }
  }

  if (buffer.trim()) {
    for (let raw of buffer.split('\n')) {
      if (!raw) continue;
      if (raw.endsWith('\r')) raw = raw.slice(0, -1);
      if (raw.startsWith(':') || raw.trim() === '') continue;
      if (!raw.startsWith('data: ')) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === '[DONE]') continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch { /* ignore */ }
    }
  }

  onDone();
}

const WELCOME_MESSAGE: Msg = {
  role: 'assistant',
  content: `Hi! I'm your **AI Health Assistant** powered by Claude. I can see your uploaded medical documents and help you understand your health.

**What I can do:**
- 📋 Explain your lab results in plain language
- 🔗 Find connections between different test results
- 🤰 Give pregnancy/cycle-specific guidance
- 💊 Explain medications and supplements
- ❓ Answer any health questions

*I'm not a replacement for your doctor — always consult a professional for medical decisions.*`,
};

// ─── Real Doctor Panel ───
function RealDoctorPanel() {
  const navigate = useNavigate();
  usePageTitle('AI Doctor');

  const features = [
    { icon: Search, label: 'Browse verified specialists', description: 'Find gynecologists, fertility experts, and more' },
    { icon: Calendar, label: 'Book appointments', description: 'Schedule video or in-person consultations' },
    { icon: MessageCircle, label: 'Secure messaging', description: 'Chat directly with your connected doctor' },
    { icon: Shield, label: 'Verified professionals', description: 'All doctors are license-verified' },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
      {/* Hero */}
      <div className="text-center space-y-3 pt-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Stethoscope className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold">Consult a Real Doctor</h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Connect with verified healthcare professionals for personalized medical advice and consultations.
        </p>
      </div>

      {/* Features */}
      <div className="space-y-3 max-w-md mx-auto">
        {features.map((f) => (
          <Card key={f.label} className="p-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <f.icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">{f.label}</p>
              <p className="text-xs text-muted-foreground">{f.description}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* CTA */}
      <div className="max-w-md mx-auto space-y-3">
        <Button className="w-full h-12 text-sm font-semibold rounded-xl" onClick={() => navigate('/find-doctor')}>
          <Search className="h-4 w-4 mr-2" />
          Find a Doctor
        </Button>
        <p className="text-[10px] text-muted-foreground text-center">
          All consultations are private and HIPAA-compliant.
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ───
export default function AIDoctorChat() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [chatMode, setChatMode] = useState<ChatMode>('ai');
  const [messages, setMessages] = useState<Msg[]>([WELCOME_MESSAGE]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [earliestCursor, setEarliestCursor] = useState<string | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  // Tracks which assistant message was just copied so the Copy button
  // can flip to a checkmark for 1.5s. Indexed by message position.
  const [justCopiedIdx, setJustCopiedIdx] = useState<number | null>(null);
  const copyAssistantMessage = async (idx: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setJustCopiedIdx(idx);
      setTimeout(() => setJustCopiedIdx(c => (c === idx ? null : c)), 1500);
    } catch {
      toast({ variant: 'destructive', title: 'Copy failed', description: 'Your browser blocked clipboard access.' });
    }
  };

  // Model preference persists across sessions so a user who set up
  // Sonnet doesn't drop back to Haiku on every page load.
  const [selectedModel, setSelectedModel] = useState(() => {
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem('womanie_chat_model') : null;
      if (saved && AI_MODELS.some(m => m.id === saved)) return saved;
    } catch { /* ignore */ }
    return 'claude-haiku-4-5-20251001';
  });
  useEffect(() => {
    try { window.localStorage.setItem('womanie_chat_model', selectedModel); } catch { /* ignore */ }
  }, [selectedModel]);
  const [medicalContext, setMedicalContext] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load user's medical context for personalized AI responses
  useEffect(() => {
    if (!user) return;
    const loadContext = async () => {
      try {
        const { db } = await import('@/integrations/db/client');
        const [profileRes, docsRes, extractedRes, appointmentsResp, notesResp] = await Promise.all([
          db.from('profiles').select('life_stage').eq('id', user.id).maybeSingle(),
          db.from('health_documents').select('ai_suggested_name, ai_summary, document_type').eq('user_id', user.id).order('uploaded_at', { ascending: false }).limit(5),
          db.from('medical_extracted_data').select('title, value, unit, status, data_type').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
          fetch('/api/me/appointments?upcoming=true').then(r => (r.ok ? r.json() : { appointments: [] })),
          fetch('/api/me/doctor-notes').then(r => (r.ok ? r.json() : { notes: [] })),
        ]);

        const parts: string[] = [];
        if (profileRes.data?.life_stage) {
          parts.push(`Life stage: ${profileRes.data.life_stage}`);
        }
        if (extractedRes.data && extractedRes.data.length > 0) {
          const labs = extractedRes.data
            .filter(d => d.data_type === 'lab_result' && d.value)
            .map(d => `${d.title}: ${d.value}${d.unit ? ' ' + d.unit : ''}${d.status && d.status !== 'normal' ? ' (' + d.status + ')' : ''}`)
            .join('; ');
          if (labs) parts.push(`Recent lab results: ${labs}`);

          const conditions = extractedRes.data
            .filter(d => d.data_type === 'condition')
            .map(d => d.title)
            .join(', ');
          if (conditions) parts.push(`Conditions: ${conditions}`);

          const medications = extractedRes.data
            .filter(d => d.data_type === 'medication')
            .map(d => `${d.title}${d.value ? ' ' + d.value : ''}`)
            .join(', ');
          if (medications) parts.push(`Medications: ${medications}`);
        }
        if (docsRes.data && docsRes.data.length > 0) {
          const summaries = docsRes.data
            .filter(d => d.ai_summary)
            .map(d => `${d.ai_suggested_name || d.document_type}: ${d.ai_summary!.slice(0, 200)}`)
            .join('\n');
          if (summaries) parts.push(`Document summaries:\n${summaries}`);
        }

        // Upcoming appointments — three rows max so questions like "what
        // should I prepare for Tuesday's visit?" can be grounded.
        const apts = Array.isArray(appointmentsResp?.appointments) ? appointmentsResp.appointments : [];
        if (apts.length > 0) {
          const lines = apts.slice(0, 3).map((a: {
            scheduled_at: string;
            doctor_title: string | null;
            doctor_name: string | null;
            doctor_specialties: string[] | null;
            consultation_type: string | null;
          }) => {
            const doc = [a.doctor_title, a.doctor_name].filter(Boolean).join(' ') || 'a doctor';
            const spec = Array.isArray(a.doctor_specialties) && a.doctor_specialties.length > 0 ? `, ${a.doctor_specialties[0]}` : '';
            return `${new Date(a.scheduled_at).toLocaleString()} with ${doc}${spec} (${a.consultation_type || 'consultation'})`;
          }).join('; ');
          parts.push(`Upcoming appointments: ${lines}`);
        }

        // Doctor notes visible to the patient — last three. Lets the
        // assistant reference "as Dr. Smith noted on May 14, …" instead
        // of re-deriving advice from labs alone.
        const notes = Array.isArray(notesResp?.notes) ? notesResp.notes : [];
        if (notes.length > 0) {
          const noteLines = notes.slice(0, 3).map((n: {
            created_at: string;
            doctor_title: string | null;
            doctor_name: string | null;
            title: string;
            content: string;
            note_type: string | null;
          }) => {
            const doc = [n.doctor_title, n.doctor_name].filter(Boolean).join(' ') || 'doctor';
            return `${new Date(n.created_at).toLocaleDateString()} — ${doc} (${n.note_type || 'note'}): ${n.title} — ${n.content.slice(0, 200)}`;
          }).join('\n');
          parts.push(`Recent doctor notes:\n${noteLines}`);
        }

        if (parts.length > 0) {
          setMedicalContext(parts.join('\n'));
        }
      } catch (error) {
        console.error('Error loading medical context:', error);
      }
    };
    loadContext();
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth/login');
  }, [user, authLoading, navigate]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Load history from server on mount. If localStorage has a prior
  // session and the server has nothing, migrate once then clear it.
  useEffect(() => {
    if (!user || historyLoaded) return;
    (async () => {
      try {
        const resp = await fetch('/api/chat/messages', { credentials: 'include' });
        if (!resp.ok) return;
        const data = await resp.json();
        const serverMessages: Msg[] = (data.messages || []).map((m: { role: string; content: string }) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));
        setHasMoreHistory(Boolean(data.hasMore));
        setEarliestCursor(typeof data.earliestCursor === 'string' ? data.earliestCursor : null);

        if (serverMessages.length > 0) {
          setMessages([WELCOME_MESSAGE, ...serverMessages]);
        } else {
          // Server empty — attempt one-time migration from localStorage
          try {
            const saved = localStorage.getItem('womanie_chat_history');
            if (saved) {
              const parsed = JSON.parse(saved) as Msg[];
              const migratable = parsed.filter(m => m.role === 'user' || m.role === 'assistant');
              if (migratable.length > 0) {
                const imp = await fetch('/api/chat/messages', {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ messages: migratable }),
                });
                if (imp.ok) {
                  localStorage.removeItem('womanie_chat_history');
                  setMessages([WELCOME_MESSAGE, ...migratable]);
                }
              }
            }
          } catch { /* ignore migration errors */ }
        }
      } catch (error) {
        console.error('Chat history load failed:', error);
      } finally {
        setHistoryLoaded(true);
      }
    })();
  }, [user, historyLoaded]);

  // Deep-link support: landing on /dashboard/ai-doctor?q=... sends that
  // question as the first user turn automatically. Used by the "Ask
  // about this" buttons on dashboard finding / trend cards so Alena
  // drops into a running conversation instead of an empty input. Ref-
  // tracked so a re-render doesn't re-fire; we also strip the query
  // param once consumed so a refresh doesn't resend.
  const autoSendFiredRef = useRef(false);
  useEffect(() => {
    if (autoSendFiredRef.current) return;
    if (!user || !historyLoaded || isStreaming) return;
    const q = searchParams.get('q');
    if (!q) return;
    autoSendFiredRef.current = true;
    setInput(q);
    // Defer to the next tick so the input state is committed before
    // handleSend reads it.
    setTimeout(() => {
      handleSend();
      const next = new URLSearchParams(searchParams);
      next.delete('q');
      setSearchParams(next, { replace: true });
    }, 0);
  }, [user, historyLoaded, isStreaming, searchParams, setSearchParams]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming || !user) return;

    const userMsg: Msg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsStreaming(true);

    let assistantSoFar = '';
    const conversationForApi = newMessages.filter(m => m !== WELCOME_MESSAGE);

    // We used to prepend a synthetic "[SYSTEM CONTEXT ...]" user
    // message with a brief snapshot of the patient's records. The
    // backend already loads the full set (profile, last 20 docs,
    // last 100 extracted values) from the DB via the session user,
    // so the prepended snippet was both a strict subset and a source
    // of fragility (required content-prefix sniffing to avoid being
    // persisted as a real user message). The local `medicalContext`
    // state is still used to pick prompt suggestions below.
    await streamChat({
      messages: conversationForApi,
      model: selectedModel,
      onDelta: (chunk) => {
        assistantSoFar += chunk;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last !== WELCOME_MESSAGE) {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
          }
          return [...prev, { role: 'assistant', content: assistantSoFar }];
        });
      },
      onDone: () => setIsStreaming(false),
      onError: (err) => {
        // If we got partial response, keep it and add error note
        if (assistantSoFar) {
          assistantSoFar += '\n\n*[Response interrupted — try asking again]*';
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant' && last !== WELCOME_MESSAGE) {
              return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
            }
            return prev;
          });
        }
        toast({ variant: 'destructive', title: 'AI Error', description: err });
        setIsStreaming(false);
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = async () => {
    // Only ask for confirmation when there's real history to lose —
    // clearing an already-empty chat would just surface a pointless
    // prompt.
    const hasRealHistory = messages.some(m => m !== WELCOME_MESSAGE);
    if (hasRealHistory && !window.confirm('Clear this entire chat history? This cannot be undone.')) {
      return;
    }
    setMessages([WELCOME_MESSAGE]);
    setInput('');
    try { localStorage.removeItem('womanie_chat_history'); } catch { /* ignore */ }
    try {
      await fetch('/api/chat/messages', { method: 'DELETE', credentials: 'include' });
    } catch { /* ignore */ }
  };

  // Export the current conversation as a markdown file. Patients often
  // want to share what the AI said with their actual doctor — until now
  // the only way was a screenshot. Markdown survives copy-paste into
  // Notes / Gmail / a clinic portal without losing the structure of
  // headings + lists Claude usually returns.
  const exportChat = () => {
    const real = messages.filter(m => m !== WELCOME_MESSAGE && m.content?.trim());
    if (real.length === 0) {
      toast({ title: 'Nothing to export', description: 'Send a message first.' });
      return;
    }
    const stamp = new Date();
    const header = [
      `# Womanie AI Doctor Chat`,
      ``,
      `Exported: ${stamp.toLocaleString()}`,
      `Model: ${selectedModel}`,
      ``,
      `> This conversation is for reference only. The AI assistant on Womanie is not a substitute for medical advice from a licensed clinician.`,
      ``,
      `---`,
      ``,
    ].join('\n');
    const body = real
      .map(m => {
        const role = m.role === 'user' ? '## You' : '## Assistant';
        return `${role}\n\n${m.content.trim()}\n`;
      })
      .join('\n---\n\n');
    const blob = new Blob([header + body], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `womanie-chat-${stamp.toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'Chat exported', description: 'Saved a markdown file — open it anywhere or share with your doctor.' });
  };

  // Suggested starter prompts. When we have no medical context at all
  // (no profile data, no docs analyzed yet) the regular prompts are
  // pointless — the assistant would just say "I don't have anything
  // to reference". So guide the user toward uploading instead.
  const hasContext = Boolean(medicalContext && medicalContext.length > 0);

  let suggestedQuestions: string[];
  if (!hasContext) {
    suggestedQuestions = [
      'What kinds of tests should I be tracking?',
      'What can you help me with?',
      'What should I upload first?',
    ];
  } else {
    const baseSuggestions = [
      'Summarize my medical history',
      'What do my latest lab results mean?',
    ];

    const contextSuggestions = medicalContext?.includes('pregnancy') || medicalContext?.includes('HCG')
      ? ['Is my pregnancy progressing normally?', 'What supplements should I take?']
      : medicalContext?.includes('menopause')
      ? ['How are my hormone levels for menopause?', 'What can help with my symptoms?']
      : medicalContext?.includes('abnormal') || medicalContext?.includes('critical')
      ? ['Which results should I worry about?', 'What lifestyle changes could help?']
      : ['Are there any concerning findings?', 'What tests should I do next?'];

    // If the patient has an upcoming visit or recent doctor notes,
    // surface a chip that helps them get value from the assistant
    // about those — both are now in the server-side prompt context.
    const proximitySuggestions: string[] = [];
    if (medicalContext?.includes('Upcoming appointments:')) {
      proximitySuggestions.push('What should I prepare for my next appointment?');
    }
    if (medicalContext?.includes('Recent doctor notes:')) {
      proximitySuggestions.push('Explain my doctor\'s latest note in plain language');
    }

    suggestedQuestions = [...baseSuggestions, ...contextSuggestions, ...proximitySuggestions];
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const currentModelLabel = AI_MODELS.find(m => m.id === selectedModel)?.label || 'Gemini Flash';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/dashboard')} aria-label="Back to dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              {chatMode === 'ai' ? <Bot className="h-3.5 w-3.5 text-primary" /> : <Stethoscope className="h-3.5 w-3.5 text-primary" />}
            </div>
            <div className="min-w-0">
              <h1 className="text-xs sm:text-sm font-bold leading-tight truncate">Doctor Chat</h1>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground hidden sm:block">
                {chatMode === 'ai' ? 'AI-powered assistant' : 'Connect with real doctors'}
              </p>
            </div>
          </div>
          <button type="button" onClick={() => { window.location.href = '/'; }} className="text-xs sm:text-sm font-bold text-primary hover:opacity-80 transition-opacity hidden sm:block">
            Womanie
          </button>

          {chatMode === 'ai' && (
            <>
              <Select value={selectedModel} onValueChange={setSelectedModel} disabled={isStreaming}>
                <SelectTrigger className="w-auto h-8 text-xs gap-1 border-border">
                  <Cpu className="h-3 w-3" />
                  <SelectValue>{currentModelLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {AI_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <div className="flex flex-col">
                        <span className="font-medium text-xs">{m.label}</span>
                        <span className="text-[10px] text-muted-foreground">{m.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={exportChat} title="Export chat as markdown">
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={clearChat} title="Clear chat">
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        {/* Mode Switcher */}
        <div className="px-3 sm:px-4 pb-2.5 sm:pb-3 flex gap-2">
          <Button
            variant={chatMode === 'ai' ? 'default' : 'outline'}
            size="sm"
            className="flex-1 rounded-xl h-9 text-xs font-semibold gap-1.5"
            onClick={() => setChatMode('ai')}
          >
            <Bot className="h-3.5 w-3.5" />
            AI Assistant
          </Button>
          <Button
            variant={chatMode === 'real' ? 'default' : 'outline'}
            size="sm"
            className="flex-1 rounded-xl h-9 text-xs font-semibold gap-1.5"
            onClick={() => setChatMode('real')}
          >
            <Stethoscope className="h-3.5 w-3.5" />
            Real Doctor
          </Button>
        </div>
      </div>

      {/* Content based on mode */}
      {chatMode === 'real' ? (
        <RealDoctorPanel />
      ) : (
        <>
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {hasMoreHistory && earliestCursor && (
              <div className="flex justify-center">
                <button
                  type="button"
                  disabled={loadingEarlier}
                  onClick={async () => {
                    if (!earliestCursor) return;
                    setLoadingEarlier(true);
                    try {
                      const resp = await fetch(
                        `/api/chat/messages?before=${encodeURIComponent(earliestCursor)}`,
                        { credentials: 'include' },
                      );
                      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                      const data = await resp.json();
                      const older: Msg[] = (data.messages || []).map((m: { role: string; content: string }) => ({
                        role: m.role as 'user' | 'assistant',
                        content: m.content,
                      }));
                      // Prepend older messages after the WELCOME_MESSAGE sentinel.
                      setMessages(prev => {
                        const welcomeIdx = prev.findIndex(m => m === WELCOME_MESSAGE);
                        if (welcomeIdx >= 0) {
                          return [...prev.slice(0, welcomeIdx + 1), ...older, ...prev.slice(welcomeIdx + 1)];
                        }
                        return [...older, ...prev];
                      });
                      setHasMoreHistory(Boolean(data.hasMore));
                      setEarliestCursor(typeof data.earliestCursor === 'string' ? data.earliestCursor : null);
                    } catch (err) {
                      console.error('Load earlier failed:', err);
                    } finally {
                      setLoadingEarlier(false);
                    }
                  }}
                  className="text-xs text-muted-foreground hover:text-primary px-3 py-1.5 rounded-full bg-muted/50 hover:bg-muted disabled:opacity-60"
                >
                  {loadingEarlier ? 'Loading…' : 'Load earlier messages'}
                </button>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={`group max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3 relative ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted rounded-bl-md'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <>
                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2 [&>h1]:text-base [&>h2]:text-sm [&>h3]:text-sm">
                        <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{msg.content}</ReactMarkdown>
                      </div>
                      {msg !== WELCOME_MESSAGE && msg.content.trim() && (
                        <button
                          type="button"
                          onClick={() => copyAssistantMessage(i, msg.content)}
                          className="absolute -bottom-3 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-background border border-border text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:text-foreground"
                          aria-label="Copy this reply"
                          title="Copy this reply"
                        >
                          {justCopiedIdx === i ? (
                            <><Check className="h-3 w-3" />Copied</>
                          ) : (
                            <><Copy className="h-3 w-3" />Copy</>
                          )}
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <User className="h-3.5 w-3.5 text-secondary" />
                  </div>
                )}
              </div>
            ))}

            {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          {/* Suggested Questions */}
          {messages.length <= 1 && (
            <div className="px-4 pb-2">
              <div className="flex flex-wrap gap-2">
                {suggestedQuestions.map((q) => (
                  <Button
                    key={q}
                    variant="outline"
                    size="sm"
                    className="text-xs h-auto py-1.5 px-3 rounded-full"
                    onClick={() => {
                      setInput(q);
                      setTimeout(() => textareaRef.current?.focus(), 0);
                    }}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="border-t border-border bg-card p-4">
            <div className="max-w-4xl mx-auto flex gap-2 items-end">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your health records..."
                className="min-h-[44px] max-h-[120px] resize-none text-sm rounded-xl"
                rows={1}
                disabled={isStreaming}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                size="icon"
                className="rounded-xl h-[44px] w-[44px] flex-shrink-0"
              >
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              AI responses are informational only. Always consult your doctor for medical decisions.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
