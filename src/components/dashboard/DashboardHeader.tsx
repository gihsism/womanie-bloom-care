import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  MessageSquare, 
  Activity, 
  FileText, 
  Smartphone, 
  Users,
  Calendar as CalendarIcon,
  Droplet,
  Heart,
  Pill,
  TrendingUp,
  Baby,
  Flame,
  Bot,
  Stethoscope,
  CheckCircle,
  HelpCircle,
  Lightbulb,
  Video,
  Clock,
  ClipboardList,
  FileCheck,
  Bell,
  Upload,
  Sparkles
} from 'lucide-react';

export type LifeStage = 
  | 'pre-menstrual'
  | 'menstrual-cycle'
  | 'contraception'
  | 'conception'
  | 'ivf'
  | 'pregnancy'
  | 'menopause'
  | 'post-menopause';

interface DashboardHeaderProps {
  userName: string;
  selectedMode: LifeStage;
  onModeChange: (mode: LifeStage) => void;
  onNavigate: (section: string) => void;
  onUploadClick?: () => void;
  onDoctorChatClick?: () => void;
  cycleDay?: number;
  cyclePhase?: string;
}

const DashboardHeader = ({ userName, selectedMode, onModeChange, onNavigate, onUploadClick, onDoctorChatClick, cycleDay = 14, cyclePhase = 'follicular' }: DashboardHeaderProps) => {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const quickActions = [
    { id: 'B2', icon: Activity, label: 'Dashboard', color: 'text-secondary' },
    { id: 'B3', icon: FileText, label: 'Records', color: 'text-accent' },
    { id: 'B4', icon: Smartphone, label: 'Devices', color: 'text-muted-foreground' },
    { id: 'B5', icon: Users, label: 'Community', color: 'text-primary' },
  ];

  const modeOptions = [
    { value: 'pre-menstrual', label: 'Pre-Menstrual' },
    { value: 'menstrual-cycle', label: 'Menstrual Cycle' },
    { value: 'contraception', label: 'Contraception Mode' },
    { value: 'conception', label: 'Conception Mode' },
    { value: 'ivf', label: 'IVF Mode' },
    { value: 'pregnancy', label: 'Pregnancy Mode' },
    { value: 'menopause', label: 'Menopause Mode' },
    { value: 'post-menopause', label: 'Post-Menopause Mode' },
  ];

  const getModeLabel = (mode: LifeStage) => {
    const option = modeOptions.find(o => o.value === mode);
    return option?.label || 'Select Mode';
  };

  return (
    <div className="space-y-4">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold">
          {getGreeting()}, {userName}! 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Your personalized health dashboard • <span className="font-medium text-primary">{getModeLabel(selectedMode)}</span>
        </p>
      </div>

      {/* Quick Actions */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1" />

          {/* Quick Actions */}
          <div className="flex gap-2">
            {/* Doctor Chat */}
            <Button
              variant="outline"
              size="sm"
              onClick={onDoctorChatClick}
              className="flex flex-col items-center gap-1 h-auto py-2 px-3 border-primary/20 hover:bg-primary/5"
            >
              <MessageSquare className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium">Doctor Chat</span>
            </Button>

            {/* Upload */}
            <Button
              variant="outline"
              size="sm"
              onClick={onUploadClick}
              className="flex flex-col items-center gap-1 h-auto py-2 px-3 border-primary/20 hover:bg-primary/5"
            >
              <Upload className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium">Upload</span>
            </Button>

            {quickActions.map((action) => {
              const IconComponent = action.icon;
              return (
                <Button
                  key={action.id}
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigate(action.id)}
                  className="flex flex-col items-center gap-1 h-auto py-2 px-3"
                >
                  <IconComponent className={`h-4 w-4 ${action.color}`} />
                  <span className="text-xs">{action.label}</span>
                </Button>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
};

// Health stats based on mode
export const getModeStats = (mode: LifeStage, cycleDay: number = 14) => {
  // Determine cycle phase
  let phase = 'follicular';
  let estrogen = 'Low';
  let progesterone = 'Low';
  let mood = 'Stable';
  let energy = 'Moderate';
  
  if (cycleDay <= 5) {
    phase = 'menstrual';
    estrogen = 'Low';
    progesterone = 'Low';
    mood = 'Low energy, may feel tired';
    energy = 'Low';
  } else if (cycleDay <= 13) {
    phase = 'follicular';
    estrogen = 'Rising';
    progesterone = 'Low';
    mood = 'Optimistic, energetic';
    energy = 'Increasing';
  } else if (cycleDay === 14 || cycleDay === 15) {
    phase = 'ovulation';
    estrogen = 'Peak';
    progesterone = 'Rising';
    mood = 'Confident, social';
    energy = 'High';
  } else if (cycleDay <= 28) {
    phase = 'luteal';
    estrogen = 'Moderate → Low';
    progesterone = 'High → Dropping';
    if (cycleDay > 24) {
      mood = 'May feel irritable or anxious';
      energy = 'Declining';
    } else {
      mood = 'Calm, focused';
      energy = 'Moderate';
    }
  }
  
  // Get detailed hormone explanations
  const getHormoneDetails = () => {
    let estrogenDetails = '';
    let progesteroneDetails = '';
    
    if (cycleDay <= 5) {
      estrogenDetails = 'Low estrogen may cause fatigue and low mood';
      progesteroneDetails = 'Low progesterone during menstruation is normal';
    } else if (cycleDay <= 13) {
      estrogenDetails = 'Rising estrogen boosts mood and energy';
      progesteroneDetails = 'Low progesterone allows estrogen dominance';
    } else if (cycleDay === 14 || cycleDay === 15) {
      estrogenDetails = 'Peak estrogen enhances confidence and sociability';
      progesteroneDetails = 'Rising progesterone prepares body for pregnancy';
    } else if (cycleDay <= 28) {
      if (cycleDay > 24) {
        estrogenDetails = 'Dropping estrogen may cause mood swings';
        progesteroneDetails = 'Dropping progesterone can cause PMS symptoms';
      } else {
        estrogenDetails = 'Moderate estrogen supports calm mood';
        progesteroneDetails = 'High progesterone promotes relaxation and focus';
      }
    }
    
    return { estrogenDetails, progesteroneDetails };
  };
  
  const { estrogenDetails, progesteroneDetails } = getHormoneDetails();
  
  switch (mode) {
    case 'menstrual-cycle':
    case 'contraception':
    case 'conception':
    case 'ivf':
      return [
        { title: 'Cycle Day', value: `${cycleDay}`, subtitle: `${phase.charAt(0).toUpperCase() + phase.slice(1)} phase`, icon: CalendarIcon, color: 'text-primary' },
        { title: 'Estrogen', value: estrogen, subtitle: estrogenDetails, icon: TrendingUp, color: 'text-secondary' },
        { title: 'Progesterone', value: progesterone, subtitle: progesteroneDetails, icon: Activity, color: 'text-accent' },
        { title: 'Mood Impact', value: mood, subtitle: 'How you might feel today', icon: Heart, color: 'text-primary' },
        { title: 'Energy Level', value: energy, subtitle: 'Physical vitality today', icon: Flame, color: 'text-secondary' },
      ];
    
    case 'pregnancy':
      return [
        { title: 'Week', value: '24', subtitle: 'Second trimester', icon: Baby, color: 'text-primary' },
        { title: 'Baby Size', value: 'Papaya', subtitle: '~30cm length', icon: Heart, color: 'text-secondary' },
        { title: 'Weight Gain', value: '+12kg', subtitle: 'On track', icon: TrendingUp, color: 'text-accent' },
        { title: 'Next Appt', value: '5 days', subtitle: 'Ultrasound scan', icon: CalendarIcon, color: 'text-primary' },
        { title: 'Vitamins', value: '10/10', subtitle: 'Prenatal complete', icon: Pill, color: 'text-secondary' },
      ];
    
    case 'menopause':
    case 'post-menopause':
      return [
        { title: 'Last Period', value: '6 mo', subtitle: 'Menopause confirmed', icon: CalendarIcon, color: 'text-primary' },
        { title: 'Hormones', value: 'Low', subtitle: 'Estrogen levels', icon: TrendingUp, color: 'text-secondary' },
        { title: 'Hot Flashes', value: '3/day', subtitle: 'Decreasing', icon: Flame, color: 'text-accent' },
        { title: 'Bone Density', value: 'Good', subtitle: 'Last scan normal', icon: Heart, color: 'text-primary' },
        { title: 'Vitamins', value: '9/10', subtitle: 'Ca + Vit D', icon: Pill, color: 'text-secondary' },
      ];
    
    default:
      return [
        { title: 'Age', value: '12', subtitle: 'Years old', icon: CalendarIcon, color: 'text-primary' },
        { title: 'Growth', value: 'Normal', subtitle: 'On track', icon: TrendingUp, color: 'text-secondary' },
        { title: 'Education', value: 'Active', subtitle: 'Learning resources', icon: Heart, color: 'text-accent' },
        { title: 'Health', value: 'Good', subtitle: 'Regular checkups', icon: Activity, color: 'text-primary' },
        { title: 'Vitamins', value: '7/10', subtitle: 'Daily intake', icon: Pill, color: 'text-secondary' },
      ];
  }
};

export default DashboardHeader;
