import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import UserMenu from '@/components/UserMenu';
import {
  ArrowLeft,
  Phone,
  Plus,
  Trash2,
  AlertTriangle,
  Siren,
} from 'lucide-react';
import { errorMessage } from '@/lib/errors';

// Emergency contacts. Stored in localStorage keyed per user.id — no
// schema changes needed. Shape matches what a future
// `user_emergency_contacts` table would hold, so a future migration
// is a drop-in swap: replace the storage calls with fetch('/api/me/
// emergency-contacts').
//
// List is capped at 5 to keep the UX simple and discourage clutter.

const STORAGE_PREFIX = 'womanie_emergency_contacts_';
const MAX_CONTACTS = 5;

interface Contact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
}

function loadFromStorage(key: string): Contact[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValidShape) : [];
  } catch {
    return [];
  }
}

function isValidShape(v: unknown): v is Contact {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return typeof c.id === 'string'
    && typeof c.name === 'string'
    && typeof c.relationship === 'string'
    && typeof c.phone === 'string';
}

function saveToStorage(key: string, contacts: Contact[]) {
  try {
    localStorage.setItem(key, JSON.stringify(contacts));
  } catch { /* ignore quota errors */ }
}

export default function Emergency() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  usePageTitle('Emergency Contacts');

  const storageKey = user ? `${STORAGE_PREFIX}${user.id}` : STORAGE_PREFIX;
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState({ name: '', relationship: '', phone: '' });

  useEffect(() => {
    if (!user) return;
    setContacts(loadFromStorage(storageKey));
  }, [user, storageKey]);

  const persist = useCallback((next: Contact[]) => {
    setContacts(next);
    saveToStorage(storageKey, next);
  }, [storageKey]);

  const handleAdd = () => {
    const name = form.name.trim();
    const relationship = form.relationship.trim();
    const phone = form.phone.trim();
    if (!name || !phone) {
      toast({ variant: 'destructive', title: 'Name and phone required' });
      return;
    }
    if (contacts.length >= MAX_CONTACTS) {
      toast({ variant: 'destructive', title: `Limit is ${MAX_CONTACTS} contacts` });
      return;
    }
    try {
      const id = crypto.randomUUID();
      persist([...contacts, { id, name, relationship, phone }]);
      setForm({ name: '', relationship: '', phone: '' });
      toast({ title: 'Contact added' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Could not save', description: errorMessage(err, 'Try again.') });
    }
  };

  const handleRemove = (id: string) => {
    persist(contacts.filter(c => c.id !== id));
    toast({ title: 'Contact removed' });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center gap-3 max-w-2xl mx-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            <h1 className="text-base font-bold">Emergency Contacts</h1>
          </div>
          <UserMenu />
        </div>
      </div>

      <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">
        <Card className="p-4 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10">
          <div className="flex items-start gap-3">
            <Siren className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold mb-1">In a real emergency, call your local emergency number.</p>
              <p className="text-xs text-muted-foreground">
                This list is a personal reminder of who to reach — Womanie does not place calls or notify them on your behalf. It's stored on this device.
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-sm font-semibold mb-3">Your contacts</p>
          {contacts.length === 0 ? (
            <p className="text-xs text-muted-foreground">None saved yet. Add the people you'd want to call first.</p>
          ) : (
            <ul className="space-y-2">
              {contacts.map(c => (
                <li key={c.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Phone className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {c.relationship ? `${c.relationship} · ` : ''}
                      <a href={`tel:${c.phone}`} className="hover:text-primary hover:underline">{c.phone}</a>
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleRemove(c.id)}
                    aria-label={`Remove ${c.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {contacts.length < MAX_CONTACTS && (
          <Card className="p-4">
            <p className="text-sm font-semibold mb-3">Add a contact</p>
            <div className="space-y-3">
              <div>
                <Label htmlFor="contact-name" className="text-xs">Name</Label>
                <Input
                  id="contact-name"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Mom"
                  maxLength={60}
                />
              </div>
              <div>
                <Label htmlFor="contact-rel" className="text-xs">Relationship (optional)</Label>
                <Input
                  id="contact-rel"
                  value={form.relationship}
                  onChange={(e) => setForm(f => ({ ...f, relationship: e.target.value }))}
                  placeholder="e.g. Mother, Partner, OB/GYN"
                  maxLength={40}
                />
              </div>
              <div>
                <Label htmlFor="contact-phone" className="text-xs">Phone</Label>
                <Input
                  id="contact-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+1 555 123 4567"
                  maxLength={30}
                />
              </div>
              <Button onClick={handleAdd} className="w-full gap-1.5">
                <Plus className="h-4 w-4" />
                Save contact
              </Button>
            </div>
          </Card>
        )}

        <Card className="p-4 border-dashed">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Contacts live in this device's storage and don't sync to other devices. Clear your browser data and the list goes with it. When Womanie ships device-sync we'll migrate automatically.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
