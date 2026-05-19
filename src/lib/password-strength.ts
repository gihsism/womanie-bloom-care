// Heuristic password-strength scorer used by signup and change-password
// surfaces. Not a security control — the server still enforces the
// 8-char floor. The signal is for the user, so they don't pick
// something they'll later regret.

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4 | 5;
  label: string;
  color: string; // Tailwind bg-* class for the bar fill
  hint: string;
}

export function scorePassword(password: string): PasswordStrength {
  if (!password) return { score: 0, label: '', color: '', hint: '' };
  if (password.length < 8) {
    const need = 8 - password.length;
    return {
      score: 1,
      label: 'Too short',
      color: 'bg-destructive',
      hint: `${need} more character${need === 1 ? '' : 's'} needed.`,
    };
  }
  const classes =
    (/[a-z]/.test(password) ? 1 : 0) +
    (/[A-Z]/.test(password) ? 1 : 0) +
    (/\d/.test(password) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(password) ? 1 : 0);
  if (password.length >= 14 && classes >= 4) {
    return { score: 5, label: 'Strong', color: 'bg-emerald-500', hint: 'Great password.' };
  }
  if (password.length >= 12 && classes >= 3) {
    return {
      score: 4,
      label: 'Good',
      color: 'bg-green-500',
      hint: 'Solid — a symbol would push it to strong.',
    };
  }
  if (classes >= 2) {
    return {
      score: 3,
      label: 'Fair',
      color: 'bg-yellow-500',
      hint: 'Add more length or a symbol to strengthen it.',
    };
  }
  return {
    score: 2,
    label: 'Weak',
    color: 'bg-orange-500',
    hint: 'Mix uppercase, digits, or a symbol to strengthen.',
  };
}
