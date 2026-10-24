import type { Metadata } from 'next';
import { GestureTrial } from '@/components/trial/GestureTrial';

export const metadata: Metadata = {
  title: 'Gesture trial — Still Here',
  description: 'Engineering trial recorder for eyebrow Next and long-blink Select. Not clinical validation.',
};

export default function TrialPage() {
  return <GestureTrial />;
}
