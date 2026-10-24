'use client';
import { PROTOCOL, type StepSummary, type summarize } from './trial-session';
import styles from './trial.module.css';

type Summary = ReturnType<typeof summarize>;

const fmt = (n: number | null) => (n === null ? '—' : String(n));

function special(s: StepSummary): string {
  if (s.exactlyOneNext !== null) return `${s.exactlyOneNext}/${s.promptsRun} exactly one Next`;
  if (s.pausedAndResumed !== null) return `${s.pausedAndResumed}/${s.promptsRun} paused + blink-resumed; ${s.blockedWhilePaused} Next blocked`;
  if (s.groups) return Object.entries(s.groups).map(([g, v]) => `${g}: ${v.commandsAccepted}`).join(' · ') || '—';
  return '—';
}

export function TrialResults({ summary }: { summary: Summary }) {
  const t = summary.totals;
  return (
    <section className={styles.card} aria-label="Results">
      <h2 className={styles.h2}>Results</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Step</th>
              <th scope="col">Status</th>
              <th scope="col">Run / planned</th>
              <th scope="col">Hits</th>
              <th scope="col">Missed</th>
              <th scope="col">Inadvertent Next</th>
              <th scope="col">Extra Next (hold)</th>
              <th scope="col">Inadvertent Select</th>
              <th scope="col">Wrong target</th>
              <th scope="col">Face-loss pauses</th>
              <th scope="col">Latency ms (median)</th>
              <th scope="col">Closure ms (min/med/max)</th>
              <th scope="col">Step check</th>
            </tr>
          </thead>
          <tbody>
            {summary.steps.map((s) => (
              <tr key={s.id}>
                <th scope="row">{s.id} — {PROTOCOL.find((p) => p.id === s.id)?.title}</th>
                <td>{s.status}</td>
                <td>{s.promptsRun}/{s.promptsPlanned}</td>
                <td>{s.hits}</td>
                <td className={s.missed ? styles.bad : ''}>{s.missed}{s.facilitatorMarkedMisses ? ` (${s.facilitatorMarkedMisses} marked)` : ''}</td>
                <td className={s.inadvertentNext ? styles.bad : ''}>{s.inadvertentNext}</td>
                <td className={s.extraNextDuringHold ? styles.bad : ''}>{s.extraNextDuringHold}</td>
                <td className={s.inadvertentSelect + s.extraSelect ? styles.bad : ''}>{s.inadvertentSelect + s.extraSelect}</td>
                <td className={s.wrongTargetSelections ? styles.bad : ''}>
                  {s.wrongTargetSelections}{s.wrongTargetSelections ? ` (${s.wrongTargetAuto} auto, ${s.wrongTargetMarked} marked)` : ''}
                </td>
                <td>{s.faceLossPauses}</td>
                <td>{fmt(s.latencyMs.median)}</td>
                <td>{s.closureMs.n ? `${s.closureMs.min}/${s.closureMs.median}/${s.closureMs.max}` : '—'}</td>
                <td>{special(s)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={4}>Totals</th>
              <td>{t.missedCommands}</td>
              <td>{t.inadvertentNextWrongKindOrUnprompted}</td>
              <td>{t.extraNextDuringHold}</td>
              <td>{t.inadvertentSelect}</td>
              <td>{t.wrongTargetSelections}</td>
              <td>{t.faceLossPauses}</td>
              <td colSpan={3}>All inadvertent Next: {t.inadvertentNext} · Next blocked while paused: {t.nextBlockedWhilePaused}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
