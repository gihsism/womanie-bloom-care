import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Input } from './input';

const noop = () => {};

describe('Input: empty date fields', () => {
  it('marks an empty date field and gives it a "not set" placeholder', () => {
    const { container } = render(<Input type="date" value="" onChange={noop} />);
    const el = container.querySelector('input')!;
    expect(el.getAttribute('data-empty')).toBe('true');
    expect(el.getAttribute('placeholder')).toMatch(/not set/i);
    expect(el.value).toBe('');
  });

  it('keeps a caller placeholder', () => {
    const { container } = render(<Input type="date" value="" placeholder="Due date" onChange={noop} />);
    expect(container.querySelector('input')!.getAttribute('placeholder')).toBe('Due date');
  });

  it('leaves a filled date and other inputs alone', () => {
    const { container } = render(
      <>
        <Input type="date" value="2026-01-02" onChange={noop} />
        <Input type="text" value="" onChange={noop} />
      </>,
    );
    const [date, text] = Array.from(container.querySelectorAll('input'));
    expect(date.hasAttribute('data-empty')).toBe(false);
    expect(date.value).toBe('2026-01-02');
    expect(text.hasAttribute('data-empty')).toBe(false);
    expect(text.hasAttribute('placeholder')).toBe(false);
  });
});
