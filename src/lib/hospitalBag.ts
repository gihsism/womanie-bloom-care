// Hospital bag checklist: default list (Swiss context) + editable state.
// Pure functions; the card stores the state under the account-synced key
// womanie_hospital_bag_{uid} (see account-data.ts).
//
// Stored shape v2: { v: 2, packed: string[], hidden: string[], custom: [...] }.
// Older versions stored a bare array of packed ids; parseBagState reads
// both, so nothing she already ticked is lost.

export type BagSectionId = 'docs' | 'you' | 'baby' | 'partner';

export interface BagItem {
  id: string;
  label: string;
  hint?: string;
  section: BagSectionId;
  custom?: boolean;
}

export interface BagSection {
  id: BagSectionId;
  title: string;
  description: string;
}

export const BAG_SECTIONS: BagSection[] = [
  { id: 'docs', title: 'Documents', description: 'What the hospital or birth centre asks for at admission.' },
  { id: 'you', title: 'For you', description: 'Labour and the first days after.' },
  { id: 'baby', title: 'For baby', description: 'Hospitals provide nappies and clothes during the stay; this is for going home.' },
  { id: 'partner', title: 'For your birth partner', description: 'Whoever stays with you through labour.' },
];

// Ids of items carried over from the first (US-style) list are kept so
// earlier ticks still count.
export const DEFAULT_BAG_ITEMS: BagItem[] = [
  // Documents (Switzerland)
  { id: 'mom-id', section: 'docs', label: 'Health insurance card (Krankenkassenkarte) and ID or passport', hint: 'Residence permit too, if you have one' },
  { id: 'docs-familienbuechlein', section: 'docs', label: 'Familienbüchlein (family booklet), if married', hint: 'The hospital passes the birth to the civil registry office (Zivilstandsamt)' },
  { id: 'docs-civil-status', section: 'docs', label: 'If not married: birth certificates and the paternity acknowledgement (Kindesanerkennung)', hint: 'Ask your Zivilstandsamt which papers they need; recognising the child before the birth saves time' },
  { id: 'docs-records', section: 'docs', label: 'Pregnancy record (Mutterpass / Schwangerschaftspass) and ultrasound reports' },
  { id: 'docs-blood-group', section: 'docs', label: 'Blood group card and recent lab results' },
  { id: 'docs-registration', section: 'docs', label: 'Hospital or birth-centre registration confirmation (Geburtsanmeldung)' },
  { id: 'mom-birth-plan', section: 'docs', label: 'Birth plan / wishes, if you have one', hint: 'A copy for the midwife' },
  { id: 'docs-meds', section: 'docs', label: 'List of your medicines and allergies' },
  { id: 'docs-emergency', section: 'docs', label: 'Emergency contacts on paper', hint: 'In case your phone dies' },

  // For you
  { id: 'you-labour-clothes', section: 'you', label: 'Long T-shirt or nightie for labour' },
  { id: 'you-nightwear', section: 'you', label: 'Front-opening pyjamas or nightwear', hint: 'Easier for skin-to-skin and breastfeeding' },
  { id: 'mom-robe', section: 'you', label: 'Dressing gown or cardigan' },
  { id: 'mom-slippers', section: 'you', label: 'Slippers and warm socks' },
  { id: 'mom-nursing-bra', section: 'you', label: 'Nursing bras (2), no underwire' },
  { id: 'you-underwear', section: 'you', label: 'High-waisted or disposable underwear', hint: 'Comfortable over a caesarean scar too' },
  { id: 'mom-pads', section: 'you', label: 'Maternity pads', hint: 'Hospitals usually provide some; bring a pack for the way home' },
  { id: 'mom-toiletries', section: 'you', label: 'Toiletries, hair ties, lip balm' },
  { id: 'mom-glasses', section: 'you', label: 'Glasses / contact-lens case' },
  { id: 'mom-phone-charger', section: 'you', label: 'Phone and a long charging cable' },
  { id: 'you-snacks', section: 'you', label: 'Snacks and drinks for labour', hint: 'Ask your hospital what they allow' },
  { id: 'you-music', section: 'you', label: 'Headphones, music, anything that helps you relax' },
  { id: 'mom-going-home', section: 'you', label: 'Loose, comfortable clothes for going home' },

  // For baby
  { id: 'baby-going-home', section: 'baby', label: 'Going-home outfit in size 50 and 56', hint: 'Bodysuit, sleepsuit, socks; bring both sizes' },
  { id: 'baby-hat', section: 'baby', label: 'Soft hat' },
  { id: 'baby-blanket', section: 'baby', label: 'Blanket, or a warm overall in winter' },
  { id: 'baby-car-seat', section: 'baby', label: 'Infant car seat (Babyschale), fitted in the car', hint: 'Needed for any car or taxi ride home' },

  // For your birth partner
  { id: 'partner-change', section: 'partner', label: 'Change of clothes', hint: 'Labour can be long' },
  { id: 'partner-snacks', section: 'partner', label: 'Snacks and a water bottle' },
  { id: 'partner-cash', section: 'partner', label: 'Coins or TWINT for parking and vending machines' },
  { id: 'partner-swimwear', section: 'partner', label: 'Swimwear, if you plan a water birth' },
];

export interface CustomBagItem {
  id: string;
  label: string;
  section: BagSectionId;
}

export interface BagState {
  v: 2;
  packed: string[];
  hidden: string[];
  custom: CustomBagItem[];
}

export const EMPTY_BAG: BagState = { v: 2, packed: [], hidden: [], custom: [] };

const SECTION_IDS = new Set<BagSectionId>(BAG_SECTIONS.map(s => s.id));
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Reads the stored value: v2 object, legacy array of packed ids, or junk. */
export function parseBagState(raw: unknown): BagState {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return { ...EMPTY_BAG }; }
  }
  if (Array.isArray(value)) return { ...EMPTY_BAG, packed: strings(value) };
  if (!value || typeof value !== 'object') return { ...EMPTY_BAG };
  const o = value as Record<string, unknown>;
  const custom = Array.isArray(o.custom)
    ? (o.custom as unknown[]).flatMap(c => {
        if (!c || typeof c !== 'object') return [];
        const r = c as Record<string, unknown>;
        if (typeof r.id !== 'string' || typeof r.label !== 'string' || !SECTION_IDS.has(r.section as BagSectionId)) return [];
        return [{ id: r.id, label: r.label, section: r.section as BagSectionId }];
      })
    : [];
  return { v: 2, packed: strings(o.packed), hidden: strings(o.hidden), custom };
}

/** The items she sees: defaults she has not removed, then her own. */
export function visibleItems(state: BagState): BagItem[] {
  const hidden = new Set(state.hidden);
  return [
    ...DEFAULT_BAG_ITEMS.filter(i => !hidden.has(i.id)),
    ...state.custom.map(c => ({ ...c, custom: true })),
  ];
}

export function toggleItem(state: BagState, id: string): BagState {
  const packed = state.packed.includes(id) ? state.packed.filter(p => p !== id) : [...state.packed, id];
  return { ...state, packed };
}

export function addCustomItem(state: BagState, section: BagSectionId, label: string, id: string): BagState {
  const clean = label.trim().slice(0, 120);
  if (!clean) return state;
  return { ...state, custom: [...state.custom, { id, label: clean, section }] };
}

/** Removes an item: her own ones are deleted, default ones are hidden. */
export function removeItem(state: BagState, id: string): BagState {
  const packed = state.packed.filter(p => p !== id);
  if (state.custom.some(c => c.id === id)) {
    return { ...state, packed, custom: state.custom.filter(c => c.id !== id) };
  }
  if (!DEFAULT_BAG_ITEMS.some(d => d.id === id) || state.hidden.includes(id)) return { ...state, packed };
  return { ...state, packed, hidden: [...state.hidden, id] };
}

/** Brings back the default items she removed (keeps her own items). */
export function restoreDefaults(state: BagState): BagState {
  return { ...state, hidden: [] };
}

export function clearPacked(state: BagState): BagState {
  return { ...state, packed: [] };
}

export function bagProgress(state: BagState): { packed: number; total: number; percent: number } {
  const items = visibleItems(state);
  const packedSet = new Set(state.packed);
  const packed = items.filter(i => packedSet.has(i.id)).length;
  const total = items.length;
  return { packed, total, percent: total ? Math.round((packed / total) * 100) : 0 };
}
