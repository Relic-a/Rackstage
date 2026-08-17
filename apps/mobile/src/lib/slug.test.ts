import { describe, expect, it } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it('creates a clean editable store slug', () => {
    expect(slugify('  Café & Co. Vintage! ')).toBe('cafe-co-vintage');
  });

  it('caps very long suggestions for a compact public URL', () => {
    expect(slugify('a'.repeat(80)).length).toBe(48);
  });
});
