'use client';
import { useAuth } from '@/contexts/auth.context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Settings } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="h-5 w-5 text-aria-400" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your ARIA account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-sm text-muted-foreground">Name</span>
            <span className="text-sm font-medium">{user?.name ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-sm text-muted-foreground">Email</span>
            <span className="text-sm font-medium">{user?.email ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-muted-foreground">GitHub</span>
            <span className="text-sm font-medium">{user?.githubLogin ? `@${user.githubLogin}` : 'Not connected'}</span>
          </div>
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>Workspace configuration — full settings coming in Sprint 5</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Ollama endpoint, token budgets, risk defaults, and team configuration will be configurable here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
