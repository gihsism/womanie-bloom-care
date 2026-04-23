import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Shield,
  Database,
  Lock,
  Cpu,
  Users,
  Download,
  Trash2,
  Mail,
} from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import UserMenu from '@/components/UserMenu';

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
      "Document analysis and AI doctor chat run against Anthropic's Claude API. Your document text and chat messages are sent with each request.",
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
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center gap-3 max-w-3xl mx-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <h1 className="text-base font-bold">Privacy & Security</h1>
          </div>
          <UserMenu />
        </div>
      </div>

      <div className="px-4 py-6 max-w-3xl mx-auto space-y-6">
        <Card className="p-4 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10">
          <p className="text-sm font-semibold mb-1">Your data is yours.</p>
          <p className="text-sm text-muted-foreground mb-3">
            Womanie exists to help you understand your health. Here's exactly where your data lives, who can see it, and what controls you have.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => navigate('/dashboard/settings')} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Download my data
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate('/dashboard/settings')} className="gap-1.5 text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
              Delete my account
            </Button>
          </div>
        </Card>

        <section className="space-y-3">
          {SECTIONS.map(section => {
            const Icon = section.icon;
            return (
              <Card key={section.title} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold mb-2">{section.title}</p>
                    {Array.isArray(section.body) ? (
                      <ul className="space-y-1.5 list-disc ml-4">
                        {section.body.map((line, i) => (
                          <li key={i} className="text-[13px] leading-relaxed text-muted-foreground">
                            {line}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[13px] leading-relaxed text-muted-foreground">{section.body}</p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </section>

        <Card className="p-4 border-dashed">
          <p className="text-xs text-muted-foreground text-center mb-3">
            Questions or concerns about your data?
          </p>
          <div className="flex justify-center">
            <Button size="sm" variant="outline" asChild className="gap-1.5">
              <a href="mailto:privacy@womanie.info">
                <Mail className="h-3.5 w-3.5" />
                privacy@womanie.info
              </a>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
