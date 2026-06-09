'use client'

import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Box, Paper, Typography } from '@mui/material'

export const AuditNode = memo(({ data }: NodeProps<any>) => {
  return (
    <>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Paper
        sx={{
          p: 2,
          minWidth: 150,
          background: 'linear-gradient(135deg, #2196f3 0%, #64b5f6 100%)',
          color: 'white',
          textAlign: 'center',
          borderRadius: 2,
          boxShadow: 2,
        }}
      >
        <Typography variant="subtitle2" fontWeight={600}>
          📝 {data?.label || 'Audit Log'}
        </Typography>
        {data?.fields && (
          <Typography variant="caption" sx={{ opacity: 0.9 }}>
            {Object.keys(data.fields).length} fields
          </Typography>
        )}
      </Paper>
    </>
  )
})
AuditNode.displayName = 'AuditNode'
