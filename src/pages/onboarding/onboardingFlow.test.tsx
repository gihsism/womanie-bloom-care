import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { OnboardingProvider } from '@/contexts/OnboardingContext';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, loading: false }) }));
const commit = vi.fn(async () => {});
vi.mock('@/lib/onboarding-commit', async (orig) => ({ ...(await orig<typeof import('@/lib/onboarding-commit')>()), commitOnboarding: (...a: unknown[]) => commit(...(a as [])) }));

import LifeStageSelection from './LifeStageSelection';
import ModeSetup from './ModeSetup';
import BasicInformation from './BasicInformation';
import OnboardingSuccess from './OnboardingSuccess';

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname + l.search}</output>;
}

const renderFlow = (at = '/onboarding/life-stage') => render(
  <OnboardingProvider>
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/onboarding/life-stage" element={<LifeStageSelection />} />
        <Route path="/onboarding/mode-setup" element={<ModeSetup />} />
        <Route path="/onboarding/basic-info" element={<BasicInformation />} />
        <Route path="/onboarding/success" element={<OnboardingSuccess />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </MemoryRouter>
  </OnboardingProvider>,
);

const saved = () => JSON.parse(localStorage.getItem('womanie-onboarding') || '{}');
const cont = () => screen.getByRole('button', { name: 'Continue' });

describe('first run: five screens, one question each', () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-stage'); commit.mockClear(); });

  it('the stage picker shows each stage in its own colour and turns the screen into the picked one', () => {
    renderFlow();
    expect(screen.getByRole('progressbar', { name: 'Step 1 of 5' })).toBeInTheDocument();
    const choices = screen.getAllByRole('radio');
    expect(choices.map((c) => c.getAttribute('data-stage'))).toEqual(['pre-menstrual', 'menstrual-cycle', 'conception', 'pregnancy', 'postpartum', 'menopause']);
    // Plain names from lifeStageLabels.
    expect(screen.getByRole('radio', { name: /After birth/ })).toBeInTheDocument();
    expect(cont()).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /Pregnancy/ }));
    expect(screen.getByRole('radio', { name: /Pregnancy/ })).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.getAttribute('data-stage')).toBe('pregnancy');
    fireEvent.click(cont());
    expect(saved().lifeStage.stage).toBe('pregnant'); // the saved value is unchanged
    expect(screen.getByTestId('where')).toHaveTextContent('/onboarding/mode-setup');
    expect(screen.getByRole('progressbar', { name: 'Step 2 of 5' })).toBeInTheDocument();
  });

  it('Period tracking: last period, then the focus that decides the stage, then About you, then Done', () => {
    renderFlow();
    fireEvent.click(screen.getByRole('radio', { name: /Period tracking/ }));
    fireEvent.click(cont());
    expect(screen.getByRole('heading', { name: 'When did your last period start?' })).toBeInTheDocument();
    expect(cont()).toBeDisabled(); // a date is still required
  });

  it('a reload on screen 3 keeps the screen 2 answers (saved when moving on)', () => {
    localStorage.setItem('womanie-onboarding', JSON.stringify({
      basicInfo: { height: 0, heightUnit: 'cm', weight: 0, weightUnit: 'kg', bloodType: '' },
      lifeStage: { stage: 'regular-cycle' },
      regularCycle: { lastPeriodStart: new Date(2026, 10, 1).toISOString(), averageCycleLength: 30, mainFocus: '' },
      currentStep: 3,
    }));
    renderFlow('/onboarding/mode-setup?q=2');
    expect(screen.getByRole('heading', { name: 'What matters most right now?' })).toBeInTheDocument();
    expect(cont()).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /Birth control/ }));
    expect(document.documentElement.getAttribute('data-stage')).toBe('contraception');
    fireEvent.click(cont());
    expect(saved().regularCycle).toMatchObject({ averageCycleLength: 30, mainFocus: 'contraception' });
    expect(screen.getByTestId('where')).toHaveTextContent('/onboarding/basic-info');
    expect(screen.getByRole('progressbar', { name: 'Step 4 of 5' })).toBeInTheDocument();
    // About you is skippable, as before.
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/onboarding/success');
    expect(screen.getByRole('progressbar', { name: 'Step 5 of 5' })).toBeInTheDocument();
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('screen 3 opened without the screen 2 answer shows screen 2 instead', () => {
    localStorage.setItem('womanie-onboarding', JSON.stringify({
      basicInfo: { height: 0, heightUnit: 'cm', weight: 0, weightUnit: 'kg', bloodType: '' },
      lifeStage: { stage: 'postpartum' },
      currentStep: 3,
    }));
    renderFlow('/onboarding/mode-setup?q=2');
    expect(screen.getByRole('heading', { name: 'When was your baby born?' })).toBeInTheDocument();
  });

  it('pregnancy keeps the old rules: week 1 to 42, and first-pregnancy is required', () => {
    renderFlow();
    fireEvent.click(screen.getByRole('radio', { name: /Pregnancy/ }));
    fireEvent.click(cont());
    fireEvent.click(screen.getByRole('radio', { name: 'Current week' }));
    const week = screen.getByLabelText(/Week of pregnancy/);
    fireEvent.change(week, { target: { value: '43' } });
    expect(cont()).toBeDisabled();
    fireEvent.change(week, { target: { value: '24' } });
    fireEvent.click(cont());
    expect(screen.getByRole('heading', { name: 'Is this your first pregnancy?' })).toBeInTheDocument();
    expect(cont()).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'No' }));
    fireEvent.click(cont());
    expect(saved().pregnancy).toMatchObject({ dateType: 'currentWeek', currentWeek: 24, firstPregnancy: false });
  });

  it('no stage yet: the stage questions send you to the stage picker', () => {
    renderFlow('/onboarding/mode-setup');
    expect(screen.getByTestId('where')).toHaveTextContent('/onboarding/life-stage');
  });
});
