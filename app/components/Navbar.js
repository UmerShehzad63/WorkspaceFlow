'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function Navbar({ transparent = false }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <nav className="navbar" style={transparent ? { background: 'transparent', borderBottom: 'none' } : {}}>
        <div className="container">
          <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Image src="/logo.png" alt="CouchMail" width={44} height={44} style={{ objectFit: 'contain' }} priority />
            <span style={{
              fontFamily: "'Manrope', 'Inter', sans-serif",
              fontWeight: 800,
              fontSize: '1.25rem',
              color: '#001857',
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}>
              CouchMail
            </span>
          </Link>

          <ul className="nav-links">
            <li><Link href="/#features">Features</Link></li>
            <li><Link href="/#how-it-works">How It Works</Link></li>
            <li><Link href="/pricing">Pricing</Link></li>
          </ul>

          <div className="nav-actions">
            <Link href="/login" className="btn btn-ghost" style={{ fontWeight: 700, color: 'var(--color-primary)' }}>Sign In</Link>
            <Link href="/login" className="btn btn-primary">Get Started</Link>
          </div>

          <button
            className="nav-hamburger"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <span style={menuOpen ? { transform: 'rotate(45deg) translate(5px, 5px)' } : {}} />
            <span style={menuOpen ? { opacity: 0 } : {}} />
            <span style={menuOpen ? { transform: 'rotate(-45deg) translate(5px, -5px)' } : {}} />
          </button>
        </div>
      </nav>

      <div className={`mobile-menu ${menuOpen ? 'open' : ''}`}>
        <Link href="/#features" onClick={() => setMenuOpen(false)}>Features</Link>
        <Link href="/#how-it-works" onClick={() => setMenuOpen(false)}>How It Works</Link>
        <Link href="/pricing" onClick={() => setMenuOpen(false)}>Pricing</Link>
        <hr className="divider" />
        <Link href="/login" onClick={() => setMenuOpen(false)}>Sign In</Link>
        <Link href="/login" className="btn btn-primary" style={{ textAlign: 'center', marginTop: '8px' }} onClick={() => setMenuOpen(false)}>
          Get Started
        </Link>
      </div>
    </>
  );
}
