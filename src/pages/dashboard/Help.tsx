import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  HelpCircle,
  Upload,
  Sparkles,
  Shield,
  Mail,
  MessageCircle,
  Stethoscope,
  Activity,
  Download,
  Trash2,
} from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import UserMenu from '@/components/UserMenu';

// Static help / FAQ page. Covers the things a patient is most likely
// to need to know: what Womanie does, what it doesn't (we're not your
// doctor), how uploads / analyses / sharing / data control work, and
// how to reach us.

const FAQS: Array<{ question: string; icon: typeof HelpCircle; answer: string | string[] }> = [
  {
    question: 'Is Womanie a replacement for my doctor?',
    icon: Stethoscope,
    answer:
      "No. Womanie is an assistant that translates medical documents into plain language, highlights patterns across your results over time, and helps you come to appointments with better questions. Nothing it says replaces real clinical advice — if a result worries you, please talk to a clinician.",
  },
  {
    question: 'How does document upload work?',
    icon: Upload,
    answer: [
      'Tap "Upload Health Document" on the dashboard or Health Records page and pick a PDF, image, or DOCX.',
      'Uploads go straight from your browser to Vercel Blob storage — we don\'t hold the file on our server in transit.',
      'Once uploaded we trigger an analysis with Claude (an AI model from Anthropic). That usually takes 30–90 seconds; the doc card shows an "Analyzing…" state while it runs and switches to a summary when complete.',
    ],
  },
  {
    question: 'What does the AI actually do with my results?',
    icon: Sparkles,
    answer: [
      'It reads each document and extracts the individual test values, categorises them, and flags ones that look abnormal or critical based on reference ranges.',
      'It writes a plain-language summary, notes key patterns across related tests (e.g. iron + hemoglobin), and ranks what deserves your attention.',
      'Every value and summary is yours — it never leaves Womanie or Anthropic. We don\'t share it with anyone else.',
    ],
  },
  {
    question: 'How do I share my records with a doctor?',
    icon: Shield,
    answer: [
      'On Health Records, tap "Share with doctor" to generate an 8-character code.',
      'Give the code to your doctor. They\'ll enter it in their Womanie doctor portal, which creates a pending connection request.',
      'You approve (or decline) the request from the Medical History page. Approved doctors can read the documents you\'ve uploaded and your extracted values; they can\'t change anything.',
      'Revoke a doctor\'s access any time from the Connected Doctors card.',
    ],
  },
  {
    question: 'Can I download everything Womanie has on me?',
    icon: Download,
    answer:
      'Yes — Settings → "Download my data" exports your profile, every uploaded document\'s metadata, every analysis, cycle + daily logs, chat history, and doctor connections as a single JSON file. Document file URLs are included so you can grab the raw uploads too.',
  },
  {
    question: 'Can I delete my account?',
    icon: Trash2,
    answer:
      'Yes, permanently, from Settings → "Delete my account". We wipe every row keyed to your account across the database and best-effort remove your uploaded files from Blob storage. This is irreversible — consider downloading your data first.',
  },
  {
    question: 'How accurate is the AI, and can it be wrong?',
    icon: Activity,
    answer: [
      'It can be wrong. It\'s trained to read medical documents carefully and to prefer the 2024–2026 clinical guidelines we\'ve included, but it\'s not infallible.',
      'If an extracted value looks wrong, tap the doc card and "Re-analyze" — re-runs are free and non-destructive. The prior analysis stays queryable as history.',
      "If something seems urgent, don't wait for the AI. Contact a clinician.",
    ],
  },
  {
    question: 'Is my data private?',
    icon: Shield,
    answer: [
      'Your data lives in Neon (managed Postgres, US region) and Vercel Blob storage. Access is gated per-user at the database layer — nobody else, not even us, sees your data unless you explicitly approve a doctor connection.',
      'The AI doctor chat runs against Anthropic\'s Claude API; your document text is sent with the request, but Anthropic doesn\'t train on API data.',
      'Details of our data model + retention are in the About page.',
    ],
  },
];

export default function Help() {
  const navigate = useNavigate();
  usePageTitle('Help & Support');

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center gap-3 max-w-3xl mx-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-primary" />
            <h1 className="text-base font-bold">Help & Support</h1>
          </div>
          <UserMenu />
        </div>
      </div>

      <div className="px-4 py-6 max-w-3xl mx-auto space-y-6">
        <Card className="p-4 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10">
          <p className="text-sm font-semibold mb-1">Can't find an answer here?</p>
          <p className="text-sm text-muted-foreground mb-3">
            Ask the AI assistant or reach us directly. We read every message.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => navigate('/dashboard/ai-doctor')} className="gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />
              Open AI assistant
            </Button>
            <Button size="sm" variant="outline" asChild className="gap-1.5">
              <a href="mailto:support@womanie.info">
                <Mail className="h-3.5 w-3.5" />
                Email support
              </a>
            </Button>
          </div>
        </Card>

        <section className="space-y-3">
          {FAQS.map(faq => {
            const Icon = faq.icon;
            return (
              <Card key={faq.question} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold mb-2">{faq.question}</p>
                    {Array.isArray(faq.answer) ? (
                      <ul className="space-y-1.5">
                        {faq.answer.map((line, i) => (
                          <li key={i} className="text-[13px] leading-relaxed text-muted-foreground">
                            {line}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[13px] leading-relaxed text-muted-foreground">{faq.answer}</p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </section>

        <Card className="p-4 border-dashed">
          <p className="text-xs text-muted-foreground text-center">
            Womanie is not a medical device and does not replace professional medical advice,
            diagnosis, or treatment. In emergencies, call your local emergency number.
          </p>
        </Card>
      </div>
    </div>
  );
}
