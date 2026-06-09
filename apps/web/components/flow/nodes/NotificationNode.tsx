'use client'

import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Paper, Typography } from '@mui/material'

export const NotificationNode = memo(({ data }: NodeProps<any>) => {
  return (
    <>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Paper
        sx={{
          p: 2,
          minWidth: 150,
          background: 'linear-gradient(135deg, #e91e63 0%, #f06292 100%)',
          color: 'white',
          textAlign: 'center',
          borderRadius: 2,
          boxShadow: 2,
        }}
      >
        <Typography variant="subtitle2" fontWeight={600}>
          🔔 {data?.label || 'Notify'}
        </Typography>
        {data?.channel && (
          <Typography variant="caption" sx={{ opacity: 0.9 }}>
            {data.channel}
          </Typography>
        )}
      </Paper>
    </>
  )
})
NotificationNode.displayName = 'NotificationNode'
