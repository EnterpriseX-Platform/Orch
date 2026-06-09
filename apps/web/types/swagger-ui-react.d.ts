declare module 'swagger-ui-react' {
  import { ComponentType } from 'react'
  interface SwaggerUIProps {
    spec?: Record<string, any>
    url?: string
    docExpansion?: 'list' | 'full' | 'none'
    defaultModelsExpandDepth?: number
    tryItOutEnabled?: boolean
    [key: string]: any
  }
  const SwaggerUI: ComponentType<SwaggerUIProps>
  export default SwaggerUI
}
