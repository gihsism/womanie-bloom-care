import { Link } from 'react-router-dom';
import { Column, RunningHead } from './parts';

// Privacy, plainly. Every line here is checked against docs/privacy-data-map.md
// (what the code actually does). No certifications, no "bank-level", no boards.

const FACTS: { term: string; text: string }[] = [
  {
    term: 'Where it is kept',
    text: 'On servers in the USA: the database at Neon (Amazon Web Services, us-east-1) and your files at Vercel. It travels there over an encrypted connection.',
  },
  {
    term: 'Who reads it',
    text: 'Claude, an AI model by Anthropic, receives a report’s text to explain it, and the relevant parts of your records when you ask a question. No other AI company gets your data.',
  },
  {
    term: 'Your doctor',
    text: 'A doctor sees your records only if you give them a code from the app and then approve their request.',
  },
  {
    term: 'Leaving',
    text: 'Settings has “Download my data” and “Delete my account”. Deleting removes your records and uploaded files. Server logs and error reports, which carry no health data, expire on their own schedule.',
  },
];

export default function LandingPrivacy() {
  return (
    <section aria-labelledby="your-data" className="py-14 lg:py-24">
      <Column>
        <RunningHead no="IV" label="Your data" />
        <div className="mt-8 grid gap-10 lg:mt-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-4">
            <h2 id="your-data" className="font-display text-3xl font-normal leading-tight lg:text-4xl">
              What happens to your data.
            </h2>
            <p className="mt-4 max-w-sm text-muted-foreground">
              Health data is personal, so here are the facts, without the slogans.
            </p>
          </div>
          <div className="lg:col-span-8">
            <dl className="divide-y divide-border border-y border-border">
              {FACTS.map((f) => (
                <div key={f.term} className="grid gap-1 py-5 sm:grid-cols-[11rem_1fr] sm:gap-6">
                  <dt className="label-mono pt-1">{f.term}</dt>
                  <dd className="leading-relaxed">{f.text}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-[15px]">
              <Link
                to="/privacy"
                className="tap-target font-medium underline decoration-foreground/40 underline-offset-4 hover:decoration-primary"
              >
                Read the full privacy page
              </Link>
            </p>
          </div>
        </div>
      </Column>
    </section>
  );
}
