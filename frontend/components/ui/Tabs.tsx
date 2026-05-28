'use client'

import React, { createContext, useContext, useState } from 'react'

interface TabsContextValue {
  active: string
  setActive: (id: string) => void
}

const TabsContext = createContext<TabsContextValue | null>(null)

interface TabsProps {
  defaultTab?: string
  children: React.ReactNode
  className?: string
}

export function Tabs({ defaultTab = '', children, className = '' }: TabsProps) {
  const [active, setActive] = useState(defaultTab)

  return (
    <TabsContext.Provider value={{ active, setActive }}>
      <div className={`flex gap-0 border-b border-border-1 ${className}`}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

interface TabProps {
  id: string
  children: React.ReactNode
  className?: string
}

export function Tab({ id, children, className = '' }: TabProps) {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('Tab must be used inside Tabs')

  const isActive = ctx.active === id

  return (
    <button
      onClick={() => ctx.setActive(id)}
      className={`
        px-4 py-3 text-sm font-medium whitespace-nowrap select-none
        border-b-2 -mb-px cursor-pointer
        transition-colors duration-fast
        ${isActive
          ? 'text-text-primary border-accent'
          : 'text-text-tertiary border-transparent hover:text-text-secondary'
        }
        ${className}
      `}
    >
      {children}
    </button>
  )
}
