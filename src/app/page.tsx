'use client';

import { useStillHere } from '@/runtime/useStillHere';
import { StillHereApp } from '@/components/StillHereApp';

export default function Page() {
  const runtime = useStillHere();
  return <StillHereApp runtime={runtime} />;
}
