'use client';

import { useRouter } from 'next/navigation';
import { LeafMark } from '@/components/auth/LeafMark';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-[11px] font-mono font-semibold uppercase tracking-[2px] text-[var(--nl-color-ink-disabled)] pt-2 border-t border-[var(--nl-border-subtle)]">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Rule({ heading, body }: { heading: string; body: string }) {
  return (
    <div>
      <p className="text-[13px] font-sans font-medium text-[var(--nl-color-ink-primary)] mb-0.5">{heading}</p>
      <p className="text-[13px] font-sans text-[var(--nl-color-ink-tertiary)] leading-relaxed">{body}</p>
    </div>
  );
}

export default function TermsPage() {
  const router  = useRouter();
  const updated = 'May 28, 2026';

  return (
    <div className="min-h-screen bg-[var(--nl-color-paper-bg)]">

      <div className="bg-[var(--nl-sidebar-bg)] px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/')}
          aria-label="Back to Noteleaf"
          className="w-9 h-9 flex items-center justify-center rounded-[10px] text-[var(--nl-sidebar-text-muted)] hover:text-[var(--nl-sidebar-text)] hover:bg-white/10 transition-colors shrink-0"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <LeafMark size={28} />
        <span className="font-serif text-[16px] font-bold tracking-tight text-[var(--nl-sidebar-text)] flex-1">
          Terms &amp; Privacy
        </span>
        <span className="text-[11px] font-mono text-[var(--nl-sidebar-text-muted)] hidden sm:inline">
          Last updated {updated}
        </span>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-12 space-y-10">

        <div>
          <h1 className="font-serif text-[26px] font-medium text-[var(--nl-color-ink-primary)] mb-2">
            Terms &amp; Privacy
          </h1>
          <p className="text-[13px] font-sans text-[var(--nl-color-ink-tertiary)] leading-relaxed">
            Your notes are private. Audio stays on this device. Nothing is sold.
          </p>
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
            body="Your sessions stay until you delete them or close your account. In Settings you can auto-delete after 7, 30, or 90 days, or keep them forever. Expired sessions are removed when you open Noteleaf and once a day on the server."
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

        <div className="pt-6 border-t border-[var(--nl-border-subtle)]">
          <p className="text-[11px] font-mono text-[var(--nl-color-ink-disabled)]">
            Noteleaf · Be fully present and focus on the conversation.
          </p>
        </div>
      </div>
    </div>
  );
}
