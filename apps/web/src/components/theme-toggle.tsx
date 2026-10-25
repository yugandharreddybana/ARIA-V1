'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type Theme = 'light' | 'dark';

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('aria-theme', theme);
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  function choose(next: Theme) {
    applyTheme(next);
    setTheme(next);
  }

  if (compact) {
    const next = theme === 'dark' ? 'light' : 'dark';
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => choose(next)} aria-pressed={theme === 'dark'}>
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </Button>
    );
  }

  return (
    <div className="flex gap-2" role="group" aria-label="Colour theme">
      <Button type="button" variant={theme === 'light' ? 'default' : 'outline'} onClick={() => choose('light')} aria-pressed={theme === 'light'}>
        Light
      </Button>
      <Button type="button" variant={theme === 'dark' ? 'default' : 'outline'} onClick={() => choose('dark')} aria-pressed={theme === 'dark'}>
        Dark
      </Button>
    </div>
  );
}
