import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Search, Star, Clock, Video, Calendar as CalendarIcon, CheckCircle, User, Loader2 } from 'lucide-react';
import { format, addDays, setHours, setMinutes } from 'date-fns';

interface Doctor {
  id: string;
  user_id: string;
  full_name: string;
  specialty: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_verified: boolean;
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
      // Fetch verified doctors with their consultation settings
      const { data: doctorProfiles, error: doctorsError } = await supabase
        .from('doctor_profiles')
        .select('*')
        .eq('is_verified', true);

      if (doctorsError) throw doctorsError;

      // Fetch consultation settings for available doctors
      const { data: settings, error: settingsError } = await supabase
        .from('available_consultations' as any)
        .select('*')
        .eq('is_available', true) as { data: any[] | null; error: any };

      if (settingsError) throw settingsError;

      // Fetch schedules
      const { data: schedules, error: schedulesError } = await supabase
        .from('doctor_schedule')
        .select('*')
        .eq('is_active', true);

      if (schedulesError) throw schedulesError;

      // Combine data
      const doctorsWithSettings = doctorProfiles?.map(doctor => ({
        ...doctor,
        consultation_settings: settings?.find(s => s.doctor_id === doctor.user_id) || null,
        schedule: schedules?.filter(s => s.doctor_id === doctor.user_id) || []
      })).filter(d => d.consultation_settings?.is_available) || [];

      setDoctors(doctorsWithSettings);
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

    while (currentTime < endTime) {
      slots.push(format(currentTime, 'HH:mm'));
      currentTime = new Date(currentTime.getTime() + duration * 60000);
    }

    return slots;
  };

  const handleBookAppointment = async () => {
    if (!selectedDoctor || !selectedDate || !selectedTime || !user) return;

    setBookingLoading(true);
    try {
      const [hours, minutes] = selectedTime.split(':').map(Number);
      const scheduledAt = setMinutes(setHours(selectedDate, hours), minutes);

      const { error } = await supabase
        .from('appointments')
        .insert({
          doctor_id: selectedDoctor.user_id,
          patient_id: user.id,
          scheduled_at: scheduledAt.toISOString(),
          duration: selectedDoctor.consultation_settings?.consultation_duration || 30,
          consultation_type: selectedDoctor.consultation_settings?.video_enabled ? 'video' : 'in_person',
          status: 'scheduled',
          payment_status: 'pending',
        });

      if (error) throw error;

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
        title: 'Error',
        description: 'Failed to book appointment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBookingLoading(false);
    }
  };

  const specialties = [...new Set(doctors.map(d => d.specialty).filter(Boolean))];

  const filteredDoctors = doctors.filter(doctor => {
    const matchesSearch = doctor.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doctor.specialty?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doctor.bio?.toLowerCase().includes(searchQuery.toLowerCase());
    
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
            <a href="/" className="text-lg font-bold text-primary hover:opacity-80 transition-opacity">
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
              placeholder="Search by name, specialty, or keywords..."
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
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle className="text-lg truncate">Dr. {doctor.full_name}</CardTitle>
                        {doctor.is_verified && (
                          <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                        )}
                      </div>
                      {doctor.specialty && (
                        <Badge variant="secondary" className="mb-2">
                          {doctor.specialty}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {doctor.bio && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{doctor.bio}</p>
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
                              {slots.length === 0 ? (
                                <div className="text-center py-4 bg-muted/50 rounded-lg">
                                  <Clock className="h-5 w-5 mx-auto text-muted-foreground mb-1.5" aria-hidden="true" />
                                  <p className="text-sm text-muted-foreground">No time slots available on this day.</p>
                                  <p className="text-xs text-muted-foreground mt-1">Try selecting a different date.</p>
                                </div>
                              ) : (
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
