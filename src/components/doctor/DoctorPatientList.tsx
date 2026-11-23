import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, Search } from 'lucide-react';
import {
  canOpenChart,
  filterPatients,
  recentDocCount,
  sortPatients,
  stageLabel,
  type DoctorPatientConnection,
} from '@/lib/doctorDashboard';

// The doctor's patient list. Approved patients open their chart; pending
// ones show "Waiting for the patient to approve" and cannot be opened
// (the server refuses too: /api/doctors/patient requires 'approved').

const SEARCH_THRESHOLD = 4;

interface Props {
  patients: DoctorPatientConnection[];
}

const DoctorPatientList = ({ patients }: Props) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const sorted = useMemo(() => sortPatients(patients), [patients]);
  const visible = useMemo(() => filterPatients(sorted, query), [sorted, query]);

  return (
    <section aria-labelledby="doctor-patients-heading" className="space-y-2">
      <h2 id="doctor-patients-heading" className="text-lg font-semibold">
        Patients <span className="text-muted-foreground font-normal">({patients.length})</span>
      </h2>

      {patients.length >= SEARCH_THRESHOLD && (
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search patients"
            placeholder="Search by name or life stage"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-secondary bg-background"
          />
        </div>
      )}

      {patients.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">
          No patients yet. Ask a patient for her access code, then tap “Add a patient”.
        </Card>
      ) : visible.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">No patients match “{query}”.</Card>
      ) : (
        <Card className="divide-y">
          {visible.map(p => {
            const name = p.patient_full_name?.trim() || `Patient #${p.patient_id.slice(0, 8)}`;
            const allowed = canOpenChart(p);
            const newDocs = recentDocCount(p);
            const stage = stageLabel(p.patient_life_stage);
            const lastUpload = allowed && p.last_upload_at ? new Date(p.last_upload_at) : null;
            const detail = !allowed
              ? p.status === 'pending'
                ? 'Waiting for the patient to approve'
                : 'No access'
              : [stage, lastUpload ? `last upload ${formatDistanceToNow(lastUpload, { addSuffix: true })}` : null]
                  .filter(Boolean)
                  .join(' · ') || 'Connected';

            const body = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{name}</span>
                    {newDocs > 0 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                        {newDocs} new
                      </Badge>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground truncate">{detail}</span>
                </span>
                {allowed && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
              </>
            );

            return allowed ? (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate(`/doctor/patient/${p.patient_id}`)}
                className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/40 transition-colors"
              >
                {body}
              </button>
            ) : (
              <div key={p.id} className="flex items-center gap-3 p-3 opacity-70">
                {body}
              </div>
            );
          })}
        </Card>
      )}
    </section>
  );
};

export default DoctorPatientList;
