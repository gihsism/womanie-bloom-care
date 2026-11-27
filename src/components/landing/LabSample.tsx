import { Column, RunningHead } from './parts';

// A typeset specimen of a report explanation: the lines of a (fictional)
// blood test on the left, the plain-language reading on the right, keyed by
// letters like the notes on a catalogue page. Clearly marked as an example.

type Row = { key: string; test: string; value: string; unit: string; range: string; flag?: 'Low' | 'High' };

const ROWS: Row[] = [
  { key: 'a', test: 'Haemoglobin', value: '118', unit: 'g/L', range: '120–160', flag: 'Low' },
  { key: 'b', test: 'Ferritin', value: '9', unit: 'µg/L', range: '15–150', flag: 'Low' },
  { key: 'c', test: 'TSH', value: '1.9', unit: 'mIU/L', range: '0.4–4.0' },
];

const NOTES: { key: string; title: string; text: string }[] = [
  {
    key: 'a',
    title: 'Haemoglobin, just under range',
    text: 'Haemoglobin carries oxygen in your blood. 118 is a little below the lab’s 120, which can show up as tiredness or getting out of breath on the stairs.',
  },
  {
    key: 'b',
    title: 'Ferritin, low',
    text: 'Ferritin is your iron store. At 9 it is nearly empty. Together with the haemoglobin this fits iron deficiency, which is common with heavy periods.',
  },
  {
    key: 'c',
    title: 'TSH, in range',
    text: 'Your thyroid signal is normal, so the thyroid is an unlikely reason for feeling tired.',
  },
];

function Key({ k }: { k: string }) {
  return <span className="font-display italic text-primary">{k}</span>;
}

export default function LabSample() {
  return (
    <section aria-labelledby="lab-sample" className="py-14 lg:py-24">
      <Column>
        <RunningHead no="III" label="A report, explained" />
        <div className="mt-8 grid gap-10 lg:mt-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-4 lg:order-2 lg:col-start-9">
            <h2 id="lab-sample" className="font-display text-3xl font-normal leading-tight lg:text-4xl">
              What you read after an upload.
            </h2>
            <p className="mt-4 max-w-sm text-muted-foreground">
              Every value gets a short note: what it measures, where yours sits, and what is worth asking.
              The questions can go straight onto your list for the next visit.
            </p>
          </div>

          <figure className="lg:col-span-8 lg:order-1" aria-label="Example of a lab report explanation, with fictional values">
            <div className="relative border border-foreground/70 bg-[hsl(var(--background))] p-4 sm:p-7">
              <p className="label-mono absolute -top-[9px] left-4 bg-background px-2 text-primary sm:left-7">
                Example · fictional values
              </p>

              {/* the report lines */}
              <div className="overflow-hidden">
                <p className="label-mono mb-3">Blood count and iron · 14 Oct</p>
                <table className="w-full border-collapse font-mono text-[12.5px] sm:text-sm">
                  <caption className="sr-only">Fictional example lab results</caption>
                  <thead>
                    <tr className="border-b border-foreground/60 text-left text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
                      <th scope="col" className="w-5 py-2 font-normal"><span className="sr-only">Note</span></th>
                      <th scope="col" className="py-2 font-normal">Test</th>
                      <th scope="col" className="py-2 text-right font-normal">Result</th>
                      <th scope="col" className="hidden py-2 pl-3 font-normal sm:table-cell">Unit</th>
                      <th scope="col" className="py-2 pl-3 text-right font-normal">Range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map((r) => (
                      <tr key={r.key} className="border-b border-border">
                        <td className="py-2.5 align-baseline"><Key k={r.key} /></td>
                        <td className="py-2.5">{r.test}</td>
                        <td className={`py-2.5 text-right tabular-nums ${r.flag ? 'text-primary' : ''}`}>
                          {r.value}
                          {r.flag && <span className="ml-1 text-[10px]">{r.flag === 'Low' ? 'L' : 'H'}</span>}
                          <span className="ml-1 text-muted-foreground sm:hidden">{r.unit}</span>
                        </td>
                        <td className="hidden py-2.5 pl-3 text-muted-foreground sm:table-cell">{r.unit}</td>
                        <td className="py-2.5 pl-3 text-right tabular-nums text-muted-foreground">{r.range}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* the reading */}
              <div className="mt-7 grid gap-6 sm:grid-cols-[1fr_1fr] sm:gap-8">
                <dl className="space-y-5">
                  {NOTES.map((n) => (
                    <div key={n.key}>
                      <dt className="flex gap-3 font-medium"><Key k={n.key} />{n.title}</dt>
                      <dd className="mt-1 pl-6 text-[15px] leading-relaxed text-muted-foreground">{n.text}</dd>
                    </div>
                  ))}
                </dl>
                <div className="border-t border-border pt-5 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
                  <p className="label-mono">To ask at your visit</p>
                  <ol className="mt-3 list-decimal space-y-3 pl-5 font-display text-[17px] leading-snug sm:text-lg marker:font-mono marker:text-sm marker:text-muted-foreground">
                    <li>Should I take iron, and when should we test again?</li>
                    <li>Could my periods be the cause, and is that worth looking at?</li>
                  </ol>
                </div>
              </div>
            </div>
            <figcaption className="mt-4 max-w-2xl text-sm text-muted-foreground">
              The notes are written by Claude, an AI model made by Anthropic, from your report. They explain;
              they do not diagnose. Decisions stay with you and your doctor.
            </figcaption>
          </figure>
        </div>
      </Column>
    </section>
  );
}
