'use client';

import { useEffect, useRef, useState } from 'react';
import type { StillHereRuntime } from '@/runtime/contract';
import { BLINK_STATUS_LABELS } from './labels';
import { feedbackTone } from './GestureFeedback';

/**
 * Small mirrored live self-view for the top-right corner (iPad landscape). The <video> element
 * is mounted once and kept for the component's lifetime; hiding the preview only collapses the
 * frame with CSS (visibility/size), so the element and stream are never torn down by a toggle
 * or a rerender. Mirroring is CSS on the video only: landmark coordinates and command semantics are
 * untouched. This is live video only. Nothing is recorded, saved or uploaded.
 *
 * The hide/show toggle is a plain button (touch / helper), never a registry target, so it can
 * never take a scan or gesture step.
 */
export function CameraPreview({ runtime }: { runtime: StillHereRuntime }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(true);
  const { blink } = runtime;
  const attachPreview = blink.attachPreview;

  // Attach once on mount, detach on unmount. Hiding never detaches or unmounts the <video>
  // (WebKit GPU-process instability was tied to remounting it while the camera is on).
  useEffect(() => {
    attachPreview(ref.current);
    return () => attachPreview(null);
  }, [attachPreview]);

  const cameraOn = !['off', 'unsupported', 'permission-denied'].includes(blink.status);
  const tone = feedbackTone(blink);
  const statusText = BLINK_STATUS_LABELS[blink.status]?.text ?? blink.status;

  return (
    <div className={`camera-preview tone-ring-${tone}${visible ? '' : ' is-hidden'}`}>
      <div className="camera-preview-meta">
        <p className="camera-preview-caption">Live preview — not recorded</p>
        <button
          type="button"
          className="btn btn-small btn-quiet camera-preview-toggle"
          aria-pressed={!visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? 'Hide preview' : 'Show preview'}
        </button>
      </div>
      <div className="camera-preview-frame" aria-hidden={!visible || undefined}>
        <video
          ref={ref}
          className="camera-preview-video"
          muted
          playsInline
          autoPlay
          aria-label="Live camera self-view, mirrored. Not recorded."
        />
        {!cameraOn && <span className="camera-preview-off">{statusText}</span>}
      </div>
    </div>
  );
}
