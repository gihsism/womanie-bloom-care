import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const quickActions = [
    { id: 'B3', icon: TrendingUp, label: 'Med Records', color: 'text-accent', action: () => navigate('/dashboard/medical-history') },
    { id: 'B4', icon: Smartphone, label: 'Devices', color: 'text-muted-foreground', action: () => navigate('/dashboard/devices') },
    { id: 'B5', icon: Users, label: 'Community', color: 'text-primary', action: () => onNavigate('B5') },
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
        <p className="text-sm text-muted-foreground flex items-center flex-wrap gap-0.5">
          Your personalized health dashboard •{' '}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center gap-1 font-medium text-primary hover:underline focus:outline-none">
                {getModeLabel(selectedMode)}
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-primary"><path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Switch mode</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {modeOptions.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => onModeChange(option.value as LifeStage)}
                  className={selectedMode === option.value ? 'bg-primary/10 font-medium' : ''}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </p>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center justify-center gap-3 overflow-x-auto pb-1">
        {/* Doctor Chat */}
        <button
          onClick={onDoctorChatClick}
          className="flex flex-col items-center gap-1.5 min-w-[72px] group"
        >
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors shadow-sm">
            <MessageSquare className="h-5 w-5 text-primary" />
          </div>
          <span className="text-xs font-medium text-foreground/80">Doctor Chat</span>
        </button>

        {/* Upload */}
        <button
          onClick={onUploadClick}
          className="flex flex-col items-center gap-1.5 min-w-[72px] group"
        >
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors shadow-sm">
            <Upload className="h-5 w-5 text-primary" />
          </div>
          <span className="text-xs font-medium text-foreground/80">Upload</span>
        </button>

        {quickActions.map((action) => {
          const IconComponent = action.icon;
          return (
            <button
              key={action.id}
              onClick={action.action}
              className="flex flex-col items-center gap-1.5 min-w-[72px] group"
            >
              <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center group-hover:bg-muted transition-colors shadow-sm">
                <IconComponent className={`h-5 w-5 ${action.color}`} />
              </div>
              <span className="text-xs font-medium text-foreground/80">{action.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// Health stats based on mode
export const getModeStats = (mode: LifeStage, cycleDay: number = 14, pregnancyDueDate?: Date | null) => {
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
    
    case 'pregnancy': {
      if (!pregnancyDueDate) {
        return [
          { title: 'Status', value: 'Not set', subtitle: 'Set your due date to see stats', icon: Baby, color: 'text-primary' },
        ];
      }
      const today = new Date();
      const gestStart = new Date(pregnancyDueDate.getTime() - 280 * 24 * 60 * 60 * 1000);
      const totalDays = Math.floor((today.getTime() - gestStart.getTime()) / (1000 * 60 * 60 * 24));
      const weeks = Math.floor(totalDays / 7);
      const days = totalDays % 7;
      const daysLeft = Math.max(0, Math.floor((pregnancyDueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
      const trimester = weeks < 13 ? 1 : weeks < 27 ? 2 : 3;
      const trimesterLabel = trimester === 1 ? 'First trimester' : trimester === 2 ? 'Second trimester' : 'Third trimester';

      const sizeMap: Record<number, string> = { 4:'Poppy seed',5:'Sesame seed',6:'Lentil',7:'Blueberry',8:'Raspberry',9:'Cherry',10:'Strawberry',11:'Fig',12:'Lime',13:'Peach',14:'Lemon',15:'Apple',16:'Avocado',17:'Pear',18:'Bell pepper',19:'Mango',20:'Banana',22:'Papaya',24:'Corn',26:'Lettuce',28:'Eggplant',30:'Cabbage',32:'Squash',34:'Cantaloupe',36:'Honeydew',38:'Pumpkin',40:'Watermelon' };
      const sizeKeys = Object.keys(sizeMap).map(Number).sort((a, b) => a - b);
      let babySize = sizeMap[4];
      for (const k of sizeKeys) { if (k <= weeks) babySize = sizeMap[k]; }

      return [
        { title: 'Week', value: `${weeks}+${days}`, subtitle: trimesterLabel, icon: Baby, color: 'text-primary' },
        { title: 'Baby Size', value: babySize, subtitle: `Week ${weeks} of 40`, icon: Heart, color: 'text-secondary' },
        { title: 'Due Date', value: daysLeft > 0 ? `${daysLeft} days` : 'Due!', subtitle: pregnancyDueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), icon: CalendarIcon, color: 'text-accent' },
        { title: 'Progress', value: `${Math.min(100, Math.round((totalDays / 280) * 100))}%`, subtitle: `${280 - totalDays} days remaining`, icon: TrendingUp, color: 'text-primary' },
      ];
    }
    
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
