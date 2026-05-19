import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import UserMenu from '@/components/UserMenu';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Search, Star, Clock, Video, Calendar as CalendarIcon, CheckCircle, User, Loader2 } from 'lucide-react';
import { format, addDays, setHours, setMinutes } from 'date-fns';

interface Doctor {
  id: string;
  user_id: string;
  full_name: string;
  title: string | null;
  specialty: string | null;
  specialties: string[] | null;
  bio: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  years_experience: number | null;
  languages: string[] | null;
  rating: number | null;
  review_count: number | null;
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

const FindDoctor = () => {
  const navigate = useNavigate();
  usePageTitle('Find a Doctor');
  const { toast } = useToast();
  const { user, loading } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState<string>('all');
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  // Busy slots for the currently selected (doctor, date) pair. Each entry is
  // {scheduled_at, duration} for non-cancelled appointments. We use these to
  // strike out slots that overlap with already-booked time, so two patients
  // can't both be offered the same slot.
  const [busySlots, setBusySlots] = useState<{ scheduled_at: string; duration: number | null }[]>([]);
  const [busySlotsLoading, setBusySlotsLoading] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth/login');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchDoctors();
    }
  }, [user]);

  const fetchDoctors = async () => {
    try {
      // Delegate to /api/doctors/list — patients can't hit
      // doctor_profiles / doctor_schedule through /api/db because of
      // per-table ownership enforcement.
      const resp = await fetch('/api/doctors/list');
      if (!resp.ok) throw new Error('Failed to load doctors');
      const payload = await resp.json();
      setDoctors(payload.doctors ?? []);
    } catch (error) {
      console.error('Error fetching doctors:', error);
      toast({
        title: 'Error',
        description: 'Failed to load doctors',
        variant: 'destructive',
      });
    } finally {
      setLoadingDoctors(false);
    }
  };

  const getAvailableTimeSlots = (doctor: Doctor, date: Date) => {
    const dayOfWeek = date.getDay();
    const daySchedule = doctor.schedule?.find(s => s.day_of_week === dayOfWeek);

    if (!daySchedule) return [];

    const slots: string[] = [];
    const duration = doctor.consultation_settings?.consultation_duration || 30;
    const [startHour, startMin] = daySchedule.start_time.split(':').map(Number);
    const [endHour, endMin] = daySchedule.end_time.split(':').map(Number);

    let currentTime = setMinutes(setHours(date, startHour), startMin);
    const endTime = setMinutes(setHours(date, endHour), endMin);

    // Precompute busy intervals as [startMs, endMs) so overlap is a tight check.
    const busyIntervals = busySlots.map(b => {
      const startMs = new Date(b.scheduled_at).getTime();
      const dur = typeof b.duration === 'number' && b.duration > 0 ? b.duration : duration;
      return [startMs, startMs + dur * 60000] as const;
    });

    const nowMs = Date.now();

    while (currentTime < endTime) {
      const slotStart = currentTime.getTime();
      const slotEnd = slotStart + duration * 60000;
      const overlapsBusy = busyIntervals.some(([bs, be]) => slotStart < be && slotEnd > bs);
      // Also hide slots that have already started — picking 10:00 at 10:15
      // would just produce a server-side error.
      const inPast = slotEnd <= nowMs;
      if (!overlapsBusy && !inPast) {
        slots.push(format(currentTime, 'HH:mm'));
      }
      currentTime = new Date(currentTime.getTime() + duration * 60000);
    }

    return slots;
  };

  // Reload busy slots whenever the doctor or date changes inside the booking dialog.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!selectedDoctor || !selectedDate) {
        setBusySlots([]);
        return;
      }
      setBusySlotsLoading(true);
      try {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const params = new URLSearchParams({ doctor_id: selectedDoctor.user_id, date: dateStr });
        const resp = await fetch(`/api/doctors/availability?${params.toString()}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const payload = await resp.json();
        if (!cancelled) setBusySlots((payload.busy ?? []) as { scheduled_at: string; duration: number | null }[]);
      } catch (e) {
        console.error('Failed to load availability:', e);
        if (!cancelled) setBusySlots([]);
      } finally {
        if (!cancelled) setBusySlotsLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [selectedDoctor?.user_id, selectedDate]);

  const handleBookAppointment = async () => {
    if (!selectedDoctor || !selectedDate || !selectedTime || !user) return;

    setBookingLoading(true);
    try {
      const [hours, minutes] = selectedTime.split(':').map(Number);
      const scheduledAt = setMinutes(setHours(selectedDate, hours), minutes);

      // Routed through /api/appointments/book so the server can run a
      // conflict-guarded INSERT — without it, two patients hitting the
      // same slot inside the round-trip both succeed.
      const resp = await fetch('/api/appointments/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctor_id: selectedDoctor.user_id,
          scheduled_at: scheduledAt.toISOString(),
          duration: selectedDoctor.consultation_settings?.consultation_duration || 30,
          consultation_type: selectedDoctor.consultation_settings?.video_enabled ? 'video' : 'in_person',
        }),
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        // 409 is the recognized "slot just taken" case — surface the
        // server's message verbatim so the user sees the specific
        // reason without us re-wording it.
        throw new Error(payload.error || `HTTP ${resp.status}`);
      }

      toast({
        title: 'Appointment Booked',
        description: `Your consultation with Dr. ${selectedDoctor.full_name} is scheduled for ${format(scheduledAt, 'PPP')} at ${selectedTime}`,
      });

      setBookingDialogOpen(false);
      setSelectedDoctor(null);
      setSelectedDate(undefined);
      setSelectedTime('');
    } catch (error) {
      console.error('Error booking appointment:', error);
      toast({
        title: 'Could not book',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBookingLoading(false);
    }
  };

  const specialties = [...new Set(doctors.map(d => d.specialty).filter(Boolean))];

  const filteredDoctors = doctors.filter(doctor => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q
      || doctor.full_name.toLowerCase().includes(q)
      || (doctor.specialty?.toLowerCase().includes(q) ?? false)
      || (doctor.bio?.toLowerCase().includes(q) ?? false)
      || (Array.isArray(doctor.specialties) && doctor.specialties.some(s => s?.toLowerCase().includes(q)))
      || (Array.isArray(doctor.languages) && doctor.languages.some(l => l?.toLowerCase().includes(q)));

    const matchesSpecialty = specialtyFilter === 'all' || doctor.specialty === specialtyFilter;

    return matchesSearch && matchesSpecialty;
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
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} aria-label="Back to dashboard">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">Find a Doctor</h1>
              <p className="text-sm text-muted-foreground">Book a consultation with verified healthcare professionals</p>
            </div>
            <a href="/" onClick={(e) => { e.preventDefault(); window.location.href = '/'; }} className="text-lg font-bold text-primary hover:opacity-80 transition-opacity">
              Womanie
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, specialty, language, or keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={specialtyFilter} onValueChange={setSpecialtyFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="All Specialties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Specialties</SelectItem>
              {specialties.map(specialty => (
                <SelectItem key={specialty} value={specialty!}>{specialty}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Doctors List */}
        {loadingDoctors ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
        ) : filteredDoctors.length === 0 ? (
          <Card className="p-12 text-center">
            <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Doctors Available</h3>
            <p className="text-muted-foreground">
              {searchQuery || specialtyFilter !== 'all' 
                ? 'No doctors match your search criteria. Try adjusting your filters.'
                : 'No verified doctors are currently accepting consultations. Please check back later.'}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDoctors.map(doctor => (
              <Card key={doctor.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <CardHeader className="pb-4">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={doctor.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-lg">
                        {getInitials(doctor.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <CardTitle className="text-lg truncate">
                          {doctor.title ? `${doctor.title} ` : 'Dr. '}{doctor.full_name}
                        </CardTitle>
                        {doctor.is_verified && (
                          <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" aria-label="Verified" />
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        {doctor.specialty && (
                          <Badge variant="secondary">{doctor.specialty}</Badge>
                        )}
                        {Array.isArray(doctor.specialties) && doctor.specialties
                          .filter(s => s && s !== doctor.specialty)
                          .slice(0, 2)
                          .map(s => (
                            <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                          ))}
                      </div>
                      {(doctor.years_experience || (doctor.rating && doctor.review_count)) && (
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {doctor.years_experience && (
                            <span>{doctor.years_experience}y experience</span>
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
                    <p className="text-sm text-muted-foreground line-clamp-2">{doctor.bio}</p>
                  )}

                  {Array.isArray(doctor.languages) && doctor.languages.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[11px] text-muted-foreground">Languages:</span>
                      {doctor.languages.slice(0, 4).map(l => (
                        <Badge key={l} variant="outline" className="text-[10px]">{l}</Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 text-sm">
                    {doctor.consultation_settings?.video_enabled && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Video className="h-4 w-4" />
                        <span>Video</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>{doctor.consultation_settings?.consultation_duration || 30} min</span>
                    </div>
                    {doctor.consultation_settings?.consultation_price && (
                      <div className="flex items-center gap-1 font-medium text-foreground">
                        <span>
                          {doctor.consultation_settings.currency} {doctor.consultation_settings.consultation_price}
                        </span>
                      </div>
                    )}
                  </div>

                  <Dialog open={bookingDialogOpen && selectedDoctor?.id === doctor.id} onOpenChange={(open) => {
                    setBookingDialogOpen(open);
                    if (open) setSelectedDoctor(doctor);
                    else {
                      setSelectedDoctor(null);
                      setSelectedDate(undefined);
                      setSelectedTime('');
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button className="w-full" onClick={() => setSelectedDoctor(doctor)}>
                        <CalendarIcon className="h-4 w-4 mr-2" />
                        Book Consultation
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Book with Dr. {doctor.full_name}</DialogTitle>
                        <DialogDescription>
                          Select a date and time for your consultation
                        </DialogDescription>
                      </DialogHeader>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-medium mb-2 block">Select Date</label>
                          <Calendar
                            mode="single"
                            selected={selectedDate}
                            onSelect={setSelectedDate}
                            disabled={(date) => {
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              const dayOfWeek = date.getDay();
                              const hasSchedule = doctor.schedule?.some(s => s.day_of_week === dayOfWeek);
                              return date < today || !hasSchedule;
                            }}
                            className="rounded-md border"
                          />
                        </div>

                        {selectedDate && (() => {
                          const slots = getAvailableTimeSlots(doctor, selectedDate);
                          return (
                            <div>
                              <label className="text-sm font-medium mb-2 block">Select Time</label>
                              {busySlotsLoading ? (
                                <div className="flex items-center justify-center py-4 bg-muted/50 rounded-lg gap-2 text-sm text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Checking availability…
                                </div>
                              ) : slots.length === 0 ? (
                                <div className="text-center py-4 bg-muted/50 rounded-lg">
                                  <Clock className="h-5 w-5 mx-auto text-muted-foreground mb-1.5" aria-hidden="true" />
                                  <p className="text-sm text-muted-foreground">
                                    {busySlots.length > 0
                                      ? 'All time slots are booked on this day.'
                                      : 'No time slots available on this day.'}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">Try selecting a different date.</p>
                                </div>
                              ) : (
                                <>
                                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                                    {slots.map(time => (
                                      <Button
                                        key={time}
                                        variant={selectedTime === time ? 'default' : 'outline'}
                                        className="h-10 text-sm"
                                        onClick={() => setSelectedTime(time)}
                                      >
                                        {time}
                                      </Button>
                                    ))}
                                  </div>
                                  {busySlots.length > 0 && (
                                    <p className="text-[11px] text-muted-foreground mt-1.5">
                                      {busySlots.length} slot{busySlots.length === 1 ? '' : 's'} already booked are hidden.
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })()}

                        {selectedDate && selectedTime && (
                          <div className="p-4 bg-muted rounded-lg">
                            <h4 className="font-medium mb-2">Appointment Summary</h4>
                            <p className="text-sm text-muted-foreground">
                              {format(selectedDate, 'PPPP')} at {selectedTime}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Duration: {doctor.consultation_settings?.consultation_duration || 30} minutes
                            </p>
                            {doctor.consultation_settings?.consultation_price && (
                              <p className="text-sm font-medium mt-2">
                                Price: {doctor.consultation_settings.currency} {doctor.consultation_settings.consultation_price}
                              </p>
                            )}
                          </div>
                        )}

                        <Button
                          className="w-full"
                          disabled={!selectedDate || !selectedTime || bookingLoading}
                          onClick={handleBookAppointment}
                        >
                          {bookingLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Booking...
                            </>
                          ) : (
                            'Confirm Booking'
                          )}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FindDoctor;
