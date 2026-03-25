import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
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
  Cpu,
  Stethoscope,
  MessageCircle,
  Search,
  Calendar,
  Star,
  Shield,
} from 'lucide-react';
import { Card } from '@/components/ui/card';

type ChatMode = 'ai' | 'real';
type Msg = { role: 'user' | 'assistant'; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-doctor-chat`;

const AI_MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku', description: 'Fast responses' },
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet', description: 'Best analysis' },
  { id: 'claude-opus-4-20250514', label: 'Claude Opus', description: 'Most capable' },
];

async function streamChat({
  messages,
  token,
  model,
  onDelta,
  onDone,
  onError,
}: {
  messages: Msg[];
  token: string;
  model: string;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
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
  content: `👋 Hi! I'm your **AI Health Assistant**. I have access to your uploaded medical documents and can help you understand your health data.

Here are some things I can help with:
- 📋 **Explain your lab results** in plain language
- 💊 **Review your medications** and what they're for
- 🔍 **Summarize your medical history**
- ❓ **Answer health questions** based on your records

*Remember: I'm not a replacement for your doctor. Always consult a healthcare professional for medical decisions.*

How can I help you today?`,
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
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [chatMode, setChatMode] = useState<ChatMode>('ai');
  const [messages, setMessages] = useState<Msg[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedModel, setSelectedModel] = useState('claude-haiku-4-5-20251001');
  const [medicalContext, setMedicalContext] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load user's medical context for personalized AI responses
  useEffect(() => {
    if (!user) return;
    const loadContext = async () => {
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        const [profileRes, docsRes, extractedRes] = await Promise.all([
          supabase.from('profiles').select('life_stage').eq('id', user.id).maybeSingle(),
          supabase.from('health_documents').select('ai_suggested_name, ai_summary, document_type').eq('user_id', user.id).order('uploaded_at', { ascending: false }).limit(5),
          supabase.from('medical_extracted_data').select('title, value, unit, status, data_type').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
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

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming || !user) return;

    const userMsg: Msg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsStreaming(true);

    const { data: sessionData } = await (await import('@/integrations/supabase/client')).supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      toast({ variant: 'destructive', title: 'Session expired', description: 'Please log in again.' });
      setIsStreaming(false);
      return;
    }

    let assistantSoFar = '';
    const conversationForApi = newMessages.filter(m => m !== WELCOME_MESSAGE);

    // Prepend medical context as a system-style message so the AI knows the user's health background
    const messagesWithContext: Msg[] = medicalContext
      ? [{ role: 'user', content: `[SYSTEM CONTEXT — do not repeat this to the user, use it to personalize your answers]\n${medicalContext}` }, { role: 'assistant', content: 'I have your health records loaded. How can I help?' }, ...conversationForApi]
      : conversationForApi;

    await streamChat({
      messages: messagesWithContext,
      token,
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

  const clearChat = () => {
    setMessages([WELCOME_MESSAGE]);
    setInput('');
  };

  // Context-aware suggested questions based on medical data
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

  const suggestedQuestions = [...baseSuggestions, ...contextSuggestions];

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
                  className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted rounded-bl-md'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2 [&>h1]:text-base [&>h2]:text-sm [&>h3]:text-sm">
                      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{msg.content}</ReactMarkdown>
                    </div>
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
