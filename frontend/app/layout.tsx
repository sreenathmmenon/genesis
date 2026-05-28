import type { Metadata } from 'next'
import { geistSans, geistMono } from './fonts'
import './globals.css'

export const metadata: Metadata = {
  title: 'Genesis',
  description: 'AI Agent Orchestration Platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>{children}</body>
    </html>
  )
}
