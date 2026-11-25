import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  Shield,
  Database,
  Lock,
  Cpu,
  Users,
  Download,
  Trash2,
} from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import SubPageHeader from '@/components/SubPageHeader';

// Concrete privacy overview, so the user knows exactly where their
// data lives and what controls they have. This is the page behind
// "Privacy & Security" instead of routing them to Settings and hoping
// they find the controls; Settings keeps the buttons, this explains
// why they matter.

const SECTIONS: Array<{ icon: typeof Shield; title: string; body: string | string[] }> = [
  {
    icon: Database,
    title: 'Where your data lives',
    body: [
      "Your profile, cycle logs, extracted lab values, analyses, chat history, and connections: Neon (managed Postgres) in a US region.",
      "Uploaded documents: Vercel Blob storage, keyed under your user id.",
      "Nothing is stored on the device the browser runs on, except a session cookie and a small local cache for notification preferences.",
    ],
  },
  {
    icon: Lock,
    title: 'Who can see it',
    body: [
      "Only you, by default. Every database query routes through an ownership check that forces the session user id onto every read and write — there's no way to ask for another user's rows.",
      "Doctors only gain access after you explicitly approve a connection request, and only to the fields we expose (documents, analyses, extracted values). You can revoke at any time from Medical History → Connected doctors.",
      "We (the Womanie team) do not browse user data. We have no tooling that shows another person's account contents.",
    ],
  },
  {
    icon: Cpu,
    title: 'The AI models',
    body: [
      "Document analysis and the AI Health Assistant run against Anthropic's Claude API. Your document text and chat messages are sent with each request.",
      "Anthropic does not train on API traffic. Their retention is 30 days for abuse detection and then deletion.",
      "We cache Claude responses locally by content hash to avoid re-analyzing identical text. Cache entries are invalidated when the prompt or model changes.",
    ],
  },
  {
    icon: Users,
    title: 'Doctor connections',
    body: [
      "Connecting a doctor happens in three steps: you generate an 8-character code, they enter it, and you approve the resulting pending request before anything is shared.",
      "Approved doctors see your uploaded documents (metadata + extracted values + summaries) but cannot edit or delete them. They never see your chat history or your account settings.",
      "Unused codes expire in 24 hours; you can also cancel an unredeemed code from Share with doctor.",
    ],
  },
  {
    icon: Download,
    title: 'Your rights — take your data with you',
    body: "Settings → Download my data exports everything Womanie holds on you as a single JSON file: profile, every document, every analysis, cycle + daily logs, chat history, doctor connections. Download whenever you like.",
  },
  {
    icon: Trash2,
    title: 'Your rights — be forgotten',
    body: "Settings → Delete my account wipes every row keyed to your account across the database and best-effort-removes your uploaded files from Blob storage. It's irreversible — we keep nothing.",
  },
];

export default function Privacy() {
  const navigate = useNavigate();
  usePageTitle('Privacy & Security');

  return (
    <div className="min-h-screen bg-background">
      <SubPageHeader title="Privacy" backTo="/dashboard/settings" backLabel="Me" />

      <div className="px-4 py-5 max-w-3xl mx-auto space-y-5">
        <p className="page-intro">
          Your data is yours. Here is where it lives, who can see it, and what you can do with it.
        </p>

        {/* One list, details folded away. */}
        <div className="row-group">
          {SECTIONS.map(section => (
            <details key={section.title} className="group">
              <summary className="flex min-h-[3.25rem] cursor-pointer list-none items-center gap-3 px-4 py-3 text-[16px] font-semibold [&::-webkit-details-marker]:hidden">
                <span className="flex-1">{section.title}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="px-4 pb-4 -mt-1">
                {Array.isArray(section.body) ? (
                  <ul className="space-y-2 list-disc ml-4">
                    {section.body.map((line, i) => (
                      <li key={i} className="text-[15px] leading-relaxed text-muted-foreground">{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[15px] leading-relaxed text-muted-foreground">{section.body}</p>
                )}
              </div>
            </details>
          ))}
        </div>

        <button type="button" className="btn-stage w-full" onClick={() => navigate('/dashboard/settings#privacy')}>
          Download or delete my data
        </button>
        <p className="text-center text-[15px]">
          Questions? <a className="font-semibold text-stage-accent underline-offset-2 hover:underline" href="mailto:privacy@womanie.info">privacy@womanie.info</a>
        </p>
      </div>
    </div>
  );
}
