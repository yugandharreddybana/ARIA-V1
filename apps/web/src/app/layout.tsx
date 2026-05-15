import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/contexts/auth.context';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'ARIA — AI Engineering Organization', template: '%s | ARIA' },
  description: 'Autonomous Repository Intelligence Agent. A local-first AI engineering team that works with your codebase.',
  keywords: ['AI', 'engineering', 'automation', 'codebase', 'agents'],
  authors: [{ name: 'ARIA' }],
  robots: 'noindex, nofollow',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased min-h-screen bg-background`}>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
