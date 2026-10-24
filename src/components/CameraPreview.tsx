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
 * never take a scan or gesture step. Its label names the action it will take ("Hide preview" /
 * "Show preview"), so it deliberately has no aria-pressed (a changing label plus a pressed state
 * would contradict each other).
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

  // Keep the self-view live. iPadOS can pause this <video> when the app plays audio (the voice)
  // even though the hidden detection video keeps running, so the preview froze while gestures
  // still worked. Resume on pause, and if frames stop advancing, re-attach the same stream.
  useEffect(() => {
    const el = ref.current;
    if (!el || !cameraOn) return;
    const resume = () => { void el.play().catch(() => {}); };
    el.addEventListener('pause', resume);
    let lastTime = -1;
    let stuck = 0;
    const timer = setInterval(() => {
      if (!el.srcObject) return;
      if (el.paused) resume();
      if (el.currentTime === lastTime) {
        stuck += 1;
        if (stuck >= 2) {
          const stream = el.srcObject;
          el.srcObject = null;
          el.srcObject = stream;
          resume();
          stuck = 0;
        }
      } else {
        stuck = 0;
      }
      lastTime = el.currentTime;
    }, 1000);
    return () => {
      el.removeEventListener('pause', resume);
      clearInterval(timer);
    };
  }, [cameraOn]);
  const tone = feedbackTone(blink);
  const statusText = BLINK_STATUS_LABELS[blink.status]?.text ?? blink.status;

  return (
    <div className={`camera-preview tone-ring-${tone}${visible ? '' : ' is-hidden'}`}>
      <div className="camera-preview-meta">
        <p className="camera-preview-caption">Live preview · not recorded</p>
        <button
          type="button"
          className="btn btn-small btn-quiet camera-preview-toggle"
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
