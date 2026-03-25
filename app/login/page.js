'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './login.module.css';

export default function LoginPage() {
  const router = useRouter();

  const handleGoogleLogin = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.readonly',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error logging in with Google:', error.message);
      alert('Error logging in with Google: ' + error.message);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link href="/" style={{ display: 'flex', justifyContent: 'center', marginBottom: '32px' }}>
          <Image src="/logo.png" alt="CouchMail" width={150} height={46} style={{ objectFit: 'contain' }} priority />
        </Link>

        <h1>Connect your Google Workspace</h1>
        <p>Sign in with Google to get started. We&apos;ll request access to read and send emails, manage calendar events, and search Drive.</p>

        <button className="google-btn" onClick={handleGoogleLogin}>
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <div className={styles.scopes}>
          <h4>What we&apos;ll access:</h4>
          <div className={styles.scopeList}>
            <div className={styles.scopeItem}>
              <span className={styles.scopeIcon}>📧</span>
              <div>
                <strong>Gmail</strong>
                <span>Read, search, send, and archive emails</span>
              </div>
            </div>
            <div className={styles.scopeItem}>
              <span className={styles.scopeIcon}>📅</span>
              <div>
                <strong>Calendar</strong>
                <span>Read, search, and create calendar events</span>
              </div>
            </div>
            <div className={styles.scopeItem}>
              <span className={styles.scopeIcon}>📁</span>
              <div>
                <strong>Drive</strong>
                <span>Search and read files and documents</span>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.trust}>
          <div className={styles.trustItem}>🔒 256-bit encryption</div>
          <div className={styles.trustItem}>🛡️ SOC 2 compliant</div>
          <div className={styles.trustItem}>🚫 No passwords stored</div>
        </div>
      </div>
    </div>
  );
}
