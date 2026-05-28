import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SignInPage } from '@/components/auth/SignInPage';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to Noteleaf to access your notes.',
};

export default function AuthPage() {
  return (
    <Suspense>
      <SignInPage />
    </Suspense>
  );
}
