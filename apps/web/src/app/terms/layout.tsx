import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms & Privacy',
  description:
    'Terms of service and privacy policy for Noteleaf. Your notes are private and never sold. Audio stays on your device.',
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
