'use client'

import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Paper, Typography } from '@mui/material'

export const TransformNode = memo(({ data }: NodeProps<any>) => {
  return (
    <>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Paper
        sx={{
          p: 2,
          minWidth: 150,
          background: 'linear-gradient(135deg, #ff9800 0%, #ffb74d 100%)',
          color: 'white',
          textAlign: 'center',
          borderRadius: 2,
          boxShadow: 2,
        }}
      >
        <Typography variant="subtitle2" fontWeight={600}>
          ⚡ {data?.label || 'Transform'}
        </Typography>
      </Paper>
    </>
  )
})
TransformNode.displayName = 'TransformNode'
