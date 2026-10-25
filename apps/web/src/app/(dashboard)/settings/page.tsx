'use client';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth.context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { ThemeToggle } from '@/components/theme-toggle';
import { Table, TBody, TD, TR } from '@/components/ui/table';

export default function SettingsPage() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <PageHeader title="Settings" description="Your account, the colour theme, and a few tools that are not on the main menu." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TBody>
              <TR>
                <TD className="text-muted-foreground">Name</TD>
                <TD data-testid="user-name">{user?.name ?? '—'}</TD>
              </TR>
              <TR>
                <TD className="text-muted-foreground">Email</TD>
                <TD data-testid="user-email">{user?.email ?? '—'}</TD>
              </TR>
              <TR>
                <TD className="text-muted-foreground">GitHub</TD>
                <TD>{user?.githubLogin ? `@${user.githubLogin}` : 'Not connected'}</TD>
              </TR>
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Light is the default. Dark mode stays on this browser.</p>
          <ThemeToggle />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">More</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li><Link className="text-primary" href="/ai">Assistant</Link></li>
            <li><Link className="text-primary" href="/system-health">System health</Link></li>
            <li><Link className="text-primary" href="/planning">Ideas</Link></li>
            <li><Link className="text-primary" href="/dashboard/team">Skills</Link></li>
            <li><Link className="text-primary" href="/setup">Continue setup</Link></li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
