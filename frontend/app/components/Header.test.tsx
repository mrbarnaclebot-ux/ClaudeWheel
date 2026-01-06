// ═══════════════════════════════════════════════════════════════════════════
// HEADER COMPONENT TESTS
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Header from './Header'

describe('Header', () => {
  it('renders the header with title', () => {
    render(<Header />)
    expect(screen.getByText('CLAUDE')).toBeDefined()
    expect(screen.getByText('FLYWHEEL')).toBeDefined()
  })

  it('shows subtitle text', () => {
    render(<Header />)
    expect(screen.getByText('Autonomous Market Making')).toBeDefined()
  })

  it('shows ACTIVE status when isActive is true', () => {
    render(<Header isActive={true} />)
    expect(screen.getByText('ACTIVE')).toBeDefined()
  })

  it('shows PAUSED status when isActive is false', () => {
    render(<Header isActive={false} />)
    expect(screen.getByText('PAUSED')).toBeDefined()
  })

  it('shows MAINNET badge', () => {
    render(<Header />)
    expect(screen.getByText('MAINNET')).toBeDefined()
  })

  it('renders logo icon', () => {
    render(<Header />)
    expect(screen.getByText('◈')).toBeDefined()
  })
})
