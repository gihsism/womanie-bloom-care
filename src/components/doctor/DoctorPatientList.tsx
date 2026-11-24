import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
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
      <h2 id="doctor-patients-heading" className="section-title">
        Patients <span className="text-muted-foreground font-semibold">({patients.length})</span>
      </h2>

      {patients.length >= SEARCH_THRESHOLD && (
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search patients"
            placeholder="Search by name or life stage"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full h-12 pl-10 pr-4 text-[16px] border border-input rounded-full focus:outline-none focus:ring-2 focus:ring-stage-accent bg-background"
          />
        </div>
      )}

      {patients.length === 0 ? (
        <p className="row-group px-4 py-4 text-[15px] text-muted-foreground">
          No patients yet. Ask a patient for her access code, then tap “Add a patient”.
        </p>
      ) : visible.length === 0 ? (
        <p className="row-group px-4 py-4 text-[15px] text-muted-foreground">No patients match “{query}”.</p>
      ) : (
        <div className="row-group">
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
                    <span className="text-[17px] font-medium truncate">{name}</span>
                    {newDocs > 0 && (
                      <span className="shrink-0 rounded-full bg-stage-accent px-2 py-0.5 text-[12px] font-bold text-white tabular-nums">
                        {newDocs} new
                      </span>
                    )}
                  </span>
                  <span className="block text-[14px] text-muted-foreground truncate">{detail}</span>
                </span>
                {allowed && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
              </>
            );

            return allowed ? (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate(`/doctor/patient/${p.patient_id}`)}
                className="flex w-full items-center gap-3 min-h-14 px-4 py-3 text-left hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stage-accent"
              >
                {body}
              </button>
            ) : (
              <div key={p.id} className="flex items-center gap-3 min-h-14 px-4 py-3 text-muted-foreground">
                {body}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default DoctorPatientList;
