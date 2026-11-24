import { describe, it, expect } from 'vitest';
import { documentCategoryLabel } from './documentCategory';

describe('documentCategoryLabel', () => {
  it('turns stored keys into words, never "lab_results"', () => {
    expect(documentCategoryLabel('lab_results')).toBe('Lab results');
    expect(documentCategoryLabel('consultation_notes')).toBe('Doctor notes');
    expect(documentCategoryLabel('some_new_kind')).toBe('Some new kind');
    expect(documentCategoryLabel(null)).toBe('Document');
  });
});
