import type { Edge } from '@xyflow/react'

export const getPreviousStepIds = (stepId: string, edges: Edge[]) => [
  ...new Set(edges.filter((edge) => edge.target === stepId).map((edge) => edge.source)),
]

export const getNextStepIds = (stepId: string, edges: Edge[]) => [
  ...new Set(edges.filter((edge) => edge.source === stepId).map((edge) => edge.target)),
]
