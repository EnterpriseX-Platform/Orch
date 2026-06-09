"use client"

import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="top-right"
      toastOptions={{
        style: {
          background: '#fff',
          border: '1px solid #e0e0e0',
          borderRadius: '8px',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
