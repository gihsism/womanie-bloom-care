import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import SubPageHeader from '@/components/SubPageHeader';
import {
  Phone,
  Trash2,
} from 'lucide-react';
import { errorMessage } from '@/lib/errors';
import { pushAccountData, useAccountDataVersion } from '@/lib/account-data';

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
  const { user } = useAuth();
  const { toast } = useToast();
  usePageTitle('Emergency Contacts');

  const storageKey = user ? `${STORAGE_PREFIX}${user.id}` : STORAGE_PREFIX;
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState({ name: '', relationship: '', phone: '' });

  const accountVersion = useAccountDataVersion([user ? storageKey : null]);
  useEffect(() => {
    if (!user) return;
    setContacts(loadFromStorage(storageKey));
  }, [user, storageKey, accountVersion]);

  const persist = useCallback((next: Contact[]) => {
    setContacts(next);
    saveToStorage(storageKey, next);
    pushAccountData(user?.id, storageKey);
  }, [storageKey, user?.id]);

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
      <SubPageHeader title="Emergency contacts" backTo="/dashboard/settings" backLabel="Me" />

      <div className="px-4 py-5 max-w-2xl mx-auto space-y-6">
        <p className="page-intro">
          <span className="font-semibold text-foreground">In an emergency, call your local emergency number.</span>{' '}
          This list reminds you who to call next. Womanie never calls anyone for you. Saved to your account, so it is on a new phone too.
        </p>

        {contacts.length === 0 ? (
          <p className="text-[15px] text-muted-foreground">No contacts yet. Add the people you would call first.</p>
        ) : (
          <ul className="row-group">
            {contacts.map(c => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <a href={`tel:${c.phone}`} className="flex min-w-0 flex-1 items-center gap-3" aria-label={`Call ${c.name}`}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stage-tint text-stage-accent">
                    <Phone className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[16px] font-semibold">{c.name}</span>
                    <span className="block truncate text-[14px] text-muted-foreground">
                      {c.relationship ? `${c.relationship} · ` : ''}{c.phone}
                    </span>
                  </span>
                </a>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemove(c.id)}
                  aria-label={`Remove ${c.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {contacts.length < MAX_CONTACTS && (
          <section className="space-y-3">
            <h2 className="section-title">Add a contact</h2>
            <div className="panel p-4">
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
              <button type="button" onClick={handleAdd} className="btn-stage w-full">
                Save contact
              </button>
            </div>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
