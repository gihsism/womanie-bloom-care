import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { usePrompt } from './PromptDialog';

function Harness({ onResult }: { onResult: (text: string | null) => void }) {
  const [ask, dialog] = usePrompt();
  return (
    <>
      <button onClick={async () => onResult(await ask({
        title: 'Rename document', label: 'Document name', defaultValue: 'Blood test.pdf', confirmLabel: 'Rename',
      }))}>
        Open
      </button>
      {dialog}
    </>
  );
}

describe('usePrompt', () => {
  it('starts with the current name and resolves the new one', async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    fireEvent.click(screen.getByText('Open'));
    const field = await screen.findByLabelText('Document name');
    expect(field).toHaveValue('Blood test.pdf');
    fireEvent.change(field, { target: { value: '  Iron panel March  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith('Iron panel March'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('Enter in the field saves', async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    fireEvent.click(screen.getByText('Open'));
    const field = await screen.findByLabelText('Document name');
    fireEvent.change(field, { target: { value: 'Scan' } });
    fireEvent.submit(field.closest('form')!);
    await waitFor(() => expect(onResult).toHaveBeenCalledWith('Scan'));
  });

  it('cannot save an empty name, and Cancel resolves null', async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    fireEvent.click(screen.getByText('Open'));
    fireEvent.change(await screen.findByLabelText('Document name'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(null));
  });

  it('Escape resolves null', async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    fireEvent.click(screen.getByText('Open'));
    fireEvent.keyDown(await screen.findByRole('alertdialog'), { key: 'Escape' });
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(null));
  });
});

describe('no browser prompt(), alert() or confirm() in the app', () => {
  // Installed iOS web apps can suppress all three. A method of another
  // object (the install event's `deferredPrompt.prompt()`) is fine, and so
  // is `await confirm(...)` from useConfirm (the browser one is not async).
  const BROWSER_PROMPT = /(\b(window|globalThis|self)\.(prompt|alert|confirm)\s*\()|((^|[^.\w])(prompt|alert)\s*\()|((^|[^.\w])(?<!await )confirm\s*\()/m;
  // Comments may mention the words ("a gentle weekly mood prompt (...)").
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(p);
    }
  };
  walk('src');

  it('the scan catches what it should', () => {
    expect(BROWSER_PROMPT.test("const n = window.prompt('Rename', x);")).toBe(true);
    expect(BROWSER_PROMPT.test("alert('Saved');")).toBe(true);
    expect(BROWSER_PROMPT.test("if (confirm('Sure?')) go();")).toBe(true);
    expect(BROWSER_PROMPT.test('await deferredPrompt.prompt();')).toBe(false);
    expect(BROWSER_PROMPT.test('if (!(await confirm(stopMedicineConfirm(m.name)))) return;')).toBe(false);
  });

  it('no source file calls them', () => {
    expect(files.filter(f => BROWSER_PROMPT.test(code(readFileSync(f, 'utf8'))))).toEqual([]);
  });

  it('document rename uses the in-app dialog', () => {
    const src = readFileSync('src/pages/MedicalHistory.tsx', 'utf8');
    expect(src).toMatch(/usePrompt\(\)/);
    expect(src).toMatch(/\{promptDialog\}/);
  });
});
