import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  HelpCircle,
  Upload,
  Sparkles,
  Shield,
  Stethoscope,
  Activity,
  Download,
  Trash2,
} from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import SubPageHeader from '@/components/SubPageHeader';

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
      'Open Records (bottom bar), tap "Upload a document" and pick a PDF, image, or DOCX.',
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
      'On Records, tap "Share with doctor" to generate an 8-character code.',
      'Give the code to your doctor. They\'ll enter it in their Womanie doctor portal, which creates a pending connection request.',
      'You approve (or decline) the request on the Visits page. Approved doctors can read the documents you\'ve uploaded and your extracted values; they can\'t change anything.',
      'Revoke a doctor\'s access any time from "Your doctors" on Visits.',
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
      'The AI Health Assistant runs against Anthropic\'s Claude API; your document text is sent with the request, but Anthropic doesn\'t train on API data.',
      'Details of our data model + retention are in the About page.',
    ],
  },
];

export default function Help() {
  const navigate = useNavigate();
  usePageTitle('Help');

  return (
    <div className="min-h-screen bg-background">
      <SubPageHeader title="Help" backTo="/dashboard/settings" backLabel="Me" />

      <div className="px-4 py-5 max-w-3xl mx-auto space-y-5">
        <p className="page-intro">Tap a question to see the answer.</p>

        {/* One list, answers folded away: the page reads as a few plain questions. */}
        <div className="row-group">
          {FAQS.map(faq => (
            <details key={faq.question} className="group">
              <summary className="flex min-h-[3.25rem] cursor-pointer list-none items-center gap-3 px-4 py-3 text-[16px] font-semibold [&::-webkit-details-marker]:hidden">
                <span className="flex-1">{faq.question}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="px-4 pb-4 -mt-1">
                {Array.isArray(faq.answer) ? (
                  <ul className="space-y-2">
                    {faq.answer.map((line, i) => (
                      <li key={i} className="text-[15px] leading-relaxed text-muted-foreground">{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[15px] leading-relaxed text-muted-foreground">{faq.answer}</p>
                )}
              </div>
            </details>
          ))}
        </div>

        <section className="space-y-3 pt-2">
          <h2 className="section-title">Still stuck?</h2>
          <button type="button" className="btn-stage w-full" onClick={() => navigate('/dashboard/ai-doctor')}>
            Ask AI
          </button>
          <p className="text-center text-[15px]">
            or email <a className="font-semibold text-stage-accent underline-offset-2 hover:underline" href="mailto:support@womanie.info">support@womanie.info</a>
          </p>
        </section>

        <p className="text-xs text-muted-foreground text-center pt-2">
          Womanie is not a medical device and does not replace professional medical advice,
          diagnosis, or treatment. In emergencies, call your local emergency number.
        </p>
      </div>
    </div>
  );
}
