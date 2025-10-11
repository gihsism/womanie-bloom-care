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
  Flame
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
}

const DashboardHeader = ({ userName, selectedMode, onModeChange, onNavigate }: DashboardHeaderProps) => {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const quickActions = [
    { id: 'B1', icon: MessageSquare, label: 'Healthcare', color: 'text-primary' },
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

  return (
    <div className="space-y-4">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold">
          {getGreeting()}, {userName}! 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Your personalized health dashboard
        </p>
      </div>

      {/* Mode Selector */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium mb-2 block">Life Stage Mode</label>
            <Select value={selectedMode} onValueChange={(value) => onModeChange(value as LifeStage)}>
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2">
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
export const getModeStats = (mode: LifeStage) => {
  switch (mode) {
    case 'menstrual-cycle':
    case 'contraception':
    case 'conception':
    case 'ivf':
      return [
        { title: 'Cycle Day', value: '14', subtitle: 'Ovulation window', icon: CalendarIcon, color: 'text-primary' },
        { title: 'Hormones', value: 'Optimal', subtitle: 'Estrogen & Progesterone', icon: TrendingUp, color: 'text-secondary' },
        { title: 'Fertility', value: 'High', subtitle: 'Peak window', icon: Heart, color: 'text-accent' },
        { title: 'Ovulation', value: 'Today', subtitle: 'Fertile day', icon: Droplet, color: 'text-primary' },
        { title: 'Vitamins', value: '8/10', subtitle: 'Daily intake', icon: Pill, color: 'text-secondary' },
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
