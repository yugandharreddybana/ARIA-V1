'use client';

import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface State { error: Error | null }

export class PageErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6" role="alert">
          <h2 className="text-lg font-semibold">This page hit an error</h2>
          <p className="mt-2 text-sm text-muted-foreground">A live update could not be shown. The rest of the app is still available.</p>
          <Button className="mt-4" type="button" onClick={() => this.setState({ error: null })}>Try again</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
