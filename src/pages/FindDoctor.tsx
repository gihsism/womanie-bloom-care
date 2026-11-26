import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/integrations/db/client';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Search, Star, Clock, Video, Calendar as CalendarIcon, CheckCircle, User, Printer, Share2, MapPin } from 'lucide-react';
import ShareWithDoctor from '@/components/dashboard/ShareWithDoctor';
import BookingDialog, { doctorDisplayName } from '@/components/booking/BookingDialog';
import { formatPrice } from '@/lib/booking';

interface Doctor {
  user_id: string;
  full_name: string;
  title: string | null;
  specialties: string[] | null;
  bio: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  years_experience: number | null;
  languages: string[] | null;
  rating: number | null;
  review_count: number | null;
  practice_address?: string | null;
  consultation_settings?: {
    consultation_price: number | null;
    currency: string;
    consultation_duration: number;
    video_enabled: boolean;
    is_available: boolean;
  } | null;
  schedule?: {
    day_of_week: number;
    start_time: string;
    end_time: string;
  }[];
}

// Shown while the directory has no verified, bookable doctor at all. Honest
// about why (doctors are still joining) and points to the two things that
// work today with her own doctor: a share code and a printable summary.
export const DoctorsJoiningEmptyState = ({ onPrint }: { onPrint: () => void }) => (
  <div className="panel px-5 py-8 sm:px-10 text-center max-w-xl mx-auto" data-testid="find-doctor-empty">
    <User className="h-10 w-10 mx-auto text-stage-accent mb-3" strokeWidth={1.7} aria-hidden="true" />
    <h2 className="section-title mb-2">Doctors are joining Womanie</h2>
    <p className="text-muted-foreground text-[15px]">
      There is no doctor to book here yet. Each doctor's licence is checked before she or he appears in this list.
    </p>
    <p className="text-muted-foreground text-[15px] mt-2">
      You can still share your records with your own doctor: create a one-time code for her to enter, or print a visit summary to bring along.
    </p>
    <div className="mt-6 flex flex-col sm:flex-row gap-2.5 justify-center">
      <ShareWithDoctor
        trigger={
          <button type="button" className="btn-stage">
            <Share2 className="h-4 w-4" aria-hidden="true" />
            Share a code with my doctor
          </button>
        }
      />
      <Button variant="outline" className="gap-2 min-h-[3.25rem] rounded-full px-5 text-[16px]" onClick={onPrint}>
        <Printer className="h-4 w-4" aria-hidden="true" />
        Print a visit summary
      </Button>
    </div>
  </div>
);

const FindDoctor = () => {
  const navigate = useNavigate();
  usePageTitle('Find a Doctor');
  const { toast } = useToast();
  const { user, loading } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'rating' | 'experience' | 'price_low'>('name');
  // The booking dialog's doctor (null = closed) and an optional preselected
  // time, e.g. from the profile page's "next free times"
  // (/find-doctor?book=<doctor id>&at=<ISO>).
  const [searchParams, setSearchParams] = useSearchParams();
  const [bookingDoctor, setBookingDoctor] = useState<Doctor | null>(null);
  const [bookingSlot, setBookingSlot] = useState<string | null>(null);
  // Patient's life_stage so we can highlight specialties that match
  // her current mode (OB-GYN for pregnancy, menopause specialist for
  // menopause, fertility specialist for conception, etc).
  const [lifeStage, setLifeStage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth/login');
    }
  }, [user, loading, navigate]);

  const fetchDoctors = useCallback(async () => {
    try {
      // Delegate to /api/doctors/list — patients can't hit
      // doctor_profiles / doctor_schedule through /api/db because of
      // per-table ownership enforcement.
      const resp = await fetch('/api/doctors/list');
      if (!resp.ok) throw new Error('Failed to load doctors');
      const payload = await resp.json();
      setDoctors(payload.doctors ?? []);
      setLoadFailed(false);
    } catch (error) {
      setLoadFailed(true);
      console.error('Error fetching doctors:', error);
      toast({
        title: 'Error',
        description: 'Failed to load doctors',
        variant: 'destructive',
      });
    } finally {
      setLoadingDoctors(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user) {
      fetchDoctors();
      // Pull life_stage so we can surface a "Recommended for you"
      // badge on doctors whose specialty matches the patient's
      // current mode. Fail silently — the list still works.
      db.from('profiles')
        .select('life_stage')
        .eq('id', user.id)
        .maybeSingle()
        .then(res => {
          const stage = (res.data as { life_stage?: string | null } | null)?.life_stage ?? null;
          if (stage) setLifeStage(stage);
        });
    }
  }, [user, fetchDoctors]);

  // Deep link from the doctor profile page: open the dialog once the
  // directory has loaded. A doctor no longer in the list (bookings paused)
  // is not opened; a short note says why.
  useEffect(() => {
    const id = searchParams.get('book');
    if (!id || loadingDoctors) return;
    const doc = doctors.find(d => d.user_id === id);
    if (doc) {
      setBookingDoctor(doc);
      setBookingSlot(searchParams.get('at'));
    } else if (!loadFailed) {
      toast({ title: 'Not bookable right now', description: 'This doctor is not taking new bookings at the moment.' });
    }
    const next = new URLSearchParams(searchParams);
    next.delete('book');
    next.delete('at');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, doctors, loadingDoctors, loadFailed, toast]);

  // The doctor paused bookings while the dialog was open: drop her from
  // the list at once and re-read the directory.
  const handleDoctorUnavailable = (doctorId: string) => {
    setDoctors(prev => prev.filter(d => d.user_id !== doctorId));
    fetchDoctors();
  };

  // The directory returns specialties[] (the Supabase-era single
  // `specialty` column is not part of it), so filter on that list.
  const specialties = [...new Set(doctors.flatMap(d => (Array.isArray(d.specialties) ? d.specialties : [])).filter(Boolean))].sort();

  // Map the patient's life stage → specialty keywords we look for on
  // a doctor's specialty / specialties / bio. A match earns the
  // doctor a "Recommended for you" badge and floats them to the top
  // when sortBy='name' (the default) — explicit sort orders win.
  const stageKeywords: string[] = (() => {
    switch (lifeStage) {
      case 'pregnancy':
        return ['ob', 'obgyn', 'ob-gyn', 'obstetric', 'obstetrician', 'maternal', 'perinatal', 'midwif'];
      case 'postpartum':
        return ['ob', 'obgyn', 'ob-gyn', 'obstetric', 'maternal', 'lactation', 'pelvic floor', 'mental health', 'postpartum', 'perinatal'];
      case 'conception':
      case 'ivf':
        return ['fertility', 'reproductive endo', 'rei', 'infertility', 'ivf'];
      case 'menopause':
      case 'post-menopause':
        return ['menopause', 'climacteric', 'hrt', 'hormone'];
      case 'pre-menstrual':
        return ['gynecolog', 'gynaecolog', 'reproductive'];
      case 'contraception':
        return ['gynecolog', 'gynaecolog', 'family planning', 'contracept'];
      case 'menstrual-cycle':
        return ['gynecolog', 'gynaecolog'];
      default:
        return [];
    }
  })();

  const isRecommended = (d: Doctor): boolean => {
    if (stageKeywords.length === 0) return false;
    const hay = [
      ...(Array.isArray(d.specialties) ? d.specialties : []),
      d.bio ?? '',
    ].join(' ').toLowerCase();
    return stageKeywords.some(k => hay.includes(k));
  };

  const filteredDoctors = doctors.filter(doctor => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q
      || doctor.full_name.toLowerCase().includes(q)
      || (doctor.bio?.toLowerCase().includes(q) ?? false)
      || (Array.isArray(doctor.specialties) && doctor.specialties.some(s => s?.toLowerCase().includes(q)))
      || (Array.isArray(doctor.languages) && doctor.languages.some(l => l?.toLowerCase().includes(q)));

    const matchesSpecialty = specialtyFilter === 'all'
      || (Array.isArray(doctor.specialties) && doctor.specialties.includes(specialtyFilter));

    return matchesSearch && matchesSpecialty;
  });

  const sortedDoctors = [...filteredDoctors].sort((a, b) => {
    // When the user hasn't picked an explicit sort, recommended
    // matches float to the top. Explicit sorts (rating / experience
    // / price) take precedence.
    if (sortBy === 'name') {
      const ra = isRecommended(a) ? 1 : 0;
      const rb = isRecommended(b) ? 1 : 0;
      if (ra !== rb) return rb - ra;
    }
    switch (sortBy) {
      case 'rating': {
        const ar = a.rating ?? 0;
        const br = b.rating ?? 0;
        if (br !== ar) return br - ar;
        return (b.review_count ?? 0) - (a.review_count ?? 0);
      }
      case 'experience': {
        const ax = a.years_experience ?? 0;
        const bx = b.years_experience ?? 0;
        return bx - ax;
      }
      case 'price_low': {
        const ap = a.consultation_settings?.consultation_price ?? Number.POSITIVE_INFINITY;
        const bp = b.consultation_settings?.consultation_price ?? Number.POSITIVE_INFINITY;
        return ap - bp;
      }
      case 'name':
      default:
        return a.full_name.localeCompare(b.full_name);
    }
  });

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b border-border bg-card p-4">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
          <Skeleton className="h-10 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="page-head sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 pt-3 pb-3">
          <button type="button" onClick={() => navigate('/dashboard')} className="flex items-center gap-2 min-h-11 -ml-1 px-1 hover:text-stage-accent" aria-label="Back to Home">
            <ArrowLeft className="h-5 w-5" />
            <span className="text-[15px] font-medium">Home</span>
          </button>
          <h1 className="page-title mt-1">Find a doctor</h1>
          <p className="page-sub mt-1">Book a visit with a verified doctor or midwife</p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-5">
        {/* Search and Filters (hidden while there is no one to search) */}
        <div className={`flex flex-col sm:flex-row gap-2.5 mb-6 ${!loadingDoctors && doctors.length === 0 ? 'hidden' : ''}`}>
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Name, specialty or language"
              aria-label="Search doctors"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 rounded-full pl-11 text-[16px] md:text-[16px]"
            />
          </div>
          <Select value={specialtyFilter} onValueChange={setSpecialtyFilter}>
            <SelectTrigger className="w-full sm:w-[200px] h-12 rounded-full px-5 text-[15px]" aria-label="Specialty">
              <SelectValue placeholder="All specialties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All specialties</SelectItem>
              {specialties.map(specialty => (
                <SelectItem key={specialty} value={specialty!}>{specialty}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={v => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-full sm:w-[180px] h-12 rounded-full px-5 text-[15px]" aria-label="Sort">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Sort: name (A–Z)</SelectItem>
              <SelectItem value="rating">Sort: Highest rated</SelectItem>
              <SelectItem value="experience">Sort: Most experienced</SelectItem>
              <SelectItem value="price_low">Sort: price (low to high)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Doctors List */}
        {loadingDoctors ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Card key={i} className="overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="flex items-start gap-4">
                    <Skeleton className="h-16 w-16 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-9 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : loadFailed ? (
          <div className="panel px-5 py-10 text-center">
            <p className="text-[15px] text-muted-foreground mb-4">We couldn't load the doctor list.</p>
            <Button variant="outline" onClick={() => { setLoadingDoctors(true); fetchDoctors(); }} className="min-h-11 rounded-full px-5">Try again</Button>
          </div>
        ) : doctors.length === 0 ? (
          <DoctorsJoiningEmptyState onPrint={() => navigate('/dashboard/visit-summary/print')} />
        ) : filteredDoctors.length === 0 ? (
          <div className="panel px-5 py-10 text-center">
            <User className="h-10 w-10 mx-auto text-muted-foreground mb-3" aria-hidden="true" />
            <h2 className="text-[17px] font-bold mb-1">No doctors match</h2>
            <p className="text-[15px] text-muted-foreground">Try a different search or specialty.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedDoctors.map(doctor => (
              <Card key={doctor.user_id} className="overflow-hidden" data-testid="doctor-card">
                <CardHeader className="pb-4">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={doctor.avatar_url || undefined} />
                      <AvatarFallback className="bg-stage-tint text-stage-accent text-lg font-bold">
                        {getInitials(doctor.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h2 className="text-[17px] font-bold leading-snug truncate">
                          <Link to={`/doctors/${encodeURIComponent(doctor.user_id)}`} className="hover:underline underline-offset-2">
                            {doctorDisplayName(doctor)}
                          </Link>
                        </h2>
                        {doctor.is_verified && (
                          <CheckCircle className="h-4 w-4 text-stage-accent flex-shrink-0" aria-label="Verified" />
                        )}
                        {isRecommended(doctor) && (
                          <Badge className="bg-stage-tint text-stage-accent border-transparent text-[12px] px-2 py-0.5 hover:bg-stage-tint">
                            Recommended for you
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        {Array.isArray(doctor.specialties) && doctor.specialties
                          .filter(Boolean)
                          .slice(0, 3)
                          .map((s, i) => (
                            <span key={s} className={i === 0 ? 'text-[14px] font-semibold text-muted-foreground' : 'text-[14px] text-muted-foreground'}>{i === 0 ? s : `· ${s}`}</span>
                          ))}
                      </div>
                      {(doctor.years_experience || (doctor.rating && doctor.review_count)) && (
                        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                          {doctor.years_experience && (
                            <span>{doctor.years_experience} years</span>
                          )}
                          {doctor.rating && doctor.review_count ? (
                            <span className="inline-flex items-center gap-0.5">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                              {doctor.rating.toFixed(1)} ({doctor.review_count})
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {doctor.bio && (
                    <p className="text-[15px] text-muted-foreground line-clamp-2">{doctor.bio}</p>
                  )}

                  {doctor.practice_address && (
                    <p className="text-[12px] text-muted-foreground flex items-start gap-1">
                      <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
                      <span><span className="sr-only">Practice address: </span>{doctor.practice_address}</span>
                    </p>
                  )}

                  {Array.isArray(doctor.languages) && doctor.languages.length > 0 && (
                    <p className="text-[14px] text-muted-foreground">
                      Speaks {doctor.languages.slice(0, 4).join(', ')}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      {doctor.consultation_settings?.video_enabled
                        ? <Video className="h-4 w-4" aria-hidden="true" />
                        : <MapPin className="h-4 w-4" aria-hidden="true" />}
                      <span>{doctor.consultation_settings?.video_enabled ? 'In person or video' : 'In person'}</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      <span>{doctor.consultation_settings?.consultation_duration || 30} min</span>
                    </div>
                    {(() => {
                      const price = formatPrice(doctor.consultation_settings?.consultation_price, doctor.consultation_settings?.currency);
                      return price ? <span className="font-medium text-foreground">{price}</span> : null;
                    })()}
                  </div>

                  <div className="flex gap-2">
                    <Link
                      to={`/doctors/${encodeURIComponent(doctor.user_id)}`}
                      className="flex-1 min-h-12 inline-flex items-center justify-center rounded-full border border-line px-4 text-[16px] font-semibold hover:bg-muted/40"
                    >
                      View profile
                    </Link>
                    <button
                      type="button"
                      className="flex-1 min-h-12 inline-flex items-center justify-center gap-2 rounded-full border border-stage-accent px-4 text-[16px] font-semibold text-stage-accent hover:bg-stage-tint"
                      onClick={() => { setBookingSlot(null); setBookingDoctor(doctor); }}
                    >
                      <CalendarIcon className="h-4 w-4" aria-hidden="true" />
                      Book
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <BookingDialog
        doctor={bookingDoctor}
        open={!!bookingDoctor}
        initialSlot={bookingSlot}
        onOpenChange={open => { if (!open) { setBookingDoctor(null); setBookingSlot(null); } }}
        onDoctorUnavailable={handleDoctorUnavailable}
      />
    </div>
  );
};

export default FindDoctor;
