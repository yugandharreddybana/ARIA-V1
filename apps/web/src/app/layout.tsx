import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/auth.context';

export const metadata: Metadata = {
  title: 'ARIA — AI Engineering Platform',
  description: 'ARIA turns a repository into a small software company you can direct.',
};

const themeScript = `(function(){try{if(localStorage.getItem('aria-theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
