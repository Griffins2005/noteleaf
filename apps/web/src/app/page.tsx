// Root page. Auth runs first; the notepad chunk loads in parallel so `/`
// does not ship recording, chat, and notes JS on the first paint.

import type { Metadata } from 'next';
import { HomeApp } from './HomeApp';

export const metadata: Metadata = {
  title: 'Noteleaf',
  description: 'Be fully present and focus on the conversation. Ambient AI notetaker — capture notes from any meeting on your device. No bot required.',
};

export default function HomePage() {
  return <HomeApp />;
}
