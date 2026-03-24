import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, differenceInDays } from 'date-fns';
import { FileText, FlaskConical, Pill, Stethoscope, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface TimelineDocument {
  id: string;
  file_name: string;
  ai_suggested_name: string | null;
  ai_suggested_category: string | null;
  ai_summary: string | null;
  uploaded_at: string | null;
  document_type: string;
}

interface TimelineDataItem {
  id: string;
  document_id: string | null;
  title: string;
  value: string | null;
  unit: string | null;
  status: string | null;
  data_type: string;
  date_recorded: string | null;
}

interface HealthTimelineProps {
  documents: TimelineDocument[];
  medicalData: TimelineDataItem[];
}

interface TimelineEvent {
  date: Date;
  dateLabel: string;
  type: 'document' | 'finding';
  icon: typeof FileText;
  title: string;
  subtitle: string;
  status?: string | null;
  items?: { title: string; value: string | null; unit: string | null; status: string | null }[];
}

const statusColor = (status: string | null) => {
  switch (status) {
    case 'normal': case 'expected': return 'bg-green-500';
    case 'abnormal': return 'bg-amber-500';
    case 'critical': return 'bg-red-500';
    default: return 'bg-muted-foreground';
  }
};

const categoryIcon = (category: string | null): typeof FileText => {
  switch (category) {
    case 'lab_results': return FlaskConical;
    case 'prescription': return Pill;
    case 'consultation_notes': return Stethoscope;
    default: return FileText;
  }
};

export default function HealthTimeline({ documents, medicalData }: HealthTimelineProps) {
  const events = useMemo(() => {
    const timeline: TimelineEvent[] = [];

    documents.forEach(doc => {
      const date = doc.uploaded_at ? new Date(doc.uploaded_at) : null;
      if (!date) return;

      const docItems = medicalData
        .filter(d => d.document_id === doc.id)
        .map(d => ({ title: d.title, value: d.value, unit: d.unit, status: d.status }));

      const abnormalCount = docItems.filter(d => d.status === 'abnormal' || d.status === 'critical').length;
      const totalCount = docItems.length;

      const Icon = categoryIcon(doc.ai_suggested_category);

      timeline.push({
        date,
        dateLabel: format(date, 'MMM d, yyyy'),
        type: 'document',
        icon: Icon,
        title: doc.ai_suggested_name || doc.file_name,
        subtitle: abnormalCount > 0
          ? `${totalCount} results — ${abnormalCount} need attention`
          : totalCount > 0
          ? `${totalCount} results — all healthy`
          : doc.ai_summary?.slice(0, 100) || doc.document_type,
        status: abnormalCount > 0 ? 'abnormal' : totalCount > 0 ? 'normal' : null,
        items: docItems.slice(0, 5),
      });
    });

    return timeline.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [documents, medicalData]);

  if (events.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
        Health Timeline
      </h3>

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />

        <div className="space-y-4">
          {events.map((event, i) => {
            const Icon = event.icon;
            const daysAgo = differenceInDays(new Date(), event.date);
            const timeLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;

            return (
              <div key={event.title + i} className="flex gap-3 relative">
                {/* Timeline dot */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
                  event.status === 'abnormal' || event.status === 'critical'
                    ? 'bg-amber-100 dark:bg-amber-900/30'
                    : 'bg-green-100 dark:bg-green-900/30'
                }`}>
                  <Icon className={`h-4.5 w-4.5 ${
                    event.status === 'abnormal' || event.status === 'critical'
                      ? 'text-amber-600'
                      : 'text-green-600'
                  }`} aria-hidden="true" />
                </div>

                {/* Content */}
                <Card className="flex-1 p-3.5">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-semibold leading-tight">{event.title}</p>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{timeLabel}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{event.dateLabel}</p>
                  <p className="text-xs text-muted-foreground mt-1">{event.subtitle}</p>

                  {/* Key findings */}
                  {event.items && event.items.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {event.items.map((item, j) => (
                        <div key={j} className="flex items-center gap-1 text-[10px]">
                          <div className={`w-1.5 h-1.5 rounded-full ${statusColor(item.status)}`} />
                          <span className="text-muted-foreground">{item.title}</span>
                          {item.value && (
                            <span className="font-mono font-medium">{item.value}{item.unit ? ` ${item.unit}` : ''}</span>
                          )}
                        </div>
                      ))}
                      {event.items.length === 5 && (
                        <span className="text-[10px] text-muted-foreground">+ more</span>
                      )}
                    </div>
                  )}
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
