'use client'

import { useEffect, useRef, useState } from 'react'
import { TabulatorFull as Tabulator } from 'tabulator-tables'
import 'tabulator-tables/dist/css/tabulator.min.css'
import { Box, TextField, Button, Menu, MenuItem, IconButton } from '@mui/material'
import { Download, FilterList, MoreVert } from '@mui/icons-material'

interface TabulatorTableProps {
  data: any[]
  columns: any[]
  height?: string | number
  onRowClick?: (row: any) => void
  pagination?: boolean
  pageSize?: number
  exportable?: boolean
  filterable?: boolean
}

export function TabulatorTable({
  data,
  columns,
  height = '500px',
  onRowClick,
  pagination = true,
  pageSize = 25,
  exportable = true,
  filterable = true,
}: TabulatorTableProps) {
  const tableRef = useRef<HTMLDivElement>(null)
  const tabulatorRef = useRef<Tabulator | null>(null)
  const [searchText, setSearchText] = useState('')
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)

  useEffect(() => {
    if (tableRef.current) {
      tabulatorRef.current = new Tabulator(tableRef.current, {
        data: data || [],
        columns: columns,
        layout: 'fitColumns',
        responsiveLayout: 'collapse',
        pagination: pagination,
        paginationSize: pageSize,
        paginationSizeSelector: [10, 25, 50, 100],
        movableColumns: true,
        paginationCounter: 'rows',
        height: height,
        ...getMUITheme(),
        ...(onRowClick ? {
          rowClick: (e: any, row: any) => {
            onRowClick(row.getData())
          }
        } : {}),
      } as any)
    }

    return () => {
      if (tabulatorRef.current) {
        tabulatorRef.current.destroy()
      }
    }
  }, [data, columns])

  // Search filter
  useEffect(() => {
    if (tabulatorRef.current && filterable) {
      if (searchText) {
        tabulatorRef.current.setFilter([
          [
            { field: 'name', type: 'like', value: searchText },
            { field: 'description', type: 'like', value: searchText },
            { field: 'endpoint', type: 'like', value: searchText },
          ],
        ])
      } else {
        tabulatorRef.current.clearFilter(true)
      }
    }
  }, [searchText, filterable])

  const handleExportCSV = () => {
    tabulatorRef.current?.download('csv', 'data.csv')
  }

  const handleExportJSON = () => {
    tabulatorRef.current?.download('json', 'data.json')

  }

  const handleExportXLSX = () => {
    tabulatorRef.current?.download('xlsx', 'data.xlsx', { sheetName: 'Data' })
  }

  return (
    <Box>
      {/* Toolbar */}
      {(filterable || exportable) && (
        <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
          {filterable && (
            <TextField
              size="small"
              placeholder="Search..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              sx={{ flex: 1, maxWidth: 300 }}
            />
          )}
          <Box sx={{ flex: 1 }} />
          {exportable && (
            <>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Download />}
                onClick={(e) => setAnchorEl(e.currentTarget)}
              >
                Export
              </Button>
              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={() => setAnchorEl(null)}
              >
                <MenuItem onClick={handleExportCSV}>Export CSV</MenuItem>
                <MenuItem onClick={handleExportJSON}>Export JSON</MenuItem>
                <MenuItem onClick={handleExportXLSX}>Export Excel</MenuItem>
              </Menu>
            </>
          )}
        </Box>
      )}

      {/* Table */}
      <Box
        ref={tableRef}
        sx={{
          '& .tabulator': {
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
          },
          '& .tabulator-header': {
            backgroundColor: '#fafafa',
            borderBottom: '1px solid',
            borderColor: 'divider',
            fontWeight: 600,
          },
          '& .tabulator-row': {
            borderBottom: '1px solid',
            borderColor: 'divider',
            '&:hover': {
              backgroundColor: 'rgba(0,0,0,0.04)',
            },
          },
          '& .tabulator-row.tabulator-selected': {
            backgroundColor: 'rgba(25, 118, 210, 0.08)',
          },
          '& .tabulator-page': {
            padding: '6px 12px',
            margin: '0 4px',
            borderRadius: 1,
            border: 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            '&:hover': {
              backgroundColor: 'rgba(0,0,0,0.04)',
            },
            '&.active': {
              backgroundColor: 'primary.main',
              color: 'white',
            },
          },
          '& .tabulator-footer': {
            borderTop: '1px solid',
            borderColor: 'divider',
            padding: '12px',
          },
        }}
      />
    </Box>
  )
}

// MUI Theme for Tabulator
function getMUITheme() {
  return {
    cssClass: 'mui-theme',
    headerSortElement: function (column: any, dir: string) {
      switch (dir) {
        case 'asc':
          return '<span style="font-size: 14px;">▲</span>'
        case 'desc':
          return '<span style="font-size: 14px;">▼</span>'
        default:
          return '<span style="font-size: 14px; opacity: 0.3;">▲</span>'
      }
    },
  }
}
