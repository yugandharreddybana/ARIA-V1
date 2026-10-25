import Link from 'next/link';
import { Button } from '@/components/ui/button';

const STEPS = [
  { title: 'Connect your repository', body: 'ARIA reads the code and writes down how the product works.' },
  { title: 'Build the company', body: 'You get a small team with names, roles, and owners for each flow. Turn anyone off.' },
  { title: 'Work from the board', body: 'Stories move through review and QA. You approve every merge.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="text-sm font-semibold">ARIA</span>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-3xl px-4 py-20 text-center md:py-28">
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            Your AI Engineering
            <span className="block text-primary">company</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
            ARIA turns one GitHub repository into a software company that plans, writes, tests, and waits for you to merge.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup">
              <Button size="lg">Get Started</Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg">Sign in</Button>
            </Link>
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto max-w-5xl px-4 py-16">
            <h2 className="text-center text-2xl font-semibold">How ARIA Works</h2>
            <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted-foreground">
              Sign up, point ARIA at a repository, then edit the company it proposes.
            </p>
            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="rounded-lg border bg-card p-5">
                  <p className="text-xs font-medium text-muted-foreground">0{index + 1}</p>
                  <h3 className="mt-2 font-medium">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="border-t py-6">
        <p className="mx-auto max-w-5xl px-4 text-sm text-muted-foreground">ARIA runs on your machine. You approve every merge.</p>
      </footer>
    </div>
  );
}
