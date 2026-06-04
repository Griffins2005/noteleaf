'use client';

import { useRouter } from 'next/navigation';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-[11px] font-mono font-semibold uppercase tracking-[2px] text-[#64748b] pt-2 border-t border-[#e2e8f0]">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Rule({ heading, body }: { heading: string; body: string }) {
  return (
    <div>
      <p className="text-[13px] font-medium text-[#0f172a] mb-0.5">{heading}</p>
      <p className="text-[13px] text-[#475569] leading-relaxed">{body}</p>
    </div>
  );
}

export default function TermsPage() {
  const router  = useRouter();
  const updated = 'May 28, 2026';

  return (
    <div className="min-h-screen bg-[#f8fafc]" style={{ fontFamily: 'var(--nl-font-mono, "DM Mono", monospace)' }}>

      <div className="bg-[#0f172a] px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="w-9 h-9 flex items-center justify-center rounded-[10px] text-[#94a3b8] hover:text-[#f8fafc] hover:bg-white/10 transition-colors shrink-0"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="text-[15px] font-semibold tracking-tight text-[#f8fafc] flex-1">Terms &amp; Privacy</span>
        <span className="text-[11px] text-[#94a3b8]">Last updated {updated}</span>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-12 space-y-10">

        <div>
          <h1 className="text-[22px] font-bold text-[#0f172a] mb-2">Terms &amp; Privacy</h1>
        </div>

        <Section title="Terms of Service">
          <Rule
            heading="What Noteleaf is"
            body="Noteleaf listens while you speak and turns it into notes and summaries. Everything you capture is yours."
          />
          <Rule
            heading="Your account"
            body="Keep your sign-in details safe. You can delete your account anytime from Settings and everything goes with it."
          />
          <Rule
            heading="Acceptable use"
            body="Don't use Noteleaf for anything illegal, don't abuse the service or try to reverse-engineer it. We can suspend accounts that break these rules."
          />
          <Rule
            heading="No warranty"
            body="Noteleaf is provided as-is. We can't promise it'll always be up, and the notes it generates aren't always perfect. Check before you act on them."
          />
          <Rule
            heading="Changes"
            body="We might update these terms. The date at the top tells you when. Continued use means you're fine with the changes."
          />
        </Section>

        <Section title="Privacy Policy">
          <Rule
            heading="What we collect"
            body="Your email, the notes and transcripts from your sessions, and any summaries you generate. Your audio never leaves your browser."
          />
          <Rule
            heading="What we never do"
            body="We don't sell your data or share it with anyone. Your notes exist for you, not for us."
          />
          <Rule
            heading="Third parties"
            body="We use cloud services to store your data and run the summaries. They only touch your data to make the service work, nothing else."
          />
          <Rule
            heading="Retention"
            body="Your sessions stay until you delete them or close your account. You can set auto-delete after 30 days in Settings."
          />
          <Rule
            heading="Your rights"
            body="Export any session using the Export button. Delete sessions one by one or wipe everything from Settings. Email us if you want a full copy of your data."
          />
          <Rule
            heading="Security"
            body="Everything is encrypted over TLS. We don't use passwords, just email codes and Google sign-in, so there's nothing to steal."
          />
          <Rule
            heading="Cookies"
            body="We store one auth token in your browser. No tracking cookies, no analytics."
          />
        </Section>

        <div className="pt-6 border-t border-[#e2e8f0]">
          <p className="text-[11px] text-[#94a3b8]">Noteleaf · Capture. Understand. Grow.</p>
        </div>
      </div>
    </div>
  );
}
