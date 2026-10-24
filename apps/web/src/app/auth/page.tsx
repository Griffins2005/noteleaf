import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SignInPage } from '@/components/auth/SignInPage';

export const metadata: Metadata = {
  title: 'Sign in',
  description:
    'Be fully present and focus on the conversation. Sign in to Noteleaf — audio is sent to be transcribed and is not kept as a recording. No bot joins your meeting.',
};

export default function AuthPage() {
  return (
    <Suspense>
      <SignInPage />
    </Suspense>
  );
}
