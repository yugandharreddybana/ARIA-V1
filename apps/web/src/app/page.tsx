import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  BrainCircuit, GitBranch, Shield, Zap,
  BarChart3, Users, ArrowRight, CheckCircle2
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-6 w-6 text-aria-500" />
            <span className="font-bold text-lg tracking-tight">ARIA</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/signup">
              <Button variant="aria" size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative bg-grid py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background pointer-events-none" />
        <div className="container relative text-center max-w-4xl mx-auto animate-fade-in">
          <div className="inline-flex items-center gap-2 rounded-full border border-aria-800/60 bg-aria-950/40 px-4 py-1.5 text-xs text-aria-400 mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-aria-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-aria-500" />
            </span>
            Local-first · Ollama-powered · Your codebase, your team
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent">
            Your AI Engineering
            <br />
            <span className="text-aria-400">Organization</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            ARIA gives you a full AI engineering team — Product, Engineering, QA, Security, DevOps —
            that works with your GitHub repos following real Agile processes.
            Planning, sprints, evidence-based tickets, reviews, retros. All local.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/signup">
              <Button variant="aria" size="xl" className="gap-2 animate-pulse-glow">
                Get Started <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="xl">Sign In</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 border-t border-border/50">
        <div className="container max-w-5xl">
          <h2 className="text-3xl font-bold text-center mb-4">How ARIA Works</h2>
          <p className="text-muted-foreground text-center mb-16 max-w-xl mx-auto">
            Three steps from zero to a fully operational AI engineering team.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                icon: <GitBranch className="h-6 w-6 text-aria-400" />,
                title: 'Connect Your Repos',
                desc: 'Link your GitHub repos to a project. ARIA analyses your codebase, maps domains, and builds a Concept Graph.',
              },
              {
                step: '02',
                icon: <Users className="h-6 w-6 text-aria-400" />,
                title: 'Build Your AI Team',
                desc: 'ARIA proposes a full org: engineers, QA, security, DevOps, product. You approve, customise, and commit.',
              },
              {
                step: '03',
                icon: <Zap className="h-6 w-6 text-aria-400" />,
                title: 'Start a Session',
                desc: 'Hit Start. Your team bootstraps, runs a scrum, picks tickets, and begins working — all evidence-first.',
              },
            ].map(({ step, icon, title, desc }) => (
              <div key={step} className="relative rounded-lg border border-border bg-card p-6 hover:border-aria-800 transition-colors group">
                <div className="text-xs font-mono text-aria-600 mb-4">{step}</div>
                <div className="mb-3">{icon}</div>
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 border-t border-border/50 bg-card/30">
        <div className="container max-w-5xl">
          <h2 className="text-3xl font-bold text-center mb-16">Built for Real Engineering</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { icon: <Shield className="h-5 w-5 text-aria-400" />, title: 'Evidence-First Bugs', desc: 'No ticket without proof. Screenshots, logs, repro steps, environment — all required before dev starts.' },
              { icon: <CheckCircle2 className="h-5 w-5 text-aria-400" />, title: 'Human Approval Gates', desc: 'Class C/D changes always need your sign-off. ARIA never deploys to production autonomously.' },
              { icon: <BarChart3 className="h-5 w-5 text-aria-400" />, title: 'Real Agile Ceremonies', desc: 'Daily scrums, sprint planning, reviews, retros — your AI team runs them all with structured output.' },
              { icon: <BrainCircuit className="h-5 w-5 text-aria-400" />, title: 'Local-First, Private', desc: 'Runs entirely on your machine with Ollama. Your code never leaves your environment.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="flex gap-4 p-5 rounded-lg border border-border bg-card hover:border-aria-800 transition-colors">
                <div className="mt-0.5 flex-shrink-0">{icon}</div>
                <div>
                  <h4 className="font-medium mb-1">{title}</h4>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 border-t border-border/50 text-center">
        <div className="container max-w-2xl">
          <h2 className="text-3xl font-bold mb-4">Ready to start building?</h2>
          <p className="text-muted-foreground mb-8">Set up your workspace in minutes. No cloud required.</p>
          <Link href="/signup">
            <Button variant="aria" size="xl" className="gap-2">
              Create Your Workspace <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="container flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-aria-600" />
            <span>ARIA v0.1.0</span>
          </div>
          <span>Local-first. Private. Yours.</span>
        </div>
      </footer>
    </div>
  );
}
