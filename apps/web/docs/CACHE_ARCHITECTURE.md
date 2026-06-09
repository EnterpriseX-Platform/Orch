# Cache Architecture & Big Data Solution

## Overview

Orch supports large datasets through a multi-level caching and data management strategy.

## Cache Layers (L1-L5)

```
┌─────────────────────────────────────────────────────────────┐
│  L1: Browser Cache (Client-Side)                            │
│  ├── API Response Cache (TanStack Query)                    │
│  ├── Dataset List (5 min TTL)                               │
│  └── Metadata (10 min TTL)                                  │
├─────────────────────────────────────────────────────────────┤
│  L2: CDN / Edge Cache (CloudFlare/AWS)                      │
│  ├── Static Dataset Exports                                 │
│  ├── Download URLs (Pre-signed)                             │
│  └── TTL: 30 min - 24 hours                                 │
├─────────────────────────────────────────────────────────────┤
│  L3: Redis Cache (Server-Side)                              │
│  ├── Dataset Metadata (1 hour TTL)                          │
│  ├── Query Results (5 min TTL)                              │
│  ├── Hot Datasets (LRU Cache)                               │
│  └── Session Data                                           │
├─────────────────────────────────────────────────────────────┤
│  L4: Application Memory (In-Memory)                         │
│  ├── Dataset Schema Definitions                             │
│  ├── API Configurations                                     │
│  └── Connection Pools                                       │
├─────────────────────────────────────────────────────────────┤
│  L5: Database (PostgreSQL)                                  │
│  ├── Main Data Tables                                       │
│  ├── Partitioned Tables (by date)                           │
│  └── Materialized Views                                     │
└─────────────────────────────────────────────────────────────┘
```

## Big Data Solutions

### 1. **Pagination & Streaming**

```typescript
// Server-side pagination
GET /api/datasets?page=1&limit=50
GET /api/datasets/{id}/data?cursor=xxx&limit=1000

// Streaming for large exports
GET /api/datasets/{id}/export/stream
```

### 2. **Data Partitioning Strategy**

```sql
-- Partition by date for audit logs
CREATE TABLE audit_events (
    id UUID,
    timestamp TIMESTAMPTZ,
    data JSONB
) PARTITION BY RANGE (timestamp);

-- Monthly partitions
CREATE TABLE audit_events_2024_01 PARTITION OF audit_events
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

### 3. **Cache Warming Strategy**

```typescript
// Warm cache on startup
async function warmCache() {
  // 1. Load hot datasets
  const hotDatasets = await getHotDatasets();
  for (const ds of hotDatasets) {
    await redis.setex(`dataset:${ds.id}`, 3600, JSON.stringify(ds));
  }
  
  // 2. Pre-compute common queries
  const commonQueries = await getCommonQueries();
  for (const query of commonQueries) {
    await cacheQueryResult(query);
  }
}
```

### 4. **Cache Invalidation**

```typescript
// On dataset update
async function updateDataset(id: string, data: any) {
  // 1. Update database
  await db.update('datasets', id, data);
  
  // 2. Invalidate caches (Cascade)
  await redis.del(`dataset:${id}`);           // L3
  await redis.del('datasets:list');            // L3
  await invalidateBrowserCache(id);            // L1
  await purgeCDNCache(`/api/datasets/${id}`);  // L2
}
```

## Implementation Guide

### Redis Configuration

```typescript
// lib/redis.ts
import Redis from 'ioredis';

export const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

// Cache helpers
export async function getCached<T>(key: string): Promise<T | null> {
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

export async function setCached<T>(key: string, value: T, ttl: number): Promise<void> {
  await redis.setex(key, ttl, JSON.stringify(value));
}

export async function invalidatePattern(pattern: string): Promise<void> {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
```

### Query with Cache

```typescript
// lib/api.ts
export const datasetApi = {
  async getById(id: string) {
    // Try cache first
    const cached = await getCached<Dataset>(`dataset:${id}`);
    if (cached) return cached;
    
    // Fetch from DB
    const data = await db.query('SELECT * FROM datasets WHERE id = $1', [id]);
    
    // Cache result
    await setCached(`dataset:${id}`, data, 3600); // 1 hour
    
    return data;
  },
  
  async list(params: PaginationParams) {
    const cacheKey = `datasets:list:${JSON.stringify(params)}`;
    
    const cached = await getCached<PaginatedResponse<Dataset>>(cacheKey);
    if (cached) return cached;
    
    const data = await db.query('SELECT * FROM datasets LIMIT $1 OFFSET $2', 
      [params.limit, params.offset]);
    
    await setCached(cacheKey, data, 300); // 5 minutes
    
    return data;
  }
};
```

### Streaming Large Data

```typescript
// app/api/datasets/[id]/export/route.ts
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const datasetId = params.id;
  
  // Stream response
  const stream = new ReadableStream({
    async start(controller) {
      const cursor = db.queryCursor('SELECT * FROM dataset_data WHERE dataset_id = $1', [datasetId]);
      
      controller.enqueue('[');
      let first = true;
      
      for await (const row of cursor) {
        if (!first) controller.enqueue(',');
        controller.enqueue(JSON.stringify(row));
        first = false;
      }
      
      controller.enqueue(']');
      controller.close();
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/json',
      'Transfer-Encoding': 'chunked',
    }
  });
}
```

## Monitoring

```typescript
// Cache metrics
interface CacheMetrics {
  hitRate: number;      // Cache hit percentage
  missRate: number;     // Cache miss percentage
  evictedKeys: number;  // Keys removed due to memory
  memoryUsage: number;  // Redis memory usage
  avgLatency: number;   // Average cache access time
}
```
