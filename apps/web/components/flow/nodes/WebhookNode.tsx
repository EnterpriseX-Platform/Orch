'use client'

import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Paper, Typography } from '@mui/material'

export const WebhookNode = memo(({ data }: NodeProps<any>) => {
  return (
    <>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Paper
        sx={{
          p: 2,
          minWidth: 150,
          background: 'linear-gradient(135deg, #00bcd4 0%, #4dd0e1 100%)',
          color: 'white',
          textAlign: 'center',
          borderRadius: 2,
          boxShadow: 2,
        }}
      >
        <Typography variant="subtitle2" fontWeight={600}>
          🔗 {data?.label || 'Webhook'}
        </Typography>
        {data?.url && (
          <Typography variant="caption" sx={{ opacity: 0.9, wordBreak: 'break-all' }}>
            {data.method || 'POST'} {new URL(data.url).hostname}
          </Typography>
        )}
      </Paper>
    </>
  )
})
WebhookNode.displayName = 'WebhookNode'
