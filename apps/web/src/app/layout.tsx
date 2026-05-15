import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/auth.context';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ARIA — AI Engineering Platform',
  description: 'AI-powered software engineering platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
