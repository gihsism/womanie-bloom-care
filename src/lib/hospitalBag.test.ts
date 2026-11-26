import { describe, it, expect } from 'vitest';
import {
  addCustomItem, bagProgress, clearPacked, DEFAULT_BAG_ITEMS, EMPTY_BAG, parseBagState, removeItem,
  restoreDefaults, toggleItem, visibleItems,
} from './hospitalBag';

describe('hospital bag state', () => {
  it('reads the legacy array of packed ids', () => {
    const s = parseBagState('["mom-id","baby-car-seat"]');
    expect(s.packed).toEqual(['mom-id', 'baby-car-seat']);
    expect(bagProgress(s).packed).toBe(2);
  });

  it('reads v2 and drops malformed custom items', () => {
    const s = parseBagState({ v: 2, packed: ['x'], hidden: ['partner-swimwear'], custom: [
      { id: 'c1', label: 'Gymnastics ball', section: 'you' },
      { id: 'c2', label: 'bad', section: 'nowhere' },
      'junk',
    ] });
    expect(s.custom).toEqual([{ id: 'c1', label: 'Gymnastics ball', section: 'you' }]);
    expect(visibleItems(s).some(i => i.id === 'partner-swimwear')).toBe(false);
  });

  it('survives junk', () => {
    expect(parseBagState('{not json')).toEqual(EMPTY_BAG);
    expect(parseBagState(null)).toEqual(EMPTY_BAG);
    expect(parseBagState(42)).toEqual(EMPTY_BAG);
  });

  it('has the Swiss documents', () => {
    const labels = DEFAULT_BAG_ITEMS.map(i => i.label).join(' | ');
    expect(labels).toMatch(/Krankenkassenkarte/);
    expect(labels).toMatch(/Familienbüchlein/);
    expect(labels).toMatch(/Babyschale/);
  });

  it('default ids are unique', () => {
    const ids = DEFAULT_BAG_ITEMS.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('toggle, add, remove, restore, progress', () => {
    let s = toggleItem(EMPTY_BAG, 'mom-id');
    expect(s.packed).toEqual(['mom-id']);
    s = toggleItem(s, 'mom-id');
    expect(s.packed).toEqual([]);

    s = addCustomItem(s, 'baby', '  Dummy / pacifier  ', 'c1');
    expect(s.custom).toEqual([{ id: 'c1', label: 'Dummy / pacifier', section: 'baby' }]);
    expect(addCustomItem(s, 'baby', '   ', 'c2')).toBe(s);
    const total = DEFAULT_BAG_ITEMS.length + 1;
    expect(bagProgress(s).total).toBe(total);

    s = toggleItem(s, 'c1');
    s = toggleItem(s, 'mom-glasses');
    s = removeItem(s, 'mom-glasses'); // default -> hidden, unticked
    expect(s.hidden).toEqual(['mom-glasses']);
    expect(s.packed).toEqual(['c1']);
    expect(bagProgress(s)).toEqual({ packed: 1, total: total - 1, percent: Math.round(100 / (total - 1)) });

    s = removeItem(s, 'c1'); // own item -> deleted
    expect(s.custom).toEqual([]);
    expect(s.packed).toEqual([]);

    s = restoreDefaults(s);
    expect(s.hidden).toEqual([]);
    expect(clearPacked(toggleItem(s, 'mom-id')).packed).toEqual([]);
  });

  it('packed ids that are no longer on the list do not count', () => {
    expect(bagProgress(parseBagState(['mom-snacks-old-id'])).packed).toBe(0);
  });
});
