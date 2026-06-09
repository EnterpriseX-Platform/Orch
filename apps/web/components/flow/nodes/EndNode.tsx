'use client'

import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Paper, Typography } from '@mui/material'

export const EndNode = memo(({ data }: NodeProps<any>) => {
  return (
    <>
      <Handle type="target" position={Position.Top} />
      <Paper
        sx={{
          p: 2,
          minWidth: 120,
          background: 'linear-gradient(135deg, #f44336 0%, #ef5350 100%)',
          color: 'white',
          textAlign: 'center',
          borderRadius: 2,
          boxShadow: 2,
        }}
      >
        <Typography variant="subtitle2" fontWeight={600}>
          ⏹️ {data?.label || 'End'}
        </Typography>
      </Paper>
    </>
  )
})
EndNode.displayName = 'EndNode'
