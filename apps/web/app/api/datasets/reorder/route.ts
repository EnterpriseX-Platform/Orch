import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const reorderSchema = z.object({
  // The dataset being moved
  id: z.string(),
  // New parent (null = root level)
  parentId: z.string().nullable(),
  // New sort order among siblings
  sortOrder: z.number(),
})

// PATCH /api/datasets/reorder - Reorder a dataset within its siblings
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, parentId, sortOrder } = reorderSchema.parse(body)

    // Verify the dataset exists
    const dataset = await prisma.dataCatalog.findUnique({ where: { id } })
    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    // Verify parent exists if specified
    if (parentId) {
      const parent = await prisma.dataCatalog.findUnique({ where: { id: parentId } })
      if (!parent) {
        return NextResponse.json({ error: 'Parent dataset not found' }, { status: 404 })
      }
      // Prevent circular: cannot move a node under itself or its descendants
      if (parentId === id) {
        return NextResponse.json({ error: 'Cannot move dataset under itself' }, { status: 400 })
      }
    }

    const oldParentId = dataset.parentId
    const oldSortOrder = dataset.sortOrder
    const isParentChanged = oldParentId !== parentId

    await prisma.$transaction(async (tx) => {
      if (isParentChanged) {
        // Moving to a different parent: close gap in old siblings
        await tx.dataCatalog.updateMany({
          where: {
            parentId: oldParentId,
            sortOrder: { gt: oldSortOrder },
          },
          data: { sortOrder: { decrement: 1 } },
        })

        // Make space in new siblings
        await tx.dataCatalog.updateMany({
          where: {
            parentId: parentId,
            sortOrder: { gte: sortOrder },
          },
          data: { sortOrder: { increment: 1 } },
        })
      } else {
        // Same parent: shift siblings between old and new positions
        if (sortOrder < oldSortOrder) {
          // Moving up: shift items between [new, old) down
          await tx.dataCatalog.updateMany({
            where: {
              parentId: parentId,
              id: { not: id },
              sortOrder: { gte: sortOrder, lt: oldSortOrder },
            },
            data: { sortOrder: { increment: 1 } },
          })
        } else if (sortOrder > oldSortOrder) {
          // Moving down: shift items between (old, new] up
          await tx.dataCatalog.updateMany({
            where: {
              parentId: parentId,
              id: { not: id },
              sortOrder: { gt: oldSortOrder, lte: sortOrder },
            },
            data: { sortOrder: { decrement: 1 } },
          })
        }
      }

      // Update the moved dataset
      await tx.dataCatalog.update({
        where: { id },
        data: { parentId, sortOrder },
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }
    console.error('Error reordering dataset:', error)
    return NextResponse.json({ error: 'Failed to reorder dataset' }, { status: 500 })
  }
}
