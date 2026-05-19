import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { db } from '@/integrations/db/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, Upload } from 'lucide-react';

// Doctor profile editor. Until now the only chance to set bio /
// specialty / years of experience / languages was the signup form;
// after that the profile was frozen, even though those fields are what
// patients see in FindDoctor. A doctor who fixed a typo or wanted to
// add a new specialty had no surface to do it.
//
// doctor_profiles is owned by user_id (see api/db.ts OWNER_COLUMN), so
// updates go through the generic /api/db router under the session
// doctor's id — no new endpoint required.

interface DoctorProfileEditorProps {
  doctorId: string;
}

interface ProfileRow {
  full_name: string | null;
  title: string | null;
  specialty: string | null;
  specialties: string[] | null;
  bio: string | null;
  years_experience: number | null;
  languages: string[] | null;
  avatar_url: string | null;
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const splitList = (s: string): string[] =>
  s
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);

const DoctorProfileEditor = ({ doctorId }: DoctorProfileEditorProps) => {
  const { toast } = useToast();
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [specialtiesText, setSpecialtiesText] = useState('');
  const [bio, setBio] = useState('');
  const [yearsExperience, setYearsExperience] = useState<string>('');
  const [languagesText, setLanguagesText] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await db
        .from('doctor_profiles')
        .select('full_name, title, specialty, specialties, bio, years_experience, languages, avatar_url')
        .eq('user_id', doctorId)
        .maybeSingle();
      const row = (data as ProfileRow | null) ?? null;
      setFullName(row?.full_name ?? '');
      setTitle(row?.title ?? '');
      setSpecialty(row?.specialty ?? '');
      setSpecialtiesText(Array.isArray(row?.specialties) ? row.specialties.join(', ') : '');
      setBio(row?.bio ?? '');
      setYearsExperience(
        typeof row?.years_experience === 'number' ? String(row.years_experience) : ''
      );
      setLanguagesText(Array.isArray(row?.languages) ? row.languages.join(', ') : '');
      setAvatarUrl(row?.avatar_url ?? null);
      setLoaded(true);
    };
    load();
  }, [doctorId]);

  // Avatar upload — routed through /api/upload's PUT path with a
  // user-scoped pathname. Persists the resulting blob URL to
  // doctor_profiles.avatar_url immediately so the new image survives
  // a page refresh even if the user doesn't hit "Save profile" below.
  const handleAvatarFile = async (file: File) => {
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      toast({
        variant: 'destructive',
        title: 'Unsupported image format',
        description: 'Use a JPG, PNG, or WebP file.',
      });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast({
        variant: 'destructive',
        title: 'Image too large',
        description: 'Avatar files must be 5 MB or smaller.',
      });
      return;
    }
    setUploadingAvatar(true);
    try {
      // Stamp a uuid in the path so re-uploads don't get cached against
      // the previous bytes; user.id prefix keeps the PUT handler's
      // session-scoping check happy.
      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '';
      const safeExt = /^\.(jpg|jpeg|png|webp)$/i.test(ext) ? ext : '.jpg';
      const filename = `${doctorId}/avatar-${crypto.randomUUID()}${safeExt}`;
      const resp = await fetch(`/api/upload?filename=${encodeURIComponent(filename)}`, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!resp.ok) throw new Error(`Upload failed (${resp.status})`);
      const payload = (await resp.json()) as { url?: string };
      const url = payload.url;
      if (!url) throw new Error('Upload returned no URL');
      const { error } = await db
        .from('doctor_profiles')
        .update({ avatar_url: url })
        .eq('user_id', doctorId);
      if (error) throw error;
      setAvatarUrl(url);
      toast({
        title: 'Avatar updated',
        description: 'Patients will see your new photo in the directory.',
      });
    } catch (e) {
      console.error('Avatar upload failed:', e);
      toast({
        variant: 'destructive',
        title: 'Could not upload avatar',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!window.confirm('Remove your profile photo? Patients will see the default placeholder.')) {
      return;
    }
    try {
      const { error } = await db
        .from('doctor_profiles')
        .update({ avatar_url: null })
        .eq('user_id', doctorId);
      if (error) throw error;
      setAvatarUrl(null);
      toast({ title: 'Avatar removed' });
    } catch (e) {
      console.error('Avatar remove failed:', e);
      toast({ variant: 'destructive', title: 'Could not remove', description: 'Please try again.' });
    }
  };

  const handleSave = async () => {
    const yearsParsed = yearsExperience.trim() === '' ? null : Number(yearsExperience);
    if (yearsParsed !== null && (!Number.isFinite(yearsParsed) || yearsParsed < 0 || yearsParsed > 80)) {
      toast({
        variant: 'destructive',
        title: 'Years of experience invalid',
        description: 'Enter a number between 0 and 80, or leave it blank.',
      });
      return;
    }
    setSaving(true);
    try {
      const { error } = await db
        .from('doctor_profiles')
        .update({
          full_name: fullName.trim() || null,
          title: title.trim() || null,
          specialty: specialty.trim() || null,
          specialties: splitList(specialtiesText).length > 0 ? splitList(specialtiesText) : null,
          bio: bio.trim() || null,
          years_experience: yearsParsed,
          languages: splitList(languagesText).length > 0 ? splitList(languagesText) : null,
        })
        .eq('user_id', doctorId);
      if (error) throw error;
      toast({
        title: 'Profile saved',
        description: 'Patients browsing the directory will see your updated profile.',
      });
    } catch (e) {
      console.error('Doctor profile save failed:', e);
      toast({
        variant: 'destructive',
        title: 'Could not save',
        description: 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Public profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-4 w-4" />
          Public profile
        </CardTitle>
        <CardDescription>
          What patients see when they find you in the directory. Fields are stored on
          doctor_profiles.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Avatar uploader. Saves on file pick (not on Save profile), so
            the new image is live whether or not the doctor scrolls
            down to hit Save below. */}
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="Your profile photo"
              className="w-20 h-20 rounded-full object-cover border"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center border">
              <User className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 space-y-1.5">
            <Label>Profile photo</Label>
            <p className="text-[11px] text-muted-foreground">
              JPG / PNG / WebP, up to 5 MB. Shown on every directory card and patient view.
            </p>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      handleAvatarFile(f);
                      // Reset the input so picking the same file again
                      // re-triggers the change event.
                      e.target.value = '';
                    }
                  }}
                />
                <Button asChild size="sm" variant="outline" disabled={uploadingAvatar}>
                  <span>
                    {uploadingAvatar ? (
                      <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Uploading…</>
                    ) : (
                      <><Upload className="h-3.5 w-3.5 mr-1.5" />{avatarUrl ? 'Replace' : 'Upload'}</>
                    )}
                  </span>
                </Button>
              </label>
              {avatarUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={handleRemoveAvatar}
                  disabled={uploadingAvatar}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-[120px_1fr] gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Dr / Prof"
              maxLength={32}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="full-name">Full name</Label>
            <Input
              id="full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name as it should appear to patients"
              maxLength={120}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="specialty">Primary specialty</Label>
          <Input
            id="specialty"
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            placeholder="e.g. Obstetrics & Gynecology"
            maxLength={80}
          />
          <p className="text-[11px] text-muted-foreground">
            One short phrase — shown next to your name on directory cards.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="specialties">Additional specialties</Label>
          <Input
            id="specialties"
            value={specialtiesText}
            onChange={(e) => setSpecialtiesText(e.target.value)}
            placeholder="Fertility, Menopause, PCOS"
          />
          <p className="text-[11px] text-muted-foreground">
            Comma-separated. Patients can filter the directory by these.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="years">Years of experience</Label>
            <Input
              id="years"
              type="number"
              inputMode="numeric"
              min={0}
              max={80}
              value={yearsExperience}
              onChange={(e) => setYearsExperience(e.target.value)}
              placeholder="e.g. 12"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="languages">Languages</Label>
            <Input
              id="languages"
              value={languagesText}
              onChange={(e) => setLanguagesText(e.target.value)}
              placeholder="English, French, German"
            />
            <p className="text-[11px] text-muted-foreground">Comma-separated.</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A few sentences about your training and approach. Shown on your directory card."
            rows={5}
            maxLength={1000}
          />
          <p className="text-[11px] text-muted-foreground">{bio.length} / 1000 characters.</p>
        </div>
        <div className="pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
            ) : (
              'Save profile'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default DoctorProfileEditor;
