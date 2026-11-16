'use client'

import { Pagination as CarbonPagination } from '@carbon/react'

export interface PaginationProps {
  /** Current page (1-based). */
  page: number
  /** Total number of pages (>= 1). */
  totalPages: number
  /** Total row count, shown as "· N total" when provided. */
  total?: number
  /** Called with the next page number when the user navigates. */
  onPageChange: (page: number) => void
  /** Current page size (rows per page). */
  pageSize: number
  /** Called with the next page size when the user changes it. */
  onPageSizeChange: (pageSize: number) => void
  /** Page-size choices. Defaults to [25, 50, 100]. */
  pageSizeOptions?: number[]
}

/**
 * Controlled pagination bar (page navigation + page-size selector), rendered
 * with Carbon's Pagination. Always renders — even when totalPages <= 1 — so
 * the page-size control stays visible.
 */
export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
}: PaginationProps) {
  const safeTotalPages = Math.max(1, totalPages)
  // Carbon derives page count from totalItems; when the caller only knows
  // the page count, synthesise a total that yields the same number of pages.
  const totalItems = total ?? safeTotalPages * pageSize
  const pageSizes = pageSizeOptions.includes(pageSize)
    ? pageSizeOptions
    : [...pageSizeOptions, pageSize].sort((a, b) => a - b)

  return (
    <CarbonPagination
      page={page}
      pageSize={pageSize}
      pageSizes={pageSizes}
      totalItems={totalItems}
      itemsPerPageText="per page"
      backwardText="Previous page"
      forwardText="Next page"
      onChange={({ page: nextPage, pageSize: nextSize }: { page: number; pageSize: number }) => {
        if (nextSize !== pageSize) onPageSizeChange(nextSize)
        else if (nextPage !== page) onPageChange(nextPage)
      }}
    />
  )
}
