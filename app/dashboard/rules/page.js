'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './rules.module.css';

// ─── Template definitions ──────────────────────────────────────────────────

const TEMPLATE_CATEGORIES = [
  {
    id: 'gmail',
    label: 'Gmail',
    icon: '📧',
    templates: [
      {
        id: 'gmail-auto-label',
        name: 'Auto-label emails by sender, keyword, or domain',
        desc: 'Apply a Gmail label to every email matching a sender, keyword, or domain',
        icon: '🏷️',
        fields: [
          { key: 'match_by', label: 'Match by', type: 'select', options: ['Sender', 'Keyword', 'Domain'] },
          { key: 'match_value', label: 'Value to match', type: 'text', placeholder: 'e.g. newsletter@company.com' },
          { key: 'label_name', label: 'Label to apply', type: 'text', placeholder: 'e.g. Newsletters' },
        ],
        summary: (f) => `Applies the label "${f.label_name || '…'}" to all emails where ${(f.match_by || 'sender').toLowerCase()} matches "${f.match_value || '…'}".`,
        schedule: 'On new email',
      },
      {
        id: 'gmail-archive-newsletters',
        name: 'Auto-archive newsletters older than X days',
        desc: 'Archive newsletter emails automatically on a daily schedule',
        icon: '📰',
        fields: [
          { key: 'days', label: 'Archive newsletters older than (days)', type: 'number', placeholder: '3' },
          { key: 'run_time', label: 'Run daily at', type: 'time', placeholder: '07:00' },
        ],
        summary: (f) => `Runs every day at ${f.run_time || '07:00'} and archives all newsletter emails older than ${f.days || 'X'} days.`,
        schedule: (f) => `Daily at ${f.run_time || '07:00'}`,
      },
      {
        id: 'gmail-ooo',
        name: 'Auto-reply when out of office',
        desc: 'Send an automated reply to all incoming emails while you\'re away',
        icon: '🏖️',
        fields: [
          { key: 'reply_message', label: 'Auto-reply message', type: 'textarea', placeholder: 'I\'m currently out of office and will reply when I return.' },
          { key: 'until_date', label: 'Active until date (YYYY-MM-DD)', type: 'text', placeholder: 'e.g. 2026-04-15' },
        ],
        summary: (f) => `Sends an automatic reply to all incoming emails until ${f.until_date || '…'}.`,
        schedule: 'On new email',
      },
      {
        id: 'gmail-forward-keyword',
        name: 'Forward emails matching a keyword',
        desc: 'Auto-forward any email containing a keyword to another email address',
        icon: '↗️',
        fields: [
          { key: 'keyword', label: 'Keyword to match (in subject or body)', type: 'text', placeholder: 'e.g. urgent' },
          { key: 'forward_to', label: 'Forward to email address', type: 'email', placeholder: 'teammate@company.com' },
        ],
        summary: (f) => `Forwards every email containing "${f.keyword || '…'}" to ${f.forward_to || '…'}.`,
        schedule: 'On new email',
      },
      {
        id: 'gmail-followup',
        name: 'Send follow-up reminder if no reply after X days',
        desc: 'Remind yourself to follow up when a sent email receives no reply',
        icon: '🔔',
        fields: [
          { key: 'days', label: 'Follow up after (days with no reply)', type: 'number', placeholder: '3' },
          { key: 'label', label: 'Apply to emails with label (optional)', type: 'text', placeholder: 'e.g. Awaiting Reply' },
        ],
        summary: (f) => `Sends you a follow-up reminder ${f.days || 'X'} days after an email with no reply${f.label ? ` (label: "${f.label}")` : ''}.`,
        schedule: 'Daily check',
      },
      {
        id: 'gmail-vip-flag',
        name: 'Flag emails from VIP contacts instantly',
        desc: 'Immediately star or label emails from your most important contacts',
        icon: '⭐',
        fields: [
          { key: 'sender', label: 'VIP sender email or domain', type: 'text', placeholder: 'boss@company.com or @company.com' },
          { key: 'action', label: 'Action to take', type: 'select', options: ['Star it', 'Label as VIP', 'Mark as important'] },
        ],
        summary: (f) => `When an email arrives from "${f.sender || '…'}", ${(f.action || 'stars it').toLowerCase()}.`,
        schedule: 'On new email',
      },
      {
        id: 'gmail-receipts',
        name: 'Auto-move receipts and invoices to a label',
        desc: 'Automatically sort receipt and invoice emails into a dedicated label',
        icon: '🧾',
        fields: [
          { key: 'label_name', label: 'Destination label name', type: 'text', placeholder: 'e.g. Receipts' },
        ],
        summary: (f) => `Moves all emails matching receipt and invoice keywords into the "${f.label_name || '…'}" label.`,
        schedule: 'On new email',
      },
      {
        id: 'gmail-alert-person',
        name: 'Alert me when an email from a specific person arrives',
        desc: 'Get an immediate notification when a key contact sends you an email',
        icon: '🚨',
        fields: [
          { key: 'sender', label: 'Sender email address', type: 'email', placeholder: 'person@example.com' },
          { key: 'notify_method', label: 'How to alert', type: 'select', options: ['Mark as important', 'Star + Label as VIP', 'Forward to another address'] },
        ],
        summary: (f) => `When an email arrives from ${f.sender || '…'}, ${(f.notify_method || 'marks it as important').toLowerCase()}.`,
        schedule: 'On new email',
      },
      {
        id: 'gmail-daily-digest',
        name: 'Daily digest of unread important emails',
        desc: 'Send yourself a daily summary of important unread emails',
        icon: '📋',
        fields: [
          { key: 'send_time', label: 'Send digest at', type: 'time', placeholder: '08:00' },
          { key: 'label', label: 'Digest emails from label (optional)', type: 'text', placeholder: 'e.g. Important' },
        ],
        summary: (f) => `Every day at ${f.send_time || '08:00'}, emails you a digest of unread${f.label ? ` "${f.label}"` : ' important'} emails.`,
        schedule: (f) => `Daily at ${f.send_time || '08:00'}`,
      },
      {
        id: 'gmail-escalate',
        name: 'Escalate urgent emails if not replied in X hours',
        desc: 'Alert or forward if an urgent email hasn\'t been replied to within a set time',
        icon: '⚡',
        fields: [
          { key: 'keyword', label: 'Urgency keyword in subject', type: 'text', placeholder: 'e.g. urgent' },
          { key: 'hours', label: 'Escalate after (hours without reply)', type: 'number', placeholder: '4' },
          { key: 'escalate_to', label: 'Escalate to email address', type: 'email', placeholder: 'manager@company.com' },
        ],
        summary: (f) => `If an email with "${f.keyword || '…'}" in the subject has no reply after ${f.hours || 'X'} hours, forwards it to ${f.escalate_to || '…'}.`,
        schedule: 'Hourly check',
      },
    ],
  },
  {
    id: 'calendar',
    label: 'Google Calendar',
    icon: '📅',
    templates: [
      {
        id: 'cal-meeting-reminder',
        name: 'Send meeting reminder to all attendees',
        desc: 'Auto-email all attendees a reminder before each meeting starts',
        icon: '⏰',
        fields: [
          { key: 'minutes_before', label: 'Send reminder (minutes before meeting)', type: 'number', placeholder: '30' },
          { key: 'message', label: 'Reminder message (optional)', type: 'textarea', placeholder: 'Reminder: we have a meeting starting soon.' },
        ],
        summary: (f) => `Emails all attendees ${f.minutes_before || '30'} minutes before each meeting with a reminder.`,
        schedule: 'Before each meeting',
      },
      {
        id: 'cal-auto-create',
        name: 'Auto-create calendar event from email invite',
        desc: 'When you receive a meeting invite by email, create a calendar event automatically',
        icon: '📬',
        fields: [
          { key: 'calendar', label: 'Add to which calendar', type: 'select', options: ['Primary', 'Work', 'Personal'] },
        ],
        summary: (f) => `When a meeting invite arrives in Gmail, automatically creates an event in your ${f.calendar || 'Primary'} calendar.`,
        schedule: 'On new email',
      },
      {
        id: 'cal-focus-time',
        name: 'Block focus time every morning automatically',
        desc: 'Create a recurring focus block in your calendar each weekday morning',
        icon: '🎯',
        fields: [
          { key: 'start_time', label: 'Focus block starts at', type: 'time', placeholder: '09:00' },
          { key: 'duration', label: 'Duration (hours)', type: 'number', placeholder: '2' },
          { key: 'event_title', label: 'Event title', type: 'text', placeholder: 'Focus Time' },
        ],
        summary: (f) => `Creates a "${f.event_title || 'Focus Time'}" block starting at ${f.start_time || '09:00'} for ${f.duration || '2'} hours every weekday.`,
        schedule: 'Daily (weekdays)',
      },
      {
        id: 'cal-no-agenda',
        name: 'Notify me if a meeting has no agenda',
        desc: 'Alert you when a meeting invite arrives without a description or agenda',
        icon: '📝',
        fields: [
          { key: 'notify_by', label: 'Notify me by', type: 'select', options: ['Email', 'Flag in calendar', 'Both'] },
        ],
        summary: (f) => `Notifies you by ${(f.notify_by || 'email').toLowerCase()} whenever a meeting is scheduled with no agenda or description.`,
        schedule: 'On new calendar event',
      },
      {
        id: 'cal-auto-decline',
        name: 'Auto-decline meetings outside working hours',
        desc: 'Automatically decline meeting invites scheduled outside your working hours',
        icon: '🚫',
        fields: [
          { key: 'work_start', label: 'Work day starts at', type: 'time', placeholder: '09:00' },
          { key: 'work_end', label: 'Work day ends at', type: 'time', placeholder: '18:00' },
          { key: 'decline_msg', label: 'Decline message', type: 'text', placeholder: 'I\'m not available outside working hours.' },
        ],
        summary: (f) => `Auto-declines any meeting outside ${f.work_start || '09:00'}–${f.work_end || '18:00'} with your custom message.`,
        schedule: 'On new calendar event',
      },
      {
        id: 'cal-form-event',
        name: 'Create event from Google Form submission',
        desc: 'When a Google Form is submitted, automatically create a calendar event',
        icon: '📋',
        fields: [
          { key: 'form_name', label: 'Google Form name', type: 'text', placeholder: 'e.g. Booking Form' },
          { key: 'calendar', label: 'Add event to calendar', type: 'select', options: ['Primary', 'Work', 'Shared team calendar'] },
        ],
        summary: (f) => `When "${f.form_name || '…'}" is submitted, creates an event in the ${f.calendar || 'Primary'} calendar.`,
        schedule: 'On Form submission',
      },
    ],
  },
  {
    id: 'drive',
    label: 'Google Drive',
    icon: '📁',
    templates: [
      {
        id: 'drive-edit-notify',
        name: 'Notify me when someone edits a shared file',
        desc: 'Get an email alert whenever a specific shared file is edited',
        icon: '✏️',
        fields: [
          { key: 'file_name', label: 'File or folder name', type: 'text', placeholder: 'e.g. Q1 Budget.xlsx' },
          { key: 'notify_email', label: 'Send alert to', type: 'email', placeholder: 'you@example.com' },
        ],
        summary: (f) => `Sends an email to ${f.notify_email || '…'} whenever "${f.file_name || '…'}" is edited.`,
        schedule: 'On file edit',
      },
      {
        id: 'drive-auto-share',
        name: 'Auto-share new files in a folder with specific people',
        desc: 'Automatically share any new file added to a folder with a set of people',
        icon: '🤝',
        fields: [
          { key: 'folder_name', label: 'Watch this folder', type: 'text', placeholder: 'e.g. Shared Projects' },
          { key: 'share_with', label: 'Share with (comma-separated emails)', type: 'text', placeholder: 'alice@co.com, bob@co.com' },
          { key: 'permission', label: 'Permission level', type: 'select', options: ['Viewer', 'Commenter', 'Editor'] },
        ],
        summary: (f) => `Any new file in "${f.folder_name || '…'}" is automatically shared with ${f.share_with || '…'} as ${(f.permission || 'Viewer').toLowerCase()}.`,
        schedule: 'On new Drive file',
      },
      {
        id: 'drive-stale-alert',
        name: 'Alert when a file hasn\'t been updated in X days',
        desc: 'Get notified when a file goes stale and hasn\'t been touched in a while',
        icon: '🕰️',
        fields: [
          { key: 'file_name', label: 'File or folder to watch', type: 'text', placeholder: 'e.g. Weekly Report.docx' },
          { key: 'days', label: 'Alert after no update for (days)', type: 'number', placeholder: '7' },
          { key: 'notify_email', label: 'Send alert to', type: 'email', placeholder: 'you@example.com' },
        ],
        summary: (f) => `Alerts ${f.notify_email || '…'} if "${f.file_name || '…'}" hasn't been updated in ${f.days || 'X'} days.`,
        schedule: 'Daily check',
      },
      {
        id: 'drive-archive',
        name: 'Move files to archive folder after X days of inactivity',
        desc: 'Keep Drive tidy by automatically archiving files not opened in a while',
        icon: '📦',
        fields: [
          { key: 'source_folder', label: 'Source folder', type: 'text', placeholder: 'e.g. Active Projects' },
          { key: 'archive_folder', label: 'Archive destination folder', type: 'text', placeholder: 'e.g. Archive' },
          { key: 'days', label: 'Move after inactivity (days)', type: 'number', placeholder: '30' },
        ],
        summary: (f) => `Files in "${f.source_folder || '…'}" not opened for ${f.days || '30'} days are moved to "${f.archive_folder || 'Archive'}".`,
        schedule: 'Weekly check',
      },
    ],
  },
  {
    id: 'sheets',
    label: 'Google Sheets',
    icon: '📊',
    templates: [
      {
        id: 'sheets-threshold',
        name: 'Send email alert when a cell value exceeds a threshold',
        desc: 'Monitor a Sheet cell and get alerted when it passes a set value',
        icon: '📈',
        fields: [
          { key: 'sheet_name', label: 'Google Sheet name', type: 'text', placeholder: 'e.g. Sales Tracker' },
          { key: 'cell', label: 'Cell reference to monitor', type: 'text', placeholder: 'e.g. B12' },
          { key: 'threshold', label: 'Alert threshold value', type: 'number', placeholder: '1000' },
          { key: 'notify_email', label: 'Send alert to', type: 'email', placeholder: 'you@example.com' },
        ],
        summary: (f) => `Sends an alert to ${f.notify_email || '…'} when cell ${f.cell || '…'} in "${f.sheet_name || '…'}" exceeds ${f.threshold || 'X'}.`,
        schedule: 'Hourly check',
      },
      {
        id: 'sheets-form-populate',
        name: 'Auto-populate sheet from Google Form responses',
        desc: 'When a Form is submitted, append the response as a new row in a Sheet',
        icon: '📝',
        fields: [
          { key: 'form_name', label: 'Google Form name', type: 'text', placeholder: 'e.g. Contact Form' },
          { key: 'sheet_name', label: 'Destination Sheet name', type: 'text', placeholder: 'e.g. Form Responses' },
        ],
        summary: (f) => `When "${f.form_name || '…'}" is submitted, appends the response as a new row in "${f.sheet_name || '…'}".`,
        schedule: 'On Form submission',
      },
      {
        id: 'sheets-report',
        name: 'Daily/weekly report emailed from sheet data',
        desc: 'Email a summary report generated from your Sheet on a recurring schedule',
        icon: '📤',
        fields: [
          { key: 'sheet_name', label: 'Source Sheet name', type: 'text', placeholder: 'e.g. Weekly Metrics' },
          { key: 'frequency', label: 'Send frequency', type: 'select', options: ['Daily', 'Weekly (Monday)', 'Weekly (Friday)'] },
          { key: 'send_time', label: 'Send at', type: 'time', placeholder: '08:00' },
          { key: 'recipients', label: 'Email recipients', type: 'text', placeholder: 'team@company.com' },
        ],
        summary: (f) => `${f.frequency || 'Daily'} at ${f.send_time || '08:00'}, emails a report from "${f.sheet_name || '…'}" to ${f.recipients || '…'}.`,
        schedule: (f) => `${f.frequency || 'Daily'} at ${f.send_time || '08:00'}`,
      },
      {
        id: 'sheets-row-update',
        name: 'Notify team when a row is updated',
        desc: 'Send an email notification whenever any row in a Sheet is edited',
        icon: '🔔',
        fields: [
          { key: 'sheet_name', label: 'Google Sheet name', type: 'text', placeholder: 'e.g. Project Tracker' },
          { key: 'notify_emails', label: 'Notify email(s)', type: 'text', placeholder: 'team@company.com' },
        ],
        summary: (f) => `Notifies ${f.notify_emails || '…'} whenever a row is updated in "${f.sheet_name || '…'}".`,
        schedule: 'On Sheet edit',
      },
    ],
  },
  {
    id: 'cross-app',
    label: 'Cross-App Workflows',
    icon: '🔗',
    templates: [
      {
        id: 'cross-email-task',
        name: 'Email → create task in Google Tasks or Sheet',
        desc: 'When a keyword email arrives, add a task row to a Sheet or Google Tasks',
        icon: '✅',
        fields: [
          { key: 'keyword', label: 'Email keyword to match', type: 'text', placeholder: 'e.g. action required' },
          { key: 'sheet_name', label: 'Google Sheet name for tasks', type: 'text', placeholder: 'e.g. Task List' },
        ],
        summary: (f) => `When an email with "${f.keyword || '…'}" arrives, appends a new task row to the "${f.sheet_name || '…'}" Sheet.`,
        schedule: 'On new email',
      },
      {
        id: 'cross-cal-prep',
        name: 'Calendar event created → send prep email to attendees',
        desc: 'When a calendar event is created, automatically send a prep email to all attendees',
        icon: '📨',
        fields: [
          { key: 'hours_before', label: 'Send prep email (hours before meeting)', type: 'number', placeholder: '24' },
          { key: 'prep_message', label: 'Prep email message', type: 'textarea', placeholder: 'Please review the agenda before our meeting.' },
        ],
        summary: (f) => `${f.hours_before || '24'} hours before each meeting, sends a prep email to all attendees.`,
        schedule: 'Before each meeting',
      },
      {
        id: 'cross-form-folder',
        name: 'Form submitted → create Drive folder for that client',
        desc: 'When a Google Form is submitted, create a named Drive folder for that client',
        icon: '📂',
        fields: [
          { key: 'form_name', label: 'Google Form name', type: 'text', placeholder: 'e.g. New Client Onboarding' },
          { key: 'parent_folder', label: 'Create folder inside', type: 'text', placeholder: 'e.g. Clients' },
        ],
        summary: (f) => `When "${f.form_name || '…'}" is submitted, creates a new client folder inside "${f.parent_folder || '…'}" on Drive.`,
        schedule: 'On Form submission',
      },
      {
        id: 'cross-external-share',
        name: 'New Drive file shared externally → alert via email',
        desc: 'Get alerted when any Drive file is shared outside your company domain',
        icon: '🔒',
        fields: [
          { key: 'company_domain', label: 'Your company domain', type: 'text', placeholder: 'e.g. company.com' },
          { key: 'notify_email', label: 'Send alert to', type: 'email', placeholder: 'admin@company.com' },
        ],
        summary: (f) => `Sends an alert to ${f.notify_email || '…'} whenever a Drive file is shared outside @${f.company_domain || '…'}.`,
        schedule: 'On Drive share',
      },
      {
        id: 'cross-invoice-pipeline',
        name: 'Invoice received in Gmail → saved to Drive + logged in Sheet',
        desc: 'When an invoice email arrives, save the attachment to Drive and log it in a Sheet',
        icon: '💰',
        fields: [
          { key: 'drive_folder', label: 'Save attachments to Drive folder', type: 'text', placeholder: 'e.g. Invoices 2026' },
          { key: 'sheet_name', label: 'Log entries in Google Sheet', type: 'text', placeholder: 'e.g. Invoice Log' },
        ],
        summary: (f) => `When an invoice email arrives, saves the attachment to "${f.drive_folder || '…'}" and logs a row in "${f.sheet_name || '…'}".`,
        schedule: 'On new email',
      },
      {
        id: 'cross-weekly-report',
        name: 'Weekly report auto-generated from Sheets and emailed',
        desc: 'Auto-generate a weekly report from Sheets data and email it to your team',
        icon: '📊',
        fields: [
          { key: 'sheet_name', label: 'Source Sheet name', type: 'text', placeholder: 'e.g. KPI Dashboard' },
          { key: 'recipients', label: 'Email recipients', type: 'text', placeholder: 'team@company.com' },
          { key: 'send_day', label: 'Send on', type: 'select', options: ['Monday', 'Friday', 'Sunday'] },
          { key: 'send_time', label: 'Send at', type: 'time', placeholder: '09:00' },
        ],
        summary: (f) => `Every ${f.send_day || 'Friday'} at ${f.send_time || '09:00'}, emails a report from "${f.sheet_name || '…'}" to ${f.recipients || '…'}.`,
        schedule: (f) => `Weekly on ${f.send_day || 'Friday'} at ${f.send_time || '09:00'}`,
      },
    ],
  },
];

// ─── Template setup / edit modal ───────────────────────────────────────────

function TemplateSetupModal({ template, onSave, onClose, initialValues = null }) {
  const isEdit = initialValues !== null;
  const [values, setValues] = useState(
    () => initialValues || Object.fromEntries(template.fields.map((f) => [f.key, '']))
  );

  const set = (key, val) => setValues((prev) => ({ ...prev, [key]: val }));

  const summary = template.summary(values);
  const schedule = typeof template.schedule === 'function'
    ? template.schedule(values)
    : template.schedule;

  const handleSave = () => {
    onSave({
      name: template.name,
      description: summary,
      schedule,
      templateId: template.id,
      fieldValues: { ...values },
    });
  };

  return (
    <div className={styles.modal} onClick={onClose}>
      <div className={styles.setupModalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.4rem' }}>{template.icon}</span>
            <div>
              <h2 style={{ fontSize: '1rem', marginBottom: '2px' }}>
                {isEdit ? 'Edit Automation' : template.name}
              </h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>{template.desc}</p>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className={styles.setupModalBody}>
          {/* Dynamic fields */}
          <div className={styles.setupFields}>
            {template.fields.map((field) => (
              <div key={field.key} className="input-group" style={{ marginBottom: 0 }}>
                <label className="input-label">{field.label}</label>
                {field.type === 'select' ? (
                  <select
                    className="input"
                    value={values[field.key]}
                    onChange={(e) => set(field.key, e.target.value)}
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                  >
                    <option value="">— select —</option>
                    {field.options.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    className={`input ${styles.ruleTextarea}`}
                    placeholder={field.placeholder}
                    value={values[field.key]}
                    onChange={(e) => set(field.key, e.target.value)}
                    rows={3}
                  />
                ) : (
                  <input
                    className="input"
                    type={field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : field.type === 'time' ? 'time' : 'text'}
                    placeholder={field.placeholder}
                    value={values[field.key]}
                    onChange={(e) => set(field.key, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Live plain-English summary */}
          <div className={styles.summaryBox}>
            <div className={styles.summaryLabel}>What this automation will do</div>
            <p className={styles.summaryText}>{summary}</p>
            <div className={styles.summarySchedule}>
              <span style={{ color: 'var(--text-muted)' }}>Schedule:</span>{' '}
              <strong style={{ color: 'var(--text-secondary)' }}>{schedule}</strong>
            </div>
          </div>

          <div className={styles.modalActions}>
            <button className="btn btn-primary" onClick={handleSave}>
              {isEdit ? 'Save Changes' : 'Save Automation'}
            </button>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Request Automation Modal ──────────────────────────────────────────────

const APPS = ['Gmail', 'Google Calendar', 'Google Drive', 'Google Sheets', 'Slack', 'Other'];

function RequestAutomationModal({ userEmail, onClose, onSuccess }) {
  const [title,      setTitle]      = useState('');
  const [desc,       setDesc]       = useState('');
  const [triggerApp, setTriggerApp] = useState('');
  const [actionApp,  setActionApp]  = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);
  const [descError,  setDescError]  = useState(false);

  const handleSubmit = async () => {
    if (!desc.trim()) {
      setDescError(true);
      return;
    }
    setDescError(false);
    setSubmitting(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/request-automation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            title:       title.trim(),
            description: desc.trim(),
            trigger_app: triggerApp,
            action_app:  actionApp,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Request failed');

      onSuccess();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.modal} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Request an Automation</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>
          {/* Requester */}
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Your Email</label>
            <input className="input" type="email" value={userEmail} readOnly
              style={{ opacity: 0.6, cursor: 'default' }} />
          </div>

          {/* Title */}
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Automation Title</label>
            <input
              className="input"
              type="text"
              placeholder="e.g. Auto-archive invoices weekly"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Description — required */}
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">
              Description <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              className={`input ${styles.ruleTextarea}`}
              placeholder="Describe what you need this automation to do…"
              value={desc}
              onChange={(e) => { setDesc(e.target.value); setDescError(false); }}
              rows={4}
              style={descError ? { borderColor: '#ef4444' } : undefined}
            />
            {descError && (
              <p style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '4px' }}>
                Description is required.
              </p>
            )}
          </div>

          {/* Trigger / Action apps */}
          <div className={styles.requestFormGrid}>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label">Trigger App (optional)</label>
              <select
                className="input"
                value={triggerApp}
                onChange={(e) => setTriggerApp(e.target.value)}
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
              >
                <option value="">— select —</option>
                {APPS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label">Action App (optional)</label>
              <select
                className="input"
                value={actionApp}
                onChange={(e) => setActionApp(e.target.value)}
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
              >
                <option value="">— select —</option>
                {APPS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: '10px 14px',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '8px',
              fontSize: '0.82rem',
              color: '#ef4444',
            }}>
              ✗ {error}
            </div>
          )}

          <div className={styles.modalActions}>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={submitting}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              {submitting && <span className={styles.spinnerSm} />}
              {submitting ? 'Sending…' : 'Submit Request'}
            </button>
            <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function AutomationsPage() {
  const [automations, setAutomations] = useState([]);
  const [activeTab, setActiveTab] = useState('automations');
  const [setupTemplate, setSetupTemplate] = useState(null);
  const [editingAutomation, setEditingAutomation] = useState(null); // {automation, template}
  const [logs, setLogs] = useState([]);
  const [testingId, setTestingId] = useState(null);
  const [testResults, setTestResults] = useState({}); // {id: {ok, message}}

  // Request Automation modal + toast
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [toast, setToast] = useState(null); // {message, error?}
  const [userPlan, setUserPlan] = useState('free');

  // Automation limits per plan
  const getAutomationLimit = (plan) => {
    if (plan === 'pro_plus') return Infinity;
    if (['pro', 'trialing', 'pro_trial'].includes(plan)) return 5;
    return 0; // free
  };

  // Load user email + plan
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) return;
      if (session.user.email) setUserEmail(session.user.email);
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', session.user.id)
        .single();
      if (profile?.plan) setUserPlan(profile.plan.toLowerCase());
    });
  }, []);

  // Auto-dismiss toast after 4 s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleSaveAutomation = (data) => {
    const limit = getAutomationLimit(userPlan);
    if (automations.length >= limit) {
      setSetupTemplate(null);
      if (limit === 0) {
        setToast({ message: 'Automations require a Pro plan. Upgrade to get started.', error: true });
      } else {
        setToast({ message: `You've reached the ${limit}-automation limit on Pro. Upgrade to Pro Plus for unlimited.`, error: true });
      }
      return;
    }
    const newAuto = {
      id: Date.now(),
      ...data,
      active: true,
      lastRun: 'Never',
      runs: 0,
      itemsProcessed: 0,
    };
    setAutomations((prev) => [newAuto, ...prev]);
    setLogs((prev) => [{ name: data.name, time: 'Just created', status: 'success', items: 0 }, ...prev]);
    setSetupTemplate(null);
    setActiveTab('automations');
  };

  const handleSaveEdit = (data) => {
    const id = editingAutomation.automation.id;
    setAutomations((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, name: data.name, description: data.description, schedule: data.schedule, templateId: data.templateId, fieldValues: data.fieldValues }
          : a
      )
    );
    setEditingAutomation(null);
  };

  const handleEdit = (auto) => {
    const allTemplates = TEMPLATE_CATEGORIES.flatMap((c) => c.templates);
    const template = allTemplates.find((t) => t.id === auto.templateId);
    if (template) setEditingAutomation({ automation: auto, template });
  };

  const testRunAutomation = async (auto) => {
    setTestingId(auto.id);
    setTestResults((prev) => ({ ...prev, [auto.id]: null }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/command`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ command: auto.description }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Test run failed');

      let msg;
      if (data.needs_disambiguation) {
        msg = 'Needs clarification — use the Command Bar to run this manually';
      } else if (data.result) {
        const r = data.result;
        if (r.emails) msg = `Found ${r.emails.length} email(s)`;
        else if (r.events) msg = `Created/found ${r.events.length} event(s)`;
        else if (r.files) msg = `Found ${r.files.length} file(s)`;
        else if (r.message_id) msg = 'Email sent successfully';
        else if (r.archived) msg = 'Email archived';
        else msg = 'Executed successfully';
      } else {
        msg = 'Executed successfully';
      }

      setTestResults((prev) => ({ ...prev, [auto.id]: { ok: true, message: msg } }));
      setAutomations((prev) =>
        prev.map((a) => a.id === auto.id ? { ...a, runs: (a.runs || 0) + 1, lastRun: 'Just now' } : a)
      );
      setLogs((prev) => [{ name: auto.name, time: 'Just now', status: 'success', items: 1 }, ...prev]);
    } catch (err) {
      setTestResults((prev) => ({ ...prev, [auto.id]: { ok: false, message: err.message } }));
      setLogs((prev) => [{ name: auto.name, time: 'Just now', status: 'partial', items: 0 }, ...prev]);
    } finally {
      setTestingId(null);
    }
  };

  const toggleActive = (id) => {
    setAutomations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, active: !a.active } : a))
    );
  };

  const deleteAutomation = (id) => {
    setAutomations((prev) => prev.filter((a) => a.id !== id));
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1>Automations</h1>
          <p>Set-and-forget automations that run on schedule.</p>
          {(() => {
            const limit = getAutomationLimit(userPlan);
            if (limit === 0) return (
              <p style={{ color: '#f59e0b', fontSize: '0.8rem', marginTop: '4px' }}>
                ⚠️ Automations require a Pro plan. <a href="/pricing" style={{ color: 'var(--accent-blue)' }}>Upgrade →</a>
              </p>
            );
            if (limit !== Infinity) return (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>
                {automations.length}/{limit} automations used
                {automations.length >= limit && (
                  <> · <a href="/pricing" style={{ color: 'var(--accent-blue)' }}>Upgrade to Pro Plus for unlimited</a></>
                )}
              </p>
            );
            return null;
          })()}
        </div>
        <button className="btn btn-primary" onClick={() => setRequestModalOpen(true)}>
          + New Automation
        </button>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'automations' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('automations')}
        >
          My Automations ({automations.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'templates' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          Templates
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'logs' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          Execution Log
        </button>
      </div>

      {/* My Automations Tab */}
      {activeTab === 'automations' && (
        <div className={styles.rulesList}>
          {automations.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🔄</div>
              <p style={{ marginBottom: '16px' }}>No automations yet. Browse Templates to get started.</p>
              <button className="btn btn-primary" onClick={() => setActiveTab('templates')}>
                Browse Templates
              </button>
            </div>
          )}
          {automations.map((auto) => (
            <div key={auto.id} className={styles.ruleCard}>
              <div className={styles.ruleHeader}>
                <div className={styles.ruleInfo}>
                  <h3 className={styles.ruleName}>{auto.name}</h3>
                  <p className={styles.ruleDesc}>{auto.description}</p>
                </div>
                <div
                  className={`toggle ${auto.active ? 'active' : ''}`}
                  onClick={() => toggleActive(auto.id)}
                  style={{ cursor: 'pointer' }}
                />
              </div>
              <div className={styles.ruleMeta}>
                <span className={styles.ruleMetaItem}>📅 {auto.schedule}</span>
                <span className={styles.ruleMetaItem}>🕐 Last: {auto.lastRun}</span>
                <span className={styles.ruleMetaItem}>🔄 {auto.runs} runs</span>
                <span className={styles.ruleMetaItem}>📦 {auto.itemsProcessed} items</span>
              </div>

              {/* Test Run result */}
              {testResults[auto.id] && (
                <div
                  style={{
                    padding: '9px 12px',
                    marginBottom: '8px',
                    borderRadius: '8px',
                    background: testResults[auto.id].ok
                      ? 'rgba(52, 211, 153, 0.08)'
                      : 'rgba(239, 68, 68, 0.08)',
                    border: `1px solid ${testResults[auto.id].ok
                      ? 'rgba(52, 211, 153, 0.2)'
                      : 'rgba(239, 68, 68, 0.2)'}`,
                    fontSize: '0.8rem',
                    color: testResults[auto.id].ok ? 'var(--accent-green)' : '#ef4444',
                  }}
                >
                  {testResults[auto.id].ok ? '✓ ' : '✗ '}
                  {testResults[auto.id].message}
                </div>
              )}

              <div className={styles.ruleActions}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleEdit(auto)}
                  disabled={!auto.templateId}
                  title={!auto.templateId ? 'No template data available for this automation' : undefined}
                >
                  Edit
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => testRunAutomation(auto)}
                  disabled={testingId === auto.id}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {testingId === auto.id ? (
                    <>
                      <span className={styles.spinnerSm} />
                      Running…
                    </>
                  ) : (
                    'Test Run'
                  )}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--accent-red)' }}
                  onClick={() => deleteAutomation(auto.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className={styles.templatesList}>
          {TEMPLATE_CATEGORIES.map((cat) => (
            <div key={cat.id} className={styles.categorySection}>
              <div className={styles.categoryHeader}>
                <span className={styles.categoryIcon}>{cat.icon}</span>
                <h3 className={styles.categoryLabel}>{cat.label}</h3>
                <span className={styles.categoryCount}>{cat.templates.length}</span>
              </div>
              <div className={styles.templatesGrid}>
                {cat.templates.map((tpl) => (
                  <div key={tpl.id} className={styles.templateCard}>
                    <div className={styles.templateIcon}>{tpl.icon}</div>
                    <h4>{tpl.name}</h4>
                    <p>{tpl.desc}</p>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%', marginTop: '12px' }}
                      onClick={() => setSetupTemplate(tpl)}
                    >
                      Use Template
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Execution Log Tab */}
      {activeTab === 'logs' && (
        <div className={styles.logsList}>
          {logs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>📋</div>
              <p>No execution history yet.</p>
            </div>
          )}
          {logs.map((log, idx) => (
            <div key={idx} className={styles.logItem}>
              <div className={`${styles.logStatus} ${styles[log.status]}`}>
                {log.status === 'success' ? '✓' : '⚠'}
              </div>
              <div className={styles.logContent}>
                <span className={styles.logRule}>{log.name}</span>
                <span className={styles.logTime}>{log.time}</span>
              </div>
              <span className={styles.logItems}>{log.items} item{log.items !== 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>
      )}

      {/* New automation modal */}
      {setupTemplate && (
        <TemplateSetupModal
          template={setupTemplate}
          onSave={handleSaveAutomation}
          onClose={() => setSetupTemplate(null)}
        />
      )}

      {/* Edit modal */}
      {editingAutomation && (
        <TemplateSetupModal
          template={editingAutomation.template}
          initialValues={editingAutomation.automation.fieldValues}
          onSave={handleSaveEdit}
          onClose={() => setEditingAutomation(null)}
        />
      )}

      {/* Request Automation modal */}
      {requestModalOpen && (
        <RequestAutomationModal
          userEmail={userEmail}
          onClose={() => setRequestModalOpen(false)}
          onSuccess={() => {
            setRequestModalOpen(false);
            setToast({ message: "Request sent! We'll notify you when your automation is ready." });
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={styles.toast} style={toast.error ? { background: 'rgba(239,68,68,0.95)', border: '1px solid rgba(239,68,68,0.3)' } : undefined}>
          <span className={styles.toastIcon}>{toast.error ? '⚠️' : '✓'}</span>
          {toast.message}
        </div>
      )}
    </div>
  );
}
