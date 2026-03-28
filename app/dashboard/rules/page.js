'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './rules.module.css';
import { usePlan, isPro } from '../plan-context';

const BACKEND = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

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
        summary: (f) => `Applies the label "${f.label_name || '…'}" to emails where ${(f.match_by || 'sender').toLowerCase()} matches "${f.match_value || '…'}".`,
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
        summary: (f) => `Runs every day at ${f.run_time || '07:00'} and archives newsletters older than ${f.days || 'X'} days.`,
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
        name: 'Forward emails matching keywords',
        desc: 'Auto-forward any email containing matching keywords to one or more email addresses',
        icon: '↗️',
        fields: [
          { key: 'keywords', label: 'Keywords to match (press Enter to add each)', type: 'tags', placeholder: 'e.g. urgent' },
          { key: 'forward_to', label: 'Forward to (press Enter to add each email)', type: 'tags', placeholder: 'teammate@company.com' },
        ],
        summary: (f) => {
          const kws = Array.isArray(f.keywords) ? f.keywords : (f.keywords ? [f.keywords] : []);
          const fws = Array.isArray(f.forward_to) ? f.forward_to : (f.forward_to ? [f.forward_to] : []);
          return `Forwards emails containing ${kws.length ? kws.map(k => `"${k}"`).join(' or ') : '…'} to ${fws.join(', ') || '…'}.`;
        },
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
        summary: (f) => `Sends a follow-up reminder ${f.days || 'X'} days after a sent email with no reply.`,
        schedule: 'Daily check',
      },
      {
        id: 'gmail-vip-flag',
        name: 'Flag emails from VIP contacts instantly',
        desc: 'Immediately star or mark-important emails from your most important contacts',
        icon: '⭐',
        fields: [
          { key: 'senders', label: 'VIP senders (press Enter to add each email or domain)', type: 'tags', placeholder: 'boss@company.com' },
          { key: 'action', label: 'Action to take', type: 'select', options: ['Star it', 'Label as VIP', 'Mark as important'] },
        ],
        summary: (f) => {
          const senders = Array.isArray(f.senders) ? f.senders : (f.senders ? [f.senders] : []);
          return `When email arrives from ${senders.length ? senders.join(', ') : '…'}, ${(f.action || 'marks it as important').toLowerCase()}.`;
        },
        schedule: 'On new email',
      },
      {
        id: 'gmail-receipts',
        name: 'Auto-move receipts and invoices to a label',
        desc: 'Automatically archive receipt and invoice emails',
        icon: '🧾',
        fields: [
          { key: 'label_name', label: 'Destination label name', type: 'text', placeholder: 'e.g. Receipts' },
        ],
        summary: (f) => `Archives all receipt and invoice emails${f.label_name ? ` (label: "${f.label_name}")` : ''}.`,
        schedule: 'On new email',
      },
      {
        id: 'gmail-alert-person',
        name: 'Alert me when an email from a specific person arrives',
        desc: 'Get an immediate notification when a key contact sends you an email',
        icon: '🚨',
        fields: [
          { key: 'sender', label: 'Sender email address(es)', type: 'tags', placeholder: 'person@example.com' },
          { key: 'notify_method', label: 'How to alert', type: 'select', options: ['Mark as important', 'Star + Label as VIP', 'Forward to another address'] },
        ],
        summary: (f) => {
          const senders = Array.isArray(f.sender) ? f.sender : (f.sender ? [f.sender] : []);
          return `When an email arrives from ${senders.join(', ') || '…'}, ${(f.notify_method || 'marks it as important').toLowerCase()}.`;
        },
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
          { key: 'keywords', label: 'Urgency keywords (press Enter to add each)', type: 'tags', placeholder: 'e.g. urgent' },
          { key: 'hours', label: 'Escalate after (hours without reply)', type: 'number', placeholder: '4' },
          { key: 'escalate_to', label: 'Escalate to (press Enter to add each email)', type: 'tags', placeholder: 'manager@company.com' },
        ],
        summary: (f) => {
          const kws = Array.isArray(f.keywords) ? f.keywords : (f.keywords ? [f.keywords] : []);
          const tos = Array.isArray(f.escalate_to) ? f.escalate_to : (f.escalate_to ? [f.escalate_to] : []);
          return `If email with ${kws.length ? kws.map(k => `"${k}"`).join(' or ') : '…'} has no reply after ${f.hours || 'X'} hours, forwards to ${tos.join(', ') || '…'}.`;
        },
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
        summary: (f) => `Emails all attendees ${f.minutes_before || '30'} minutes before each meeting.`,
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
        summary: (f) => `When a meeting invite arrives in Gmail, creates an event in your ${f.calendar || 'Primary'} calendar.`,
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
        summary: (f) => `Creates "${f.event_title || 'Focus Time'}" at ${f.start_time || '09:00'} for ${f.duration || '2'} hours every weekday.`,
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
        summary: (f) => `Notifies you by ${(f.notify_by || 'email').toLowerCase()} when a meeting has no agenda.`,
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
        summary: (f) => `Auto-declines meetings outside ${f.work_start || '09:00'}–${f.work_end || '18:00'}.`,
        schedule: 'On new calendar event',
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
          { key: 'notify_email', label: 'Send alert to', type: 'tags', placeholder: 'you@example.com' },
        ],
        summary: (f) => {
          const tos = Array.isArray(f.notify_email) ? f.notify_email : (f.notify_email ? [f.notify_email] : []);
          return `Sends an email to ${tos.join(', ') || '…'} whenever "${f.file_name || '…'}" is edited.`;
        },
        schedule: 'On file edit',
      },
      {
        id: 'drive-auto-share',
        name: 'Auto-share new files in a folder with specific people',
        desc: 'Automatically share any new file added to a folder with a set of people',
        icon: '🤝',
        fields: [
          { key: 'folder_name', label: 'Watch this folder', type: 'text', placeholder: 'e.g. Shared Projects' },
          { key: 'share_with', label: 'Share with (press Enter to add each email)', type: 'tags', placeholder: 'alice@co.com' },
          { key: 'permission', label: 'Permission level', type: 'select', options: ['Viewer', 'Commenter', 'Editor'] },
        ],
        summary: (f) => {
          const tos = Array.isArray(f.share_with) ? f.share_with : (f.share_with ? [f.share_with] : []);
          return `New files in "${f.folder_name || '…'}" shared with ${tos.join(', ') || '…'} as ${(f.permission || 'Viewer').toLowerCase()}.`;
        },
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
          { key: 'notify_email', label: 'Send alert to (press Enter to add)', type: 'tags', placeholder: 'you@example.com' },
        ],
        summary: (f) => {
          const tos = Array.isArray(f.notify_email) ? f.notify_email : (f.notify_email ? [f.notify_email] : []);
          return `Alerts ${tos.join(', ') || '…'} if "${f.file_name || '…'}" hasn't been updated in ${f.days || 'X'} days.`;
        },
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
        summary: (f) => `Files in "${f.source_folder || '…'}" not opened for ${f.days || '30'} days moved to "${f.archive_folder || 'Archive'}".`,
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
          { key: 'notify_email', label: 'Send alert to (press Enter to add)', type: 'tags', placeholder: 'you@example.com' },
        ],
        summary: (f) => {
          const tos = Array.isArray(f.notify_email) ? f.notify_email : (f.notify_email ? [f.notify_email] : []);
          return `Alerts ${tos.join(', ') || '…'} when cell ${f.cell || '…'} in "${f.sheet_name || '…'}" exceeds ${f.threshold || 'X'}.`;
        },
        schedule: 'Hourly check',
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
          { key: 'recipients', label: 'Email recipients (press Enter to add each)', type: 'tags', placeholder: 'team@company.com' },
        ],
        summary: (f) => {
          const tos = Array.isArray(f.recipients) ? f.recipients : (f.recipients ? [f.recipients] : []);
          return `${f.frequency || 'Daily'} at ${f.send_time || '08:00'}, emails report from "${f.sheet_name || '…'}" to ${tos.join(', ') || '…'}.`;
        },
        schedule: (f) => `${f.frequency || 'Daily'} at ${f.send_time || '08:00'}`,
      },
      {
        id: 'sheets-row-update',
        name: 'Notify team when a row is updated',
        desc: 'Send an email notification whenever any row in a Sheet is edited',
        icon: '🔔',
        fields: [
          { key: 'sheet_name', label: 'Google Sheet name', type: 'text', placeholder: 'e.g. Project Tracker' },
          { key: 'notify_emails', label: 'Notify (press Enter to add each email)', type: 'tags', placeholder: 'team@company.com' },
        ],
        summary: (f) => {
          const tos = Array.isArray(f.notify_emails) ? f.notify_emails : (f.notify_emails ? [f.notify_emails] : []);
          return `Notifies ${tos.join(', ') || '…'} when a row is updated in "${f.sheet_name || '…'}".`;
        },
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
          { key: 'keywords', label: 'Email keywords (press Enter to add each)', type: 'tags', placeholder: 'e.g. action required' },
          { key: 'sheet_name', label: 'Google Sheet name for tasks', type: 'text', placeholder: 'e.g. Task List' },
        ],
        summary: (f) => {
          const kws = Array.isArray(f.keywords) ? f.keywords : (f.keywords ? [f.keywords] : []);
          return `When email with ${kws.length ? kws.map(k => `"${k}"`).join(' or ') : '…'} arrives, appends task to "${f.sheet_name || '…'}" Sheet.`;
        },
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
        id: 'cross-invoice-pipeline',
        name: 'Invoice received in Gmail → saved to Drive + logged in Sheet',
        desc: 'When an invoice email arrives, save the attachment to Drive and log it in a Sheet',
        icon: '💰',
        fields: [
          { key: 'drive_folder', label: 'Save attachments to Drive folder', type: 'text', placeholder: 'e.g. Invoices 2026' },
          { key: 'sheet_name', label: 'Log entries in Google Sheet', type: 'text', placeholder: 'e.g. Invoice Log' },
        ],
        summary: (f) => `When invoice email arrives, saves attachment to "${f.drive_folder || '…'}" and logs to "${f.sheet_name || '…'}".`,
        schedule: 'On new email',
      },
      {
        id: 'cross-weekly-report',
        name: 'Weekly report auto-generated from Sheets and emailed',
        desc: 'Auto-generate a weekly report from Sheets data and email it to your team',
        icon: '📊',
        fields: [
          { key: 'sheet_name', label: 'Source Sheet name', type: 'text', placeholder: 'e.g. KPI Dashboard' },
          { key: 'recipients', label: 'Email recipients (press Enter to add each)', type: 'tags', placeholder: 'team@company.com' },
          { key: 'send_day', label: 'Send on', type: 'select', options: ['Monday', 'Friday', 'Sunday'] },
          { key: 'send_time', label: 'Send at', type: 'time', placeholder: '09:00' },
        ],
        summary: (f) => {
          const tos = Array.isArray(f.recipients) ? f.recipients : (f.recipients ? [f.recipients] : []);
          return `Every ${f.send_day || 'Friday'} at ${f.send_time || '09:00'}, emails report from "${f.sheet_name || '…'}" to ${tos.join(', ') || '…'}.`;
        },
        schedule: (f) => `Weekly on ${f.send_day || 'Friday'} at ${f.send_time || '09:00'}`,
      },
    ],
  },
];

// ─── Tag Input Component ────────────────────────────────────────────────────

function TagInput({ value, onChange, placeholder }) {
  const tags = Array.isArray(value) ? value : (value ? [value] : []);
  const [inputVal, setInputVal] = useState('');

  const addTag = (raw) => {
    const tag = raw.trim();
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    setInputVal('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputVal);
    } else if (e.key === 'Backspace' && !inputVal && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const removeTag = (idx) => onChange(tags.filter((_, i) => i !== idx));

  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center',
        background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
        borderRadius: '8px', padding: '8px 10px', minHeight: '42px', cursor: 'text',
      }}
      onClick={(e) => e.currentTarget.querySelector('input')?.focus()}
    >
      {tags.map((tag, i) => (
        <span
          key={i}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            background: 'rgba(99,102,241,0.15)', color: 'var(--accent-blue)',
            borderRadius: '5px', padding: '2px 8px', fontSize: '0.8rem', fontWeight: 500,
          }}
        >
          {tag}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); removeTag(i); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--accent-blue)', padding: '0 2px', fontSize: '0.75rem', lineHeight: 1,
            }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (inputVal.trim()) addTag(inputVal); }}
        placeholder={tags.length === 0 ? placeholder : 'Add more…'}
        style={{
          border: 'none', background: 'transparent', outline: 'none',
          color: 'var(--text-primary)', fontSize: '0.88rem', minWidth: '120px', flex: 1,
        }}
      />
    </div>
  );
}

// ─── Template setup / edit modal ───────────────────────────────────────────

function TemplateSetupModal({ template, onSave, onClose, initialValues = null }) {
  const isEdit = initialValues !== null;
  const [values, setValues] = useState(
    () => initialValues || Object.fromEntries(template.fields.map((f) => [f.key, f.type === 'tags' ? [] : '']))
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
          <div className={styles.setupFields}>
            {template.fields.map((field) => (
              <div key={field.key} className="input-group" style={{ marginBottom: 0 }}>
                <label className="input-label">{field.label}</label>
                {field.type === 'tags' ? (
                  <TagInput
                    value={values[field.key]}
                    onChange={(v) => set(field.key, v)}
                    placeholder={field.placeholder}
                  />
                ) : field.type === 'select' ? (
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
    if (!desc.trim()) { setDescError(true); return; }
    setDescError(false);
    setSubmitting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const res = await fetch(`${BACKEND()}/api/request-automation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ title: title.trim(), description: desc.trim(), trigger_app: triggerApp, action_app: actionApp }),
      });
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
          <h2>Request a Custom Automation</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Your Email</label>
            <input className="input" type="email" value={userEmail} readOnly style={{ opacity: 0.6, cursor: 'default' }} />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Automation Title</label>
            <input className="input" type="text" placeholder="e.g. Auto-archive invoices weekly" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Description <span style={{ color: '#ef4444' }}>*</span></label>
            <textarea
              className={`input ${styles.ruleTextarea}`}
              placeholder="Describe what you need this automation to do…"
              value={desc}
              onChange={(e) => { setDesc(e.target.value); setDescError(false); }}
              rows={4}
              style={descError ? { borderColor: '#ef4444' } : undefined}
            />
            {descError && <p style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '4px' }}>Description is required.</p>}
          </div>
          <div className={styles.requestFormGrid}>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label">Trigger App (optional)</label>
              <select className="input" value={triggerApp} onChange={(e) => setTriggerApp(e.target.value)} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
                <option value="">— select —</option>
                {APPS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label">Action App (optional)</label>
              <select className="input" value={actionApp} onChange={(e) => setActionApp(e.target.value)} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
                <option value="">— select —</option>
                {APPS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          {error && (
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', fontSize: '0.82rem', color: '#ef4444' }}>
              ✗ {error}
            </div>
          )}
          <div className={styles.modalActions}>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              {submitting && <span className={styles.spinnerSm} />}
              {submitting ? 'Sending…' : 'Submit Request'}
            </button>
            <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatLastRun(last_run_at) {
  if (!last_run_at) return 'Never';
  try {
    const d = new Date(last_run_at);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return d.toLocaleDateString();
  } catch {
    return 'Never';
  }
}

function dbToUi(row) {
  return {
    id:             row.id,
    name:           row.name,
    description:    row.description || '',
    schedule:       row.schedule || '',
    templateId:     row.template_id,
    fieldValues:    row.field_values || {},
    active:         row.is_active,
    lastRun:        formatLastRun(row.last_run_at),
    runs:           row.run_count || 0,
    itemsProcessed: row.items_processed || 0,
  };
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function AutomationsPage() {
  const [automations,       setAutomations]       = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [activeTab,         setActiveTab]         = useState('automations');
  const [setupTemplate,     setSetupTemplate]     = useState(null);
  const [editingAutomation, setEditingAutomation] = useState(null);
  const [logs,              setLogs]              = useState([]);
  const [testingId,         setTestingId]         = useState(null);
  const [testResults,       setTestResults]       = useState({});
  const [requestModalOpen,  setRequestModalOpen]  = useState(false);
  const [userEmail,         setUserEmail]         = useState('');
  const [toast,             setToast]             = useState(null);
  const { plan: userPlan, openUpgrade } = usePlan();

  const getAutomationLimit = (plan) => {
    if (plan === 'pro_plus') return Infinity;
    if (['pro', 'trialing', 'pro_trial', 'active'].includes(plan)) return 10;
    return 2; // free plan: 2 active automations
  };

  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');
    return session.access_token;
  }, []);

  // Load automations — called once we have a confirmed session
  const loadAutomations = useCallback(async (token) => {
    try {
      const res = await fetch(`${BACKEND()}/api/automations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const rows = await res.json();
        setAutomations(rows.map(dbToUi));
      }
    } catch {
      // silent — user sees empty state
    } finally {
      setLoading(false);
    }
  }, []);

  // On mount: wait for Supabase to restore the session, then load.
  // Using onAuthStateChange ensures this works even after a hard page reload
  // where the session token is restored from localStorage asynchronously.
  useEffect(() => {
    let loaded = false;

    // Try immediately (works if session is already in memory)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        if (session.user?.email) setUserEmail(session.user.email);
        if (!loaded) {
          loaded = true;
          loadAutomations(session.access_token);
        }
      }
    });

    // Also listen for auth state change — fires when Supabase restores the
    // session from storage after a page reload (INITIAL_SESSION event)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        if (session.user?.email) setUserEmail(session.user.email);
        if (!loaded) {
          loaded = true;
          loadAutomations(session.access_token);
        }
      } else {
        // Signed out — clear state
        setAutomations([]);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadAutomations]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleSaveAutomation = async (data) => {
    const limit = getAutomationLimit(userPlan);
    const activeCount = automations.filter(a => a.active !== false).length;
    const checkCount = isPro(userPlan) ? automations.length : activeCount;
    if (checkCount >= limit) {
      setSetupTemplate(null);
      if (!isPro(userPlan)) {
        setToast({ message: `Free plan allows ${limit} active automations. Upgrade to Pro for up to 10.`, error: true });
      } else {
        setToast({ message: `You've reached the ${limit}-automation limit on Pro. Upgrade to Pro Plus for unlimited.`, error: true });
      }
      return;
    }
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND()}/api/automations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          template_id:  data.templateId,
          name:         data.name,
          description:  data.description,
          schedule:     data.schedule,
          field_values: data.fieldValues,
        }),
      });
      const row = await res.json();
      if (!res.ok) throw new Error(row.detail || 'Failed to save');
      setAutomations((prev) => [dbToUi(row), ...prev]);
      setLogs((prev) => [{ name: data.name, time: 'Just created', status: 'success', items: 0 }, ...prev]);
      setSetupTemplate(null);
      setActiveTab('automations');
      setToast({ message: 'Automation saved and is now active.' });
      // Register Gmail push watch so "on new email" automations fire in real-time
      if ((data.schedule || '').toLowerCase().includes('on new email')) {
        fetch(`${BACKEND()}/api/gmail/watch`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});  // best-effort, non-blocking
      }
    } catch (e) {
      setToast({ message: e.message, error: true });
    }
  };

  const handleSaveEdit = async (data) => {
    const id = editingAutomation.automation.id;
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND()}/api/automations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name:         data.name,
          description:  data.description,
          schedule:     data.schedule,
          field_values: data.fieldValues,
        }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setAutomations((prev) =>
        prev.map((a) => a.id === id ? { ...a, name: data.name, description: data.description, schedule: data.schedule, templateId: data.templateId, fieldValues: data.fieldValues } : a)
      );
      setEditingAutomation(null);
      setToast({ message: 'Automation updated.' });
    } catch (e) {
      setToast({ message: e.message, error: true });
    }
  };

  const handleEdit = (auto) => {
    const allTemplates = TEMPLATE_CATEGORIES.flatMap((c) => c.templates);
    const template = allTemplates.find((t) => t.id === auto.templateId);
    if (template) setEditingAutomation({ automation: auto, template });
  };

  const toggleActive = async (auto) => {
    const newVal = !auto.active;
    // Optimistic update
    setAutomations((prev) => prev.map((a) => a.id === auto.id ? { ...a, active: newVal } : a));
    try {
      const token = await getToken();
      await fetch(`${BACKEND()}/api/automations/${auto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_active: newVal }),
      });
    } catch {
      // Revert on error
      setAutomations((prev) => prev.map((a) => a.id === auto.id ? { ...a, active: auto.active } : a));
    }
  };

  const deleteAutomation = async (auto) => {
    setAutomations((prev) => prev.filter((a) => a.id !== auto.id));
    try {
      const token = await getToken();
      await fetch(`${BACKEND()}/api/automations/${auto.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      setAutomations((prev) => [auto, ...prev]);
      setToast({ message: 'Failed to delete automation.', error: true });
    }
  };

  const testRunAutomation = async (auto) => {
    setTestingId(auto.id);
    setTestResults((prev) => ({ ...prev, [auto.id]: null }));
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND()}/api/automations/${auto.id}/run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Test run failed');

      const status  = data.status || 'success';
      const message = data.message || 'Executed successfully';
      const items   = data.items || 0;

      setTestResults((prev) => ({ ...prev, [auto.id]: { ok: status !== 'error', message: `${message} (${items} item${items !== 1 ? 's' : ''})` } }));
      setAutomations((prev) => prev.map((a) => a.id === auto.id ? { ...a, runs: (a.runs || 0) + 1, lastRun: 'Just now', itemsProcessed: (a.itemsProcessed || 0) + items } : a));
      setLogs((prev) => [{ name: auto.name, time: 'Just now', status, items }, ...prev]);
    } catch (err) {
      setTestResults((prev) => ({ ...prev, [auto.id]: { ok: false, message: err.message } }));
      setLogs((prev) => [{ name: auto.name, time: 'Just now', status: 'error', items: 0 }, ...prev]);
    } finally {
      setTestingId(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────


  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1>Automations</h1>
          <p>Set-and-forget automations that run 24/7 on schedule.</p>
          {(() => {
            const limit = getAutomationLimit(userPlan);
            if (limit === Infinity) return null;
            const isFree = !isPro(userPlan);
            const activeCount = automations.filter(a => a.active !== false).length;
            const displayCount = isFree ? activeCount : automations.length;
            const atLimit = displayCount >= limit;
            return (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>
                {displayCount}/{limit} {isFree ? 'active ' : ''}automations used
                {atLimit && (
                  isFree
                    ? <> · <a href="/pricing" style={{ color: 'var(--accent-blue)' }}>Upgrade to Pro for up to 10</a></>
                    : <> · <a href="/pricing" style={{ color: 'var(--accent-blue)' }}>Upgrade to Pro Plus for unlimited</a></>
                )}
              </p>
            );
          })()}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setRequestModalOpen(true)}>
            Request Custom
          </button>
          <button className="btn btn-primary" onClick={() => setActiveTab('templates')}>
            + New Automation
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${activeTab === 'automations' ? styles.tabActive : ''}`} onClick={() => setActiveTab('automations')}>
          My Automations ({automations.length})
        </button>
        <button className={`${styles.tab} ${activeTab === 'templates' ? styles.tabActive : ''}`} onClick={() => setActiveTab('templates')}>
          Templates
        </button>
        <button className={`${styles.tab} ${activeTab === 'logs' ? styles.tabActive : ''}`} onClick={() => setActiveTab('logs')}>
          Execution Log
        </button>
      </div>

      {/* My Automations Tab */}
      {activeTab === 'automations' && (
        <div className={styles.rulesList}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '12px' }}>⏳</div>
              <p>Loading automations…</p>
            </div>
          ) : automations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🔄</div>
              <p style={{ marginBottom: '16px' }}>No automations yet. Browse Templates to get started.</p>
              <button className="btn btn-primary" onClick={() => setActiveTab('templates')}>Browse Templates</button>
            </div>
          ) : (
            automations.map((auto) => (
              <div key={auto.id} className={styles.ruleCard}>
                <div className={styles.ruleHeader}>
                  <div className={styles.ruleInfo}>
                    <h3 className={styles.ruleName}>{auto.name}</h3>
                    <p className={styles.ruleDesc}>{auto.description}</p>
                  </div>
                  <div
                    className={`toggle ${auto.active ? 'active' : ''}`}
                    onClick={() => toggleActive(auto)}
                    style={{ cursor: 'pointer', flexShrink: 0 }}
                  />
                </div>
                <div className={styles.ruleMeta}>
                  <span className={styles.ruleMetaItem}>📅 {auto.schedule}</span>
                  <span className={styles.ruleMetaItem}>🕐 Last: {auto.lastRun}</span>
                  <span className={styles.ruleMetaItem}>🔄 {auto.runs} runs</span>
                  <span className={styles.ruleMetaItem}>📦 {auto.itemsProcessed} items</span>
                  <span className={styles.ruleMetaItem} style={{ color: auto.active ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                    {auto.active ? '● Active' : '○ Paused'}
                  </span>
                </div>

                {testResults[auto.id] && (
                  <div style={{
                    padding: '9px 12px', marginBottom: '8px', borderRadius: '8px',
                    background: testResults[auto.id].ok ? 'rgba(52,211,153,0.08)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${testResults[auto.id].ok ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)'}`,
                    fontSize: '0.8rem',
                    color: testResults[auto.id].ok ? 'var(--accent-green)' : '#ef4444',
                  }}>
                    {testResults[auto.id].ok ? '✓ ' : '✗ '}{testResults[auto.id].message}
                  </div>
                )}

                <div className={styles.ruleActions}>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(auto)} disabled={!auto.templateId}>
                    Edit
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => testRunAutomation(auto)}
                    disabled={testingId === auto.id}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    {testingId === auto.id ? <><span className={styles.spinnerSm} />Running…</> : 'Test Run'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--accent-red)' }}
                    onClick={() => deleteAutomation(auto)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
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
          {logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>📋</div>
              <p>No execution history yet. Run a Test Run to see results here.</p>
            </div>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} className={styles.logItem}>
                <div className={`${styles.logStatus} ${styles[log.status]}`}>
                  {log.status === 'success' ? '✓' : log.status === 'skipped' ? '–' : '⚠'}
                </div>
                <div className={styles.logContent}>
                  <span className={styles.logRule}>{log.name}</span>
                  <span className={styles.logTime}>{log.time}</span>
                </div>
                <span className={styles.logItems}>{log.items} item{log.items !== 1 ? 's' : ''}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Setup modal */}
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
