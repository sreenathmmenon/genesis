'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7.5 1.5L13.5 6V13H9.5V9H5.5V13H1.5V6L7.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none"/>
      </svg>
    ),
  },
  {
    href: '/workflows',
    label: 'My Agents',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="7.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <path d="M2 13C2 10.2 4.5 8 7.5 8C10.5 8 13 10.2 13 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
      </svg>
    ),
  },
  {
    href: '/canvas',
    label: 'Canvas',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1.5" y="1.5" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <circle cx="4.5" cy="4.5" r="1.2" fill="currentColor"/>
        <circle cx="10.5" cy="4.5" r="1.2" fill="currentColor"/>
        <circle cx="7.5" cy="10.5" r="1.2" fill="currentColor"/>
        <line x1="4.5" y1="4.5" x2="10.5" y2="4.5" stroke="currentColor" strokeWidth="1" strokeDasharray="1.5 1.5"/>
        <line x1="10.5" y1="4.5" x2="7.5" y2="10.5" stroke="currentColor" strokeWidth="1" strokeDasharray="1.5 1.5"/>
      </svg>
    ),
  },
  {
    href: '/templates',
    label: 'Templates',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <rect x="8" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <rect x="1.5" y="8" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <rect x="8" y="8" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      </svg>
    ),
  },
  {
    href: '/history',
    label: 'History',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <path d="M7.5 4V7.5L10 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    ),
  },
]

export function Nav() {
  const pathname = usePathname()

  function isActive(href: string): boolean {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <nav className="nav-sidebar">
      {/* Logo */}
      <div style={{
        padding: '18px 16px 16px',
        borderBottom: '1px solid var(--border-0)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 22,
            height: 22,
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent-border)',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{
              fontSize: 12,
              color: 'var(--accent)',
              fontWeight: 700,
              lineHeight: 1,
              fontFamily: 'var(--font-mono)',
            }}>G</span>
          </div>
          <span style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
            fontFamily: 'var(--font-sans)',
          }}>Genesis</span>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--accent)',
            flexShrink: 0,
            marginLeft: 2,
          }} />
        </div>
      </div>

      {/* Nav items */}
      <div style={{ flex: 1, paddingTop: 8 }}>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item${isActive(item.href) ? ' nav-item--active' : ''}`}
          >
            <span style={{
              color: isActive(item.href) ? 'var(--accent-text)' : 'currentColor',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
            }}>
              {item.icon}
            </span>
            {item.label}
          </Link>
        ))}
      </div>

      {/* Bottom */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--border-0)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-tertiary)',
          letterSpacing: '0.06em',
          opacity: 0.5,
        }}>genesis v0.1</span>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--success)',
          boxShadow: '0 0 0 2px #062010',
          display: 'inline-block',
        }} title="Backend connected" />
      </div>
    </nav>
  )
}
