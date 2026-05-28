import type { Metadata } from 'next'
import { syne, dmMono } from './fonts'
import './globals.css'

export const metadata: Metadata = {
  title: 'Genesis',
  description: 'AI Agent Orchestration Platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${dmMono.variable}`}
    >
      <body>{children}</body>
    </html>
  )
}
