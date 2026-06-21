import type { Connection, Edge, XYPosition } from '@xyflow/react'
import {
  DIRECT_EDGE_LABEL,
  DIRECT_SOURCE_HANDLE_ID,
  TARGET_HANDLE_BOTTOM,
  TARGET_HANDLE_LEFT,
  TARGET_HANDLE_RIGHT,
  TARGET_HANDLE_TOP,
  decisionNodeTypes,
  nodeLayoutHeight,
  nodeLayoutWidth,
} from '../constants/flow'
import type {
  DecisionAction,
  DecisionEdge,
  DecisionNode,
  DecisionNodeData,
  DecisionNodeType,
  DecisionOption,
  DecisionParameterUpdate,
  DecisionTool,
  DirectSourcePosition,
  LegacyDecisionNodeData,
  TargetHandleId,
} from '../types/flow'

export const isEditableElement = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

export const getClientPositionFromEvent = (
  event: MouseEvent | TouchEvent,
): XYPosition | null => {
  if ('changedTouches' in event) {
    const touch = event.changedTouches[0]

    return touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  return { x: event.clientX, y: event.clientY }
}

export const clampNumber = (value: number, min: number, max: number) => {
  const lowerBound = Math.min(min, max)
  const upperBound = Math.max(min, max)

  return Math.min(Math.max(value, lowerBound), upperBound)
}

const stepIdPattern = /^STEP-(\d+)$/

export const getNextStepId = (stepIds: Iterable<string>) => {
  let highestStepNumber = 0

  for (const stepId of stepIds) {
    const stepIdMatch = stepId.match(stepIdPattern)

    if (!stepIdMatch) {
      continue
    }

    const stepNumber = Number(stepIdMatch[1])

    if (Number.isFinite(stepNumber)) {
      highestStepNumber = Math.max(highestStepNumber, stepNumber)
    }
  }

  return `STEP-${String(highestStepNumber + 1).padStart(3, '0')}`
}

// מחשב את השלבים הקודמים והבאים לפי החיבורים בפועל בקנבס.
export const getPreviousStepIds = (stepId: string, edges: Edge[]) => [
  ...new Set(edges.filter((edge) => edge.target === stepId).map((edge) => edge.source)),
]

export const getNextStepIds = (stepId: string, edges: Edge[]) => [
  ...new Set(edges.filter((edge) => edge.source === stepId).map((edge) => edge.target)),
]

export const supportsOptions = (nodeType: DecisionNodeType) =>
  nodeType !== 'end'

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const isDecisionNodeType = (value: unknown): value is DecisionNodeType =>
  typeof value === 'string' && decisionNodeTypes.has(value as DecisionNodeType)

export const getStringValue = (value: unknown) =>
  typeof value === 'string' ? value : ''

export const createNodeData = (nodeType: DecisionNodeType): DecisionNodeData => ({
  nodeType,
  script: '',
  options: [],
  images: [],
  links: [],
  parameterUpdates: [],
  actions: [],
  tools: [],
})

const normalizeOptions = (
  options: Array<DecisionOption | string> | undefined,
): DecisionOption[] =>
  (options ?? []).map((option, optionIndex) =>
    typeof option === 'string'
      ? { id: `option-${optionIndex + 1}`, label: option }
      : option,
  )

const normalizeParameterUpdates = (
  parameterUpdates: Array<Partial<DecisionParameterUpdate>> | undefined,
): DecisionParameterUpdate[] =>
  (parameterUpdates ?? []).map((parameterUpdate, parameterUpdateIndex) => ({
    id: parameterUpdate.id ?? `parameter-${parameterUpdateIndex + 1}`,
    name: parameterUpdate.name ?? '',
    value: parameterUpdate.value ?? '',
  }))

const normalizeActions = (
  actions: Array<Partial<DecisionAction>> | undefined,
): DecisionAction[] =>
  (actions ?? []).map((action, actionIndex) => ({
    id: action.id ?? `action-${actionIndex + 1}`,
    name: action.name ?? '',
  }))

const normalizeTools = (
  tools: Array<Partial<DecisionTool>> | undefined,
): DecisionTool[] =>
  (tools ?? []).map((tool, toolIndex) => ({
    id: tool.id ?? `tool-${toolIndex + 1}`,
    name: tool.name ?? '',
  }))

// מאפשר לפתוח YAML ישן או node data חלקי בלי לשבור את העורך.
export const normalizeNodeData = (
  data: DecisionNodeData | LegacyDecisionNodeData,
): DecisionNodeData => {
  const legacyImageKey = 'imageKey' in data ? data.imageKey?.trim() : undefined

  return {
    nodeType: data.nodeType ?? 'question',
    script: data.script ?? '',
    options: normalizeOptions(data.options),
    images:
      data.images ??
      (legacyImageKey ? [{ id: 'image-1', key: legacyImageKey, title: '' }] : []),
    links: data.links ?? [],
    parameterUpdates: normalizeParameterUpdates(data.parameterUpdates),
    actions: normalizeActions(data.actions),
    tools: normalizeTools(data.tools),
    edgeHighlightRole: data.edgeHighlightRole,
    highlightedOptionId: data.highlightedOptionId,
    isEntryNode: data.isEntryNode,
    isMultiSelected: data.isMultiSelected,
    directSourcePosition: data.directSourcePosition,
    onAddOption: data.onAddOption,
    onDeleteNode: data.onDeleteNode,
    onDeleteOption: data.onDeleteOption,
    onOptionLabelChange: data.onOptionLabelChange,
    onScriptChange: data.onScriptChange,
    onToggleMultiSelect: data.onToggleMultiSelect,
  }
}

export const isDirectSourceHandle = (sourceHandle: string | null | undefined) =>
  sourceHandle === null ||
  sourceHandle === undefined ||
  sourceHandle === DIRECT_SOURCE_HANDLE_ID

export const getOptionEdgeLabel = (optionLabel: string) =>
  optionLabel.trim() || 'אפשרות ללא טקסט'

const getEdgeLabel = (
  sourceData: DecisionNodeData,
  sourceHandle?: string | null,
) => {
  if (isDirectSourceHandle(sourceHandle)) {
    return DIRECT_EDGE_LABEL
  }

  const option = sourceData.options.find(
    (currentOption) => currentOption.id === sourceHandle,
  )

  return option ? getOptionEdgeLabel(option.label) : ''
}

export const getNodeDataById = (nodes: DecisionNode[], nodeId: string) => {
  const node = nodes.find((currentNode) => currentNode.id === nodeId)

  return node ? normalizeNodeData(node.data) : null
}

export const getOutgoingEdgeForHandle = (
  edges: DecisionEdge[],
  sourceId: string,
  sourceHandle: string,
) =>
  edges.find(
    (edge) =>
      edge.source === sourceId &&
      (edge.sourceHandle ?? DIRECT_SOURCE_HANDLE_ID) === sourceHandle,
  )

export const canCreateOutgoingConnection = (
  sourceId: string,
  sourceHandle: string | null | undefined,
  nodes: DecisionNode[],
  edges: DecisionEdge[],
) => {
  const sourceData = getNodeDataById(nodes, sourceId)

  if (!sourceData || sourceData.nodeType === 'end') {
    return false
  }

  const normalizedSourceHandle = isDirectSourceHandle(sourceHandle)
    ? DIRECT_SOURCE_HANDLE_ID
    : sourceHandle

  if (sourceData.options.length > 0) {
    if (normalizedSourceHandle === DIRECT_SOURCE_HANDLE_ID) {
      return false
    }

    if (
      !sourceData.options.some(
        (option) => option.id === normalizedSourceHandle,
      )
    ) {
      return false
    }
  } else if (normalizedSourceHandle !== DIRECT_SOURCE_HANDLE_ID) {
    return false
  }

  return !edges.some(
    (edge) =>
      edge.source === sourceId &&
      (edge.sourceHandle ?? DIRECT_SOURCE_HANDLE_ID) === normalizedSourceHandle,
  )
}

const getNodeCenterPosition = (node: DecisionNode) => ({
  x:
    node.position.x +
    (typeof node.width === 'number' ? node.width : nodeLayoutWidth) / 2,
  y:
    node.position.y +
    (typeof node.height === 'number' ? node.height : nodeLayoutHeight) / 2,
})

const getNodePositionDelta = (sourceNode: DecisionNode, targetNode: DecisionNode) => {
  const sourceCenter = getNodeCenterPosition(sourceNode)
  const targetCenter = getNodeCenterPosition(targetNode)

  return {
    x: targetCenter.x - sourceCenter.x,
    y: targetCenter.y - sourceCenter.y,
  }
}

const getPreferredTargetHandle = (
  sourceNode: DecisionNode,
  targetNode: DecisionNode,
): TargetHandleId => {
  const delta = getNodePositionDelta(sourceNode, targetNode)

  if (Math.abs(delta.y) >= Math.abs(delta.x)) {
    return delta.y >= 0 ? TARGET_HANDLE_TOP : TARGET_HANDLE_BOTTOM
  }

  return delta.x >= 0 ? TARGET_HANDLE_LEFT : TARGET_HANDLE_RIGHT
}

const getPreferredDirectSourcePosition = (
  sourceNode: DecisionNode,
  targetNode: DecisionNode,
): DirectSourcePosition => {
  const delta = getNodePositionDelta(sourceNode, targetNode)

  return delta.y > 0 && Math.abs(delta.y) >= Math.abs(delta.x)
    ? 'bottom'
    : 'left'
}

export const getConnectionWithPreferredHandles = (
  connection: Connection,
  nodes: DecisionNode[],
): Connection => {
  const sourceNode = nodes.find((node) => node.id === connection.source)
  const targetNode = nodes.find((node) => node.id === connection.target)

  if (!sourceNode || !targetNode) {
    return connection
  }

  return {
    ...connection,
    targetHandle: getPreferredTargetHandle(sourceNode, targetNode),
  }
}

const getPreferredTargetHandleForEdge = (
  edge: DecisionEdge,
  nodes: DecisionNode[],
) => {
  const sourceNode = nodes.find((node) => node.id === edge.source)
  const targetNode = nodes.find((node) => node.id === edge.target)

  return sourceNode && targetNode
    ? getPreferredTargetHandle(sourceNode, targetNode)
    : edge.targetHandle
}

export const getDirectSourcePositionForNode = (
  node: DecisionNode,
  nodes: DecisionNode[],
  edges: DecisionEdge[],
): DirectSourcePosition => {
  const directEdge = getOutgoingEdgeForHandle(edges, node.id, DIRECT_SOURCE_HANDLE_ID)
  const targetNode = directEdge
    ? nodes.find((currentNode) => currentNode.id === directEdge.target)
    : null

  return targetNode ? getPreferredDirectSourcePosition(node, targetNode) : 'left'
}

export const createDecisionEdge = (
  connection: Connection,
  sourceData: DecisionNodeData,
): DecisionEdge => {
  const sourceHandle = isDirectSourceHandle(connection.sourceHandle)
    ? DIRECT_SOURCE_HANDLE_ID
    : connection.sourceHandle

  return {
    ...connection,
    id: `${connection.source}:${sourceHandle}:${connection.target}:${
      connection.targetHandle ?? 'target'
    }`,
    sourceHandle,
    label: getEdgeLabel(sourceData, sourceHandle),
    type: 'deletable',
  }
}

// כללי החיבור נשמרים במקום אחד כדי שהקנבס, הייבוא והעריכה הצדדית יתנהגו אותו דבר.
export const isDecisionConnectionValid = (
  connection: Connection,
  nodes: DecisionNode[],
  edges: DecisionEdge[],
  entryNodeId: string,
) => {
  if (connection.source === connection.target) {
    return false
  }

  if (entryNodeId && connection.target === entryNodeId) {
    return false
  }

  const sourceData = getNodeDataById(nodes, connection.source)

  if (!sourceData || !getNodeDataById(nodes, connection.target)) {
    return false
  }

  if (sourceData.nodeType === 'end') {
    return false
  }

  const sourceHandle = connection.sourceHandle

  if (sourceData.options.length > 0) {
    if (isDirectSourceHandle(sourceHandle)) {
      return false
    }

    if (!sourceData.options.some((option) => option.id === sourceHandle)) {
      return false
    }
  } else if (!isDirectSourceHandle(sourceHandle)) {
    return false
  }

  const normalizedSourceHandle = isDirectSourceHandle(sourceHandle)
    ? DIRECT_SOURCE_HANDLE_ID
    : sourceHandle

  return !edges.some(
    (edge) =>
      edge.source === connection.source &&
      (edge.sourceHandle ?? DIRECT_SOURCE_HANDLE_ID) === normalizedSourceHandle,
  )
}

export const normalizeEdgesForNodes = (
  edges: DecisionEdge[],
  nodes: DecisionNode[],
  entryNodeId: string,
) => {
  const nextEdges: DecisionEdge[] = []
  const usedOutgoingHandles = new Set<string>()
  let didChange = false

  for (const edge of edges) {
    if (edge.source === edge.target) {
      didChange = true
      continue
    }

    if (entryNodeId && edge.target === entryNodeId) {
      didChange = true
      continue
    }

    const sourceData = getNodeDataById(nodes, edge.source)

    if (!sourceData || !getNodeDataById(nodes, edge.target)) {
      didChange = true
      continue
    }

    if (sourceData.nodeType === 'end') {
      didChange = true
      continue
    }

    const normalizedSourceHandle = isDirectSourceHandle(edge.sourceHandle)
      ? DIRECT_SOURCE_HANDLE_ID
      : edge.sourceHandle

    const option = sourceData.options.find(
      (currentOption) => currentOption.id === normalizedSourceHandle,
    )
    const hasOptions = sourceData.options.length > 0
    const isValidHandle = hasOptions
      ? Boolean(option)
      : normalizedSourceHandle === DIRECT_SOURCE_HANDLE_ID

    if (!isValidHandle) {
      didChange = true
      continue
    }

    const outgoingHandleKey = `${edge.source}:${normalizedSourceHandle}`

    if (usedOutgoingHandles.has(outgoingHandleKey)) {
      didChange = true
      continue
    }

    usedOutgoingHandles.add(outgoingHandleKey)

    const label = option ? getOptionEdgeLabel(option.label) : DIRECT_EDGE_LABEL
    const preferredTargetHandle = getPreferredTargetHandleForEdge(edge, nodes)

    if (
      edge.label !== label ||
      edge.sourceHandle !== normalizedSourceHandle ||
      edge.targetHandle !== preferredTargetHandle ||
      edge.type !== 'deletable'
    ) {
      nextEdges.push({
        ...edge,
        label,
        sourceHandle: normalizedSourceHandle,
        targetHandle: preferredTargetHandle ?? null,
        type: 'deletable',
      })
      didChange = true
    } else {
      nextEdges.push(edge)
    }
  }

  return didChange ? nextEdges : edges
}
