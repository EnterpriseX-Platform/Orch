'use client'

import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Paper, Typography } from '@mui/material'

export const KafkaNode = memo(({ data }: NodeProps<any>) => {
  return (
    <>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Paper
        sx={{
          p: 2,
          minWidth: 150,
          background: 'linear-gradient(135deg, #9c27b0 0%, #ce93d8 100%)',
          color: 'white',
          textAlign: 'center',
          borderRadius: 2,
          boxShadow: 2,
        }}
      >
        <Typography variant="subtitle2" fontWeight={600}>
          📨 {data?.label || 'Kafka'}
        </Typography>
        {data?.topic && (
          <Typography variant="caption" sx={{ opacity: 0.9 }}>
            {data.topic}
          </Typography>
        )}
      </Paper>
    </>
  )
})
KafkaNode.displayName = 'KafkaNode'
