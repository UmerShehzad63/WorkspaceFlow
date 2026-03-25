'use client';
import { usePathname } from 'next/navigation';
import styles from './GlobalHeader.module.css';
import { useCommand } from '../command-context';
import { usePlan, isPro } from '../plan-context';

export default function GlobalHeader() {
  const pathname = usePathname();
  const { cmdText, setCmdText, isExecuting, runGlobalCommand } = useCommand();
  const { plan, openUpgrade } = usePlan();

  // Hide on the Command Bar page — it has its own full input
  if (pathname === '/dashboard/commands') return null;

  const execute = () => {
    const cmd = cmdText.trim();
    if (!cmd || isExecuting) return;
    if (!isPro(plan)) { openUpgrade(); return; }
    setCmdText('');
    runGlobalCommand(cmd);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') execute();
  };

  return (
    <div className={styles.headerBar}>
      <div className={styles.commandWrap}>
        <div className={styles.inputRow}>
          <span className={styles.prefix} style={{ color: 'var(--color-secondary)' }}>⚡</span>
          <input
            className={styles.input}
            placeholder="Run a command… e.g. 'Find emails from Sarah'"
            value={cmdText}
            onChange={(e) => setCmdText(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <span className={isExecuting ? styles.spinner : styles.spinnerIdle} />
          <button
            className={styles.execBtn}
            onClick={execute}
            disabled={isExecuting || !cmdText.trim()}
          >
            Execute
          </button>
        </div>
      </div>

      <div className={styles.hint}>
        <span className={styles.kbd}>↵</span> to run &nbsp;·&nbsp;
        <span className={styles.kbd}>Esc</span> to dismiss
      </div>
    </div>
  );
}
