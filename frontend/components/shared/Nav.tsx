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
      <svg width="16" height="16" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7.5 1.5L13.5 6V13H9.5V9H5.5V13H1.5V6L7.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none"/>
      </svg>
    ),
  },
  {
    href: '/inbox',
    label: 'Inbox',
    icon: (
      <svg width="16" height="16" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1.5" y="3.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <path d="M1.5 6L7.5 9L13.5 6" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none"/>
      </svg>
    ),
  },
  {
    href: '/workflows',
    label: 'My Agents',
    icon: (
      <svg width="16" height="16" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="7.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <path d="M2 13C2 10.2 4.5 8 7.5 8C10.5 8 13 10.2 13 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
      </svg>
    ),
  },
  {
    href: '/canvas',
    label: 'Canvas',
    icon: (
      <svg width="16" height="16" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
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
      <svg width="16" height="16" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
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
      <svg width="16" height="16" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <path d="M7.5 4V7.5L10 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    ),
  },
  {
    href: '/audit',
    label: 'Audit Log',
    icon: (
      <svg width="16" height="16" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="1.5" width="11" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <line x1="4.5" y1="5" x2="10.5" y2="5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <line x1="4.5" y1="7.5" x2="10.5" y2="7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <line x1="4.5" y1="10" x2="8" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
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
        padding: '20px 18px',
        borderBottom: '1px solid #EEF0F4',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 24,
            height: 24,
            background: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{
              fontSize: 13,
              color: '#16A34A',
              fontWeight: 700,
              lineHeight: 1,
              fontFamily: 'var(--font-mono)',
            }}>G</span>
          </div>
          <span style={{
            fontSize: 15,
            fontWeight: 700,
            color: '#111827',
            letterSpacing: '-0.02em',
            fontFamily: 'var(--font-sans)',
          }}>Genesis</span>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#16A34A',
            flexShrink: 0,
            marginLeft: 2,
          }} />
        </div>
      </div>

      {/* Nav items */}
      <div style={{ flex: 1, paddingTop: 12, paddingBottom: 12 }}>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item${isActive(item.href) ? ' nav-item--active' : ''}`}
          >
            <span style={{
              color: isActive(item.href) ? '#16A34A' : 'currentColor',
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
        padding: '14px 16px',
        borderTop: '1px solid #E5E7EB',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          color: '#6B7280',
          letterSpacing: '0.02em',
        }}>genesis v0.1</span>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: '#16A34A',
          boxShadow: '0 0 0 2px #F0FDF4',
          display: 'inline-block',
        }} title="Backend connected" />
      </div>
    </nav>
  )
}
