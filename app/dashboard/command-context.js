'use client';
import { createContext, useContext, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const CommandCtx = createContext(null);

export function CommandProvider({ children }) {
  const [cmdText,     setCmdText]     = useState('');
  const [cmdResult,   setCmdResult]   = useState(null); // null | {intent,result,pending?} | {error}
  const [isExecuting, setIsExecuting] = useState(false);

  const clearResult = useCallback(() => setCmdResult(null), []);

  /** Execute a command from the global header. Sets cmdResult for the layout overlay. */
  const runGlobalCommand = useCallback(async (commandText, overrides = {}) => {
    const cmd = (commandText || '').trim();
    if (!cmd) return;

    setIsExecuting(true);
    setCmdResult(null);

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
          body: JSON.stringify({ command: cmd, overrides }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Command failed');

      setCmdResult(
        data.needs_disambiguation
          ? { intent: data.intent, result: data.result, pending: { command: cmd, overrides } }
          : { intent: data.intent, result: data.result }
      );
    } catch (e) {
      setCmdResult({ error: e.message });
    } finally {
      setIsExecuting(false);
    }
  }, []);

  /** Re-run after the user resolves a disambiguation choice. */
  const handleGlobalDisambiguationPick = useCallback(async (extraOverrides) => {
    if (!cmdResult?.pending) return;
    const { command, overrides } = cmdResult.pending;
    await runGlobalCommand(command, { ...overrides, ...extraOverrides });
  }, [cmdResult, runGlobalCommand]);

  return (
    <CommandCtx.Provider value={{
      cmdText,     setCmdText,
      cmdResult,   setCmdResult,  clearResult,
      isExecuting,
      runGlobalCommand,
      handleGlobalDisambiguationPick,
    }}>
      {children}
    </CommandCtx.Provider>
  );
}

export function useCommand() {
  const ctx = useContext(CommandCtx);
  if (!ctx) throw new Error('useCommand must be used within <CommandProvider>');
  return ctx;
}
