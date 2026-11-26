import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarIcon, CheckCircle, Clock, Languages, MapPin, Star, Video } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import BookingDialog, { doctorDisplayName, type BookableDoctor } from '@/components/booking/BookingDialog';
import { formatPrice, formatPracticeShortDate, swissSuffix } from '@/lib/booking';
import { formatPracticeTime } from '@/lib/practiceTime';

// A doctor's profile as patients see it, inside the app: bio, specialties,
// languages, practice address, visit types and price, and the next 3 free
// times (Swiss time). Backed by /api/doctors/profile, which only answers
// for approved doctors with bookings on and never returns private fields.

interface ProfileDoctor extends BookableDoctor {
  specialties: string[];
  years_experience: number | null;
  bio: string | null;
  avatar_url: string | null;
  rating: number | null;
  review_count: number | null;
  languages: string[];
  credentials: string[];
  consultation_settings: NonNullable<BookableDoctor['consultation_settings']> & { visit_types: Array<'video' | 'in_person'> };
}

type State =
  | { kind: 'loading' }
  | { kind: 'gone' }
  | { kind: 'error' }
  | { kind: 'ready'; doctor: ProfileDoctor; next: string[] };

const initials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

const DoctorProfile = () => {
  const { doctorId = '' } = useParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [bookingOpen, setBookingOpen] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  usePageTitle(state.kind === 'ready' ? doctorDisplayName(state.doctor) : 'Doctor');

  useEffect(() => {
    if (!loading && !user) navigate('/auth/login');
  }, [user, loading, navigate]);

  // quiet = refresh the free times after the dialog closes, without
  // flashing the skeleton.
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setState({ kind: 'loading' });
    try {
      const resp = await fetch(`/api/doctors/profile?doctor_id=${encodeURIComponent(doctorId)}`);
      if (resp.status === 404) { setState({ kind: 'gone' }); return; }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const payload = await resp.json();
      setState({ kind: 'ready', doctor: payload.doctor, next: payload.next_slots ?? [] });
    } catch (e) {
      console.error('Failed to load doctor profile:', e);
      if (!quiet) setState({ kind: 'error' });
    }
  }, [doctorId]);

  useEffect(() => { if (user && doctorId) load(); }, [user, doctorId, load]);

  const openBooking = (at: string | null) => { setSlot(at); setBookingOpen(true); };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/find-doctor')} aria-label="Back to Find a Doctor">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold truncate">
            {state.kind === 'ready' ? doctorDisplayName(state.doctor) : 'Doctor'}
          </h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {state.kind === 'loading' && (
          <div className="space-y-4" aria-busy="true">
            <div className="flex gap-4 items-center">
              <Skeleton className="h-20 w-20 rounded-full" />
              <div className="space-y-2 flex-1"><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-32" /></div>
            </div>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {state.kind === 'gone' && (
          <Card className="p-8 text-center" data-testid="doctor-profile-gone">
            <h2 className="text-lg font-semibold mb-2">This doctor is not taking bookings right now</h2>
            <p className="text-sm text-muted-foreground mb-4">The doctor may have paused new bookings. Your existing visits are not affected.</p>
            <Button asChild><Link to="/find-doctor">See other doctors</Link></Button>
          </Card>
        )}

        {state.kind === 'error' && (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground mb-4">We could not load this doctor's page.</p>
            <Button variant="outline" onClick={() => load()}>Try again</Button>
          </Card>
        )}

        {state.kind === 'ready' && (() => {
          const d = state.doctor;
          const cs = d.consultation_settings;
          const price = formatPrice(cs.consultation_price, cs.currency);
          return (
            <>
              <section className="flex items-start gap-4" data-testid="doctor-profile">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={d.avatar_url || undefined} alt="" />
                  <AvatarFallback className="bg-primary/10 text-primary text-xl">{initials(d.full_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold flex items-center gap-2 flex-wrap">
                    {doctorDisplayName(d)}
                    <CheckCircle className="h-4 w-4 text-primary" aria-label="Licence checked by Womanie" />
                  </h2>
                  {d.specialties.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {d.specialties.map((s, i) => <Badge key={s} variant={i === 0 ? 'secondary' : 'outline'}>{s}</Badge>)}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1.5 flex flex-wrap gap-x-3">
                    {d.years_experience ? <span>{d.years_experience} years' experience</span> : null}
                    {d.credentials.length > 0 && <span>{d.credentials.join(', ')}</span>}
                    {d.rating && d.review_count ? (
                      <span className="inline-flex items-center gap-0.5">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                        {d.rating.toFixed(1)} ({d.review_count})
                      </span>
                    ) : null}
                  </p>
                </div>
              </section>

              {d.bio && (
                <section aria-labelledby="about-h">
                  <h3 id="about-h" className="text-sm font-semibold text-muted-foreground mb-1.5">About</h3>
                  <p className="text-sm whitespace-pre-line">{d.bio}</p>
                </section>
              )}

              <section className="grid gap-3 sm:grid-cols-2 text-sm">
                {d.languages.length > 0 && (
                  <p className="flex items-start gap-2"><Languages className="h-4 w-4 mt-0.5 text-muted-foreground" aria-hidden="true" />
                    <span><span className="sr-only">Languages: </span>{d.languages.join(', ')}</span></p>
                )}
                {d.practice_address && (
                  <p className="flex items-start gap-2"><MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" aria-hidden="true" />
                    <span><span className="sr-only">Practice address: </span>{d.practice_address}</span></p>
                )}
                <p className="flex items-start gap-2">
                  {cs.visit_types.includes('video') ? <Video className="h-4 w-4 mt-0.5 text-muted-foreground" aria-hidden="true" /> : <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" aria-hidden="true" />}
                  <span>{cs.visit_types.includes('video') ? 'In person or video call' : 'In person only'}</span>
                </p>
                <p className="flex items-start gap-2"><Clock className="h-4 w-4 mt-0.5 text-muted-foreground" aria-hidden="true" />
                  <span>{cs.consultation_duration} minutes{price ? ` · ${price}` : ''}</span></p>
              </section>

              <Card className="p-4" data-testid="next-slots">
                <h3 className="text-sm font-semibold mb-3">Next free times{swissSuffix()}</h3>
                {state.next.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No free time in the next four weeks. You can still look further ahead in the calendar.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {state.next.map(iso => {
                      const at = new Date(iso);
                      return (
                        <Button key={iso} variant="outline" className="h-11" onClick={() => openBooking(iso)}>
                          {formatPracticeShortDate(at)}, {formatPracticeTime(at)}
                        </Button>
                      );
                    })}
                  </div>
                )}
                <Button className="w-full mt-3 gap-2" onClick={() => openBooking(null)}>
                  <CalendarIcon className="h-4 w-4" aria-hidden="true" />
                  {state.next.length ? 'See all times' : 'Open the calendar'}
                </Button>
              </Card>

              <BookingDialog
                doctor={d}
                open={bookingOpen}
                initialSlot={slot}
                onOpenChange={o => { setBookingOpen(o); if (!o) load(true); }}
                onDoctorUnavailable={() => setState({ kind: 'gone' })}
              />
            </>
          );
        })()}
      </div>
    </div>
  );
};

export default DoctorProfile;
