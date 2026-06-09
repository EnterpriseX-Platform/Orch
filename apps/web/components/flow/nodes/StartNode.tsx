'use client'

import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Box, Paper, Typography } from '@mui/material'

export const StartNode = memo(({ data }: NodeProps<any>) => {
  return (
    <>
      <Handle type="source" position={Position.Bottom} />
      <Paper
        sx={{
          p: 2,
          minWidth: 120,
          background: 'linear-gradient(135deg, #4caf50 0%, #81c784 100%)',
          color: 'white',
          textAlign: 'center',
          borderRadius: 2,
          boxShadow: 2,
        }}
      >
        <Typography variant="subtitle2" fontWeight={600}>
          ▶️ {data?.label || 'Start'}
        </Typography>
      </Paper>
    </>
  )
})
StartNode.displayName = 'StartNode'
