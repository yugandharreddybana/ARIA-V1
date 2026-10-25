const KEY = 'aria-project';

export function rememberProject(id: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, id);
}

export function rememberedProject(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(KEY);
}
