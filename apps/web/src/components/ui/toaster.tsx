'use client';
import * as React from 'react';
import * as ToastPrimitives from '@radix-ui/react-toast';
import { cn } from '@/lib/utils';

export function Toaster() {
  return (
    <ToastPrimitives.Provider swipeDirection="right">
      <ToastPrimitives.Viewport className="fixed bottom-4 right-4 z-[100] flex max-h-screen w-full max-w-[380px] flex-col gap-2" />
    </ToastPrimitives.Provider>
  );
}

export function useToast() {
  const [toasts, setToasts] = React.useState<Array<{ id: string; title: string; description?: string; variant?: 'default' | 'destructive' }>>([]);

  const toast = React.useCallback(({ title, description, variant = 'default' }: { title: string; description?: string; variant?: 'default' | 'destructive' }) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, title, description, variant }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  return { toast, toasts };
}
