import { useState } from 'react';
import { Globe2 } from 'lucide-react';
import { UploadPanel } from './components/UploadPanel';
import { JobDashboard } from './components/JobDashboard';
import type { JobInfo } from './types';

export default function App() {
  const [job, setJob] = useState<JobInfo | null>(null);

  return (
    <div className="app-bg min-h-screen">
      <header className="border-b border-white/5 bg-black/20 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-fuchsia-500 shadow-lg">
            <Globe2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">PayPal Commerce Scanner</h1>
            <p className="text-xs text-white/50">Server-side bulk domain analyzer</p>
          </div>
        </div>
      </header>

      <main className="mx-auto h-[calc(100vh-64px)] max-w-7xl px-6 py-6">
        {job ? (
          <JobDashboard job={job} onClose={() => setJob(null)} />
        ) : (
          <div className="mx-auto max-w-2xl">
            <UploadPanel onJobCreated={setJob} />
            <div className="mt-6 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
              <Feature title="No CORS issues" body="All requests run server-side via the Node.js backend." />
              <Feature title="Built for scale" body="Streaming file I/O handles millions of domains without loading them in memory." />
              <Feature title="Live updates" body="Server-Sent Events show stats and PayPal hits in real time." />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs text-white/60">{body}</div>
    </div>
  );
}
