'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './commands.module.css';
import ResultDisplay from '../components/ResultDisplay';
import EmailSendPreviewModal from '../components/EmailSendPreviewModal';
import CalendarCreatePreviewModal from '../components/CalendarCreatePreviewModal';
import { useCommand } from '../command-context';
import { usePlan, isPro } from '../plan-context';

const EXAMPLES = [
  'Find the proposal Aisha sent me last month',
  'Email everyone in tomorrow\'s budget meeting saying the deck is ready',
  'What did Mark say about the website redesign?',
  'Create a meeting with Sarah for next Tuesday at 2pm',
  'Show me all invoices from the last 30 days',
  'Archive all newsletters older than a week',
];

const SERVICE_ICONS = { Gmail: '📧', Calendar: '📅', Drive: '📁' };

// ─── Main page ─────────────────────────────────────────────────────────────

export default function CommandsPage() {
  // Sync command text with global context so "Try:" chips work from either bar
  const { cmdText: command, setCmdText: setCommand } = useCommand();
  const { plan, openUpgrade } = usePlan();

  const [resultState,    setResultState]    = useState(null); // { intent, result } | { error } | null
  const [isExecuting,    setIsExecuting]    = useState(false);
  const [history,        setHistory]        = useState([]);
  const [pendingCommand,  setPendingCommand]  = useState(null); // { command, overrides }
  const [emailPreview,    setEmailPreview]    = useState(null); // { intent, commandText, overrides }
  const [calendarPreview, setCalendarPreview] = useState(null); // { intent, commandText, overrides }

  // skipPreview=true bypasses the preview step (used when confirming from modal)
  const runCommand = async (commandText, overrides = {}, skipPreview = false) => {
    setIsExecuting(true);
    setResultState(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${backendUrl}/api/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          command: commandText,
          overrides,
          preview_only: !skipPreview,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Command failed (HTTP ${response.status})`);
      }

      const data = await response.json();

      // Backend wants us to show a preview before executing
      if (data.preview_only) {
        if (data.intent?.service?.toLowerCase() === 'calendar') {
          setCalendarPreview({ intent: data.intent, commandText, overrides });
        } else {
          setEmailPreview({ intent: data.intent, commandText, overrides });
        }
        return;
      }

      if (data.needs_disambiguation) {
        setPendingCommand({ command: commandText, overrides });
        setResultState({ intent: data.intent, result: data.result });
        return;
      }

      setResultState({ intent: data.intent, result: data.result });
      setHistory(prev => [{
        command: commandText,
        service: data.intent?.service || 'Unknown',
        time: 'Just now',
      }, ...prev].slice(0, 10));
      setPendingCommand(null);
      setCommand('');
    } catch (err) {
      setResultState({ error: err.message });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = command.trim();
    if (!trimmed) return;
    if (!isPro(plan)) { openUpgrade(); return; }
    await runCommand(trimmed);
  };

  const handleDisambiguationPick = async (extraOverrides) => {
    if (!pendingCommand) return;
    const merged = { ...pendingCommand.overrides, ...extraOverrides };
    await runCommand(pendingCommand.command, merged);
  };

  const handlePreviewSend = async ({ to, subject, body }) => {
    if (!emailPreview) return;
    const intentParams = emailPreview.intent?.parameters || {};
    const overrides = {
      ...(emailPreview.overrides || {}),
      recipient_email: to,
      subject,
      body,
      // Carry resolved Drive file_id so execution skips a second Drive search
      ...(intentParams._drive_file_id ? { file_id: intentParams._drive_file_id } : {}),
    };
    setEmailPreview(null);
    await runCommand(emailPreview.commandText, overrides, true);
  };

  const handlePreviewCancel = () => setEmailPreview(null);

  const handleCalendarConfirm = async (editedParams) => {
    if (!calendarPreview) return;
    const preview = calendarPreview;
    setCalendarPreview(null);
    const overrides = {
      ...(preview.overrides || {}),
      _cal_summary:     editedParams.summary,
      _cal_start_time:  editedParams.start_time,
      _cal_end_time:    editedParams.end_time,
      _cal_attendees:   editedParams.attendees,
      _cal_description: editedParams.description,
      _timezone:        preview.intent?.parameters?._timezone || 'UTC',
    };
    await runCommand(preview.commandText, overrides, true);
  };
  const handleCalendarCancel = () => setCalendarPreview(null);

  const handleExample = (example) => {
    setCommand(example);  // syncs to global context too
    setResultState(null);
  };

  const service    = resultState?.intent?.service;
  const action     = resultState?.intent?.action;
  const isDisambig = resultState?.result?.type === 'needs_disambiguation';
  const badgeLabel = resultState?.error ? 'Error' : (isDisambig ? 'Choose' : (resultState?.result ? 'Done' : null));
  const badgeStyle = resultState?.error
    ? { background: 'rgba(239,68,68,0.1)', color: '#ef4444' }
    : isDisambig
    ? { background: 'rgba(251,191,36,0.1)', color: '#f59e0b' }
    : { background: 'rgba(52,211,153,0.1)', color: 'var(--accent-green)' };

  return (
    <div>
      <div className="page-header">
        <h1>Command Bar</h1>
        <p>Type what you want in natural language. We&apos;ll handle the rest.</p>
      </div>

      {/* Input */}
      <div className={styles.commandSection}>
        <form onSubmit={handleSubmit} className={styles.commandForm}>
          <div className={styles.commandInputWrapper}>
            <span className={styles.commandPrefix}>⚡</span>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Type a command... e.g., 'Email Sarah that the proposal is ready'"
              className={styles.commandInput}
            />
            <button
              type="submit"
              className={`btn btn-primary ${styles.commandSubmit}`}
              disabled={isExecuting || !command.trim()}
            >
              <span className={isExecuting ? styles.spinner : styles.spinnerIdle} />
              {!isExecuting && 'Execute →'}
            </button>
          </div>
        </form>

        <div className={styles.examples}>
          <span className={styles.examplesLabel}>Try:</span>
          <div className={styles.exampleChips}>
            {EXAMPLES.slice(0, 4).map((ex, idx) => (
              <button key={idx} className={styles.chip} onClick={() => handleExample(ex)}>
                {ex.length > 45 ? ex.slice(0, 45) + '...' : ex}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Result */}
      {resultState && (
        <div className={styles.resultSection}>
          {resultState.error ? (
            <div className="card" style={{ padding: '20px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <strong style={{ color: '#ef4444' }}>⚠️ {resultState.error}</strong>
                <button className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => setResultState(null)}>Dismiss</button>
              </div>
            </div>
          ) : (
            <div className={styles.resultCard}>
              <div className={styles.resultHeader}>
                <h3>
                  {isDisambig
                    ? (resultState.result.kind === 'recipient' ? '👤 Confirm Recipient' : '📁 Select File')
                    : `${SERVICE_ICONS[service] || '⚡'} ${service}: ${action}`}
                </h3>
                <span className={styles.resultBadge} style={badgeStyle}>{badgeLabel}</span>
              </div>
              {resultState.intent?.human_description && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
                  {resultState.intent.human_description}
                </p>
              )}
              <ResultDisplay intent={resultState.intent} result={resultState.result} onDisambiguationPick={handleDisambiguationPick} />
              <div className={styles.resultActions}>
                <button className="btn btn-ghost" onClick={() => setResultState(null)}>Dismiss</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* History */}
      <div className={styles.historySection}>
        <h3 className={styles.historyTitle}>Recent Commands</h3>
        <div className={styles.historyList}>
          {history.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '8px 12px' }}>
              No commands run yet this session.
            </div>
          ) : (
            history.map((item, idx) => (
              <div key={idx} className={styles.historyItem}>
                <div className={styles.historyIcon}>✓</div>
                <div className={styles.historyContent}>
                  <span className={styles.historyCommand}>{item.command}</span>
                  <span className={styles.historyTime}>{item.time}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Supported Actions */}
      <div className={styles.actionsGrid}>
        <h3 className={styles.actionsTitle}>Supported Actions</h3>
        <div className={styles.actionCards}>
          <div className={styles.actionCard}>
            <h4>📧 Gmail</h4>
            <ul>
              <li>Search &amp; fetch emails</li>
              <li>Send &amp; reply</li>
              <li>Archive by sender/subject</li>
            </ul>
          </div>
          <div className={styles.actionCard}>
            <h4>📅 Calendar</h4>
            <ul>
              <li>Search upcoming events</li>
              <li>Create meetings</li>
              <li>Add attendees</li>
            </ul>
          </div>
          <div className={styles.actionCard}>
            <h4>📁 Drive</h4>
            <ul>
              <li>Search files &amp; docs</li>
              <li>Find by name or content</li>
              <li>Open file links</li>
            </ul>
          </div>
        </div>
      </div>

      {emailPreview && (
        <EmailSendPreviewModal
          intent={emailPreview.intent}
          onSend={handlePreviewSend}
          onCancel={handlePreviewCancel}
        />
      )}

      {calendarPreview && (
        <CalendarCreatePreviewModal
          intent={calendarPreview.intent}
          onConfirm={handleCalendarConfirm}
          onCancel={handleCalendarCancel}
        />
      )}
    </div>
  );
}
