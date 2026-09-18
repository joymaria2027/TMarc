export function validateAuthField(
  field: 'email' | 'password' | 'fullName',
  value: string,
  mode: 'signin' | 'signup' = 'signin',
): string | null {
  const v = (value ?? '').trim();
  if (field === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address.';
    return null;
  }
  if (field === 'fullName') {
    if (mode === 'signup' && v.length < 2) return 'Enter your full name.';
    return null;
  }
  if (mode === 'signup' && v.length < 6) return 'Password must be at least 6 characters.';
  if (!v) return 'Enter your password.';
  return null;
}

export function getEmailAutocomplete(): string {
  return 'email';
}

export function getPasswordAutocomplete(mode: 'signin' | 'signup'): string {
  return mode === 'signup' ? 'new-password' : 'current-password';
}
