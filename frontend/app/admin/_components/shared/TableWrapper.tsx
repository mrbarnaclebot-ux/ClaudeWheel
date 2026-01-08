'use client'

import { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Column<T> {
  key: string
  header: string
  width?: string
  align?: 'left' | 'center' | 'right'
  render?: (item: T, index: number) => ReactNode
}

interface TableWrapperProps<T> {
  data: T[]
  columns: Column<T>[]
  keyExtractor: (item: T) => string
  isLoading?: boolean
  emptyMessage?: string
  onRowClick?: (item: T) => void
  selectedKey?: string
  className?: string
  stickyHeader?: boolean
}

export function TableWrapper<T>({
  data,
  columns,
  keyExtractor,
  isLoading = false,
  emptyMessage = 'No data available',
  onRowClick,
  selectedKey,
  className = '',
  stickyHeader = false,
}: TableWrapperProps<T>) {
  const alignClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full">
        <thead className={stickyHeader ? 'sticky top-0 z-10' : ''}>
          <tr className="bg-bg-secondary/50 border-b border-border-subtle">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-xs font-mono font-medium text-text-muted uppercase tracking-wider ${alignClasses[col.align || 'left']}`}
                style={{ width: col.width }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <AnimatePresence mode="popLayout">
            {isLoading ? (
              // Loading skeleton rows
              Array.from({ length: 5 }).map((_, i) => (
                <motion.tr
                  key={`skeleton-${i}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="border-b border-border-subtle/30"
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <div className="h-4 bg-border-subtle/50 rounded animate-pulse" />
                    </td>
                  ))}
                </motion.tr>
              ))
            ) : data.length === 0 ? (
              <motion.tr
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-text-muted"
                >
                  {emptyMessage}
                </td>
              </motion.tr>
            ) : (
              data.map((item, index) => {
                const key = keyExtractor(item)
                const isSelected = selectedKey === key

                return (
                  <motion.tr
                    key={key}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.02 }}
                    className={`
                      border-b border-border-subtle/30 transition-colors
                      ${onRowClick ? 'cursor-pointer hover:bg-bg-card-hover' : ''}
                      ${isSelected ? 'bg-accent-primary/10' : ''}
                    `}
                    onClick={() => onRowClick?.(item)}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3 text-sm ${alignClasses[col.align || 'left']}`}
                      >
                        {col.render
                          ? col.render(item, index)
                          : String((item as Record<string, unknown>)[col.key] ?? '')}
                      </td>
                    ))}
                  </motion.tr>
                )
              })
            )}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  )
}

/**
 * Pagination controls for tables
 */
interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: number[]
  className?: string
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className = '',
}: PaginationProps) {
  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = []
    const showPages = 5
    const halfShow = Math.floor(showPages / 2)

    let startPage = Math.max(1, currentPage - halfShow)
    let endPage = Math.min(totalPages, currentPage + halfShow)

    // Adjust if we're near the start or end
    if (currentPage <= halfShow) {
      endPage = Math.min(showPages, totalPages)
    }
    if (currentPage > totalPages - halfShow) {
      startPage = Math.max(1, totalPages - showPages + 1)
    }

    // Add first page and ellipsis if needed
    if (startPage > 1) {
      pages.push(1)
      if (startPage > 2) pages.push('ellipsis')
    }

    // Add main page numbers
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i)
    }

    // Add ellipsis and last page if needed
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) pages.push('ellipsis')
      pages.push(totalPages)
    }

    return pages
  }

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t border-border-subtle ${className}`}
    >
      {/* Items info */}
      <div className="text-sm text-text-muted">
        Showing <span className="font-medium text-text-primary">{startItem}</span> to{' '}
        <span className="font-medium text-text-primary">{endItem}</span> of{' '}
        <span className="font-medium text-text-primary">{totalItems}</span> results
      </div>

      <div className="flex items-center gap-4">
        {/* Page size selector */}
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-muted">Show:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="bg-bg-secondary border border-border-subtle rounded px-2 py-1 text-sm text-text-primary focus:outline-none focus:border-accent-primary"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Page navigation */}
        <div className="flex items-center gap-1">
          {/* Previous button */}
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-2 py-1 text-sm border border-border-subtle rounded hover:bg-bg-card-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Prev
          </button>

          {/* Page numbers */}
          <div className="flex items-center gap-1">
            {getPageNumbers().map((page, index) =>
              page === 'ellipsis' ? (
                <span key={`ellipsis-${index}`} className="px-2 text-text-muted">
                  ...
                </span>
              ) : (
                <button
                  key={page}
                  onClick={() => onPageChange(page)}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
                    currentPage === page
                      ? 'bg-accent-primary text-white'
                      : 'border border-border-subtle hover:bg-bg-card-hover'
                  }`}
                >
                  {page}
                </button>
              )
            )}
          </div>

          {/* Next button */}
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-2 py-1 text-sm border border-border-subtle rounded hover:bg-bg-card-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Combined table with pagination
 */
interface PaginatedTableProps<T> extends Omit<TableWrapperProps<T>, 'className'> {
  currentPage: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  title?: string
  actions?: ReactNode
  className?: string
}

export function PaginatedTable<T>({
  title,
  actions,
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  className = '',
  ...tableProps
}: PaginatedTableProps<T>) {
  const totalPages = Math.ceil(totalItems / pageSize)

  return (
    <div className={`bg-bg-card border border-border-subtle rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      {(title || actions) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          {title && (
            <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}

      {/* Table */}
      <TableWrapper {...tableProps} />

      {/* Pagination */}
      {totalItems > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </div>
  )
}
