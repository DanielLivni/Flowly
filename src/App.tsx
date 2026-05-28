import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react'
import {
  addEdge,
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  SelectionMode,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type EdgeProps,
  type EdgeTypes,
  getSmoothStepPath,
  type IsValidConnection,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
  type Viewport,
  useEdgesState,
  useNodesState,
  useUpdateNodeInternals,
} from '@xyflow/react'
import dagre from 'dagre'
import { parse, stringify } from 'yaml'
import '@xyflow/react/dist/style.css'
import { getNextStepIds, getPreviousStepIds } from './flowGraph'
import './App.css'

type DecisionNodeType = 'question' | 'choice' | 'instruction' | 'note' | 'end'

type CanvasMode = 'pan' | 'select'

type DecisionOption = {
  id: string
  label: string
}

type DecisionImage = {
  id: string
  key: string
  title: string
}

type DecisionLink = {
  id: string
  label: string
  itemId: string
}

type DecisionNodeData = {
  nodeType: DecisionNodeType
  script: string
  options: DecisionOption[]
  images: DecisionImage[]
  links: DecisionLink[]
  edgeHighlightRole?: 'source' | 'target'
  highlightedOptionId?: string | null
  isEntryNode?: boolean
  isMultiSelected?: boolean
  onAddOption?: (nodeId: string) => void
  onScriptChange?: (nodeId: string, script: string) => void
  onToggleMultiSelect?: (nodeId: string, isSelected: boolean) => void
}

type LegacyDecisionNodeData = Partial<Omit<DecisionNodeData, 'options'>> & {
  nodeType?: DecisionNodeType
  imageKey?: string
  options?: Array<DecisionOption | string>
}

type DecisionNode = Node<DecisionNodeData, 'decision'>

type DecisionEdgeData = {
  onDelete?: (edgeId: string) => void
}

type DecisionEdge = Edge<DecisionEdgeData, 'deletable'>

type SidebarAction = {
  nodeType: DecisionNodeType
  label: string
}

type ScenarioMetadata = {
  scenarioDescription: string
  glassixKnowledgeItemName: string
  searchoItemName: string
  searchoItemUrl: string
  entryNodeId: string
}

type YamlExport = {
  scenario: {
    entryStepId: string
    glassixKnowledgeItemName: string
    searchoItemName: string
    searchoItemUrl: string
    description: string
  }
  steps: YamlExportStep[]
  _editor: {
    viewport: Viewport
    positions: Record<
      string,
      {
        x: number
        y: number
      }
    >
  }
}

type YamlExportStep = {
  id: string
  type: DecisionNodeType
  script: string
  images?: Array<{
    key: string
    title: string
  }>
  links?: Array<{
    label: string
    itemId: string
  }>
  options?: YamlExportOption[]
  next?: string
  navigation: {
    previousStepIds: string[]
    nextStepIds: string[]
  }
}

type YamlExportOption = {
  label: string
  next?: string
}

type ValidationMessage = {
  id: string
  text: string
  stepId?: string
}

type ValidationReport = {
  errors: ValidationMessage[]
  warnings: ValidationMessage[]
}

type ImportedStepOption = {
  label: string
  next: string
}

type ImportedStep = {
  id: string
  nodeType: DecisionNodeType
  script: string
  images: Array<Omit<DecisionImage, 'id'>>
  links: Array<Omit<DecisionLink, 'id'>>
  options: ImportedStepOption[]
  next: string
}

type ImportedFlow = {
  edges: DecisionEdge[]
  nextImageNumber: number
  nextLinkNumber: number
  nextOptionNumber: number
  nodes: DecisionNode[]
  scenarioMetadata: ScenarioMetadata
  shouldFitView: boolean
  viewport?: Viewport
}

type StepTargetInputProps = {
  label: string
  value: string
  datalistId: string
  candidateNodeIds: string[]
  onTargetChange: (targetId: string) => void
}

type EntryNodeSelectProps = {
  value: string
  nodes: DecisionNode[]
  onEntryNodeChange: (nodeId: string) => void
}

const typeLabels: Record<DecisionNodeType, string> = {
  question: 'שאלה',
  choice: 'בחירה',
  instruction: 'הנחיה',
  note: 'הערה',
  end: 'סיום',
}

const canvasModeLabels: Record<CanvasMode, string> = {
  pan: 'מצב הזזה',
  select: 'מצב סימון',
}

const canvasModeHelperText: Record<CanvasMode, string> = {
  pan: 'גרור את הרקע כדי לזוז במפה',
  select: 'גרור על הרקע כדי לסמן כמה שלבים',
}

const sidebarActions: SidebarAction[] = [
  { nodeType: 'question', label: 'הוסף שאלה' },
  { nodeType: 'choice', label: 'הוסף בחירה' },
  { nodeType: 'instruction', label: 'הוסף הנחיה' },
  { nodeType: 'note', label: 'הוסף הערה' },
  { nodeType: 'end', label: 'הוסף סיום' },
]

const decisionNodeTypes = new Set<DecisionNodeType>(
  sidebarActions.map((action) => action.nodeType),
)

const initialScenarioMetadata: ScenarioMetadata = {
  scenarioDescription: '',
  glassixKnowledgeItemName: '',
  searchoItemName: '',
  searchoItemUrl: '',
  entryNodeId: '',
}

const formatNodeId = (nodeNumber: number) =>
  `STEP-${String(nodeNumber).padStart(3, '0')}`

const stepIdPattern = /^STEP-(\d+)$/

const getHighestStepNumber = (stepIds: Iterable<string>) => {
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

  return highestStepNumber
}

const getNextStepId = (stepIds: Iterable<string>) =>
  formatNodeId(getHighestStepNumber(stepIds) + 1)

const DIRECT_SOURCE_HANDLE_ID = 'out'
const DIRECT_EDGE_LABEL = 'המשך'
const initialViewport: Viewport = { x: 40, y: 40, zoom: 0.95 }
const nodeLayoutWidth = 218
const nodeLayoutHeight = 140

const supportsOptions = (nodeType: DecisionNodeType) =>
  nodeType !== 'end'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isDecisionNodeType = (value: unknown): value is DecisionNodeType =>
  typeof value === 'string' && decisionNodeTypes.has(value as DecisionNodeType)

const getStringValue = (value: unknown) =>
  typeof value === 'string' ? value : ''

const getViewportFromUnknown = (value: unknown): Viewport | undefined => {
  if (!isRecord(value)) {
    return undefined
  }

  const { x, y, zoom } = value

  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof zoom !== 'number'
  ) {
    return undefined
  }

  return { x, y, zoom }
}

const createNodeData = (nodeType: DecisionNodeType): DecisionNodeData => ({
  nodeType,
  script: '',
  options: [],
  images: [],
  links: [],
})

const normalizeOptions = (
  options: Array<DecisionOption | string> | undefined,
): DecisionOption[] =>
  (options ?? []).map((option, optionIndex) =>
    typeof option === 'string'
      ? { id: `option-${optionIndex + 1}`, label: option }
      : option,
  )

const normalizeNodeData = (
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
    edgeHighlightRole: data.edgeHighlightRole,
    highlightedOptionId: data.highlightedOptionId,
    isEntryNode: data.isEntryNode,
    isMultiSelected: data.isMultiSelected,
    onAddOption: data.onAddOption,
    onScriptChange: data.onScriptChange,
    onToggleMultiSelect: data.onToggleMultiSelect,
  }
}

const isDirectSourceHandle = (sourceHandle: string | null | undefined) =>
  sourceHandle === null ||
  sourceHandle === undefined ||
  sourceHandle === DIRECT_SOURCE_HANDLE_ID

const getOptionEdgeLabel = (optionLabel: string) =>
  optionLabel.trim() || 'אפשרות ללא טקסט'

const getEdgeLabel = (sourceData: DecisionNodeData, sourceHandle?: string | null) => {
  if (isDirectSourceHandle(sourceHandle)) {
    return DIRECT_EDGE_LABEL
  }

  const option = sourceData.options.find((currentOption) => currentOption.id === sourceHandle)

  return option ? getOptionEdgeLabel(option.label) : ''
}

const getNodeDataById = (nodes: DecisionNode[], nodeId: string) => {
  const node = nodes.find((currentNode) => currentNode.id === nodeId)

  return node ? normalizeNodeData(node.data) : null
}

const isEditableElement = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

const getOutgoingEdgeForHandle = (
  edges: DecisionEdge[],
  sourceId: string,
  sourceHandle: string,
) =>
  edges.find(
    (edge) =>
      edge.source === sourceId &&
      (edge.sourceHandle ?? DIRECT_SOURCE_HANDLE_ID) === sourceHandle,
  )

const createDecisionEdge = (
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

const isDecisionConnectionValid = (
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

const normalizeEdgesForNodes = (
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

    if (
      edge.label !== label ||
      edge.sourceHandle !== normalizedSourceHandle ||
      edge.type !== 'deletable'
    ) {
      nextEdges.push({
        ...edge,
        label,
        sourceHandle: normalizedSourceHandle,
        type: 'deletable',
      })
      didChange = true
    } else {
      nextEdges.push(edge)
    }
  }

  return didChange ? nextEdges : edges
}

const validateFlowForYamlExport = (
  scenarioMetadata: ScenarioMetadata,
  nodes: DecisionNode[],
  edges: DecisionEdge[],
): ValidationReport => {
  const errors: ValidationMessage[] = []
  const warnings: ValidationMessage[] = []
  let validationMessageNumber = 1
  const createMessage = (text: string, stepId?: string): ValidationMessage => {
    const message: ValidationMessage = {
      id: `validation-${validationMessageNumber}`,
      text,
    }

    validationMessageNumber += 1

    if (stepId) {
      message.stepId = stepId
    }

    return message
  }
  const addError = (text: string, stepId?: string) =>
    errors.push(createMessage(text, stepId))
  const addWarning = (text: string, stepId?: string) =>
    warnings.push(createMessage(text, stepId))
  const nodeIds = nodes.map((node) => node.id)
  const nodeIdSet = new Set(nodeIds)
  const nodeIdCounts = nodeIds.reduce<Record<string, number>>((counts, nodeId) => {
    counts[nodeId] = (counts[nodeId] ?? 0) + 1

    return counts
  }, {})

  if (!scenarioMetadata.entryNodeId.trim()) {
    addError('חובה לבחור שלב פתיחה בפרטי התסריט.')
  } else if (!nodeIdSet.has(scenarioMetadata.entryNodeId)) {
    addError(`שלב הפתיחה ${scenarioMetadata.entryNodeId} לא קיים בקנבס.`)
  } else if (edges.some((edge) => edge.target === scenarioMetadata.entryNodeId)) {
    addError(
      `שלב הפתיחה ${scenarioMetadata.entryNodeId} לא יכול לקבל חיבורים נכנסים.`,
      scenarioMetadata.entryNodeId,
    )
  }

  nodes.forEach((node, nodeIndex) => {
    const nodeData = normalizeNodeData(node.data)
    const stepLabel = node.id.trim() || `שלב מספר ${nodeIndex + 1}`

    if (!node.id.trim()) {
      addError(`${stepLabel} ללא מזהה. יש להזין מזהה שלב.`)
    }

    if (nodeIdCounts[node.id] > 1) {
      addError(`מזהה השלב ${node.id || 'ריק'} מופיע יותר מפעם אחת.`, node.id)
    }

    if (!nodeData.script.trim()) {
      addError(`בשלב ${stepLabel} חסר טקסט לנציג.`, node.id)
    }

    if (nodeData.nodeType === 'end') {
      if (edges.some((edge) => edge.source === node.id)) {
        addError(`שלב סיום ${stepLabel} לא יכול לכלול חיבורים יוצאים.`, node.id)
      }

      return
    }

    if (nodeData.options.length > 0) {
      nodeData.options.forEach((option, optionIndex) => {
        const optionLabel = option.label.trim()
        const optionName = optionLabel || `אפשרות ${optionIndex + 1}`
        const optionEdge = getOutgoingEdgeForHandle(edges, node.id, option.id)

        if (!optionLabel) {
          addError(`בשלב ${stepLabel}, אפשרות ${optionIndex + 1} ללא טקסט.`, node.id)
        }

        if (!optionEdge) {
          addError(
            `בשלב ${stepLabel}, ${optionName} לא מחוברת לשלב יעד.`,
            node.id,
          )

          return
        }

        if (!nodeIdSet.has(optionEdge.target)) {
          addError(
            `בשלב ${stepLabel}, ${optionName} מחוברת לשלב יעד שלא קיים: ${optionEdge.target || 'ללא מזהה'}.`,
            node.id,
          )
        }
      })

      return
    }

    const directEdge = getOutgoingEdgeForHandle(edges, node.id, DIRECT_SOURCE_HANDLE_ID)

    if (!directEdge) {
      addError(`בשלב ${stepLabel} חסר חיבור "המשך" לשלב הבא.`, node.id)

      return
    }

    if (!nodeIdSet.has(directEdge.target)) {
      addError(
        `בשלב ${stepLabel}, חיבור "המשך" מצביע לשלב שלא קיים: ${directEdge.target || 'ללא מזהה'}.`,
        node.id,
      )
    }
  })

  edges.forEach((edge) => {
    if (!nodeIdSet.has(edge.source)) {
      addError(`יש חיבור שמתחיל משלב שלא קיים: ${edge.source || 'ללא מזהה'}.`)
    }

    if (!nodeIdSet.has(edge.target)) {
      addError(`יש חיבור שמצביע לשלב שלא קיים: ${edge.target || 'ללא מזהה'}.`)
    }
  })

  if (
    scenarioMetadata.entryNodeId &&
    nodeIdSet.has(scenarioMetadata.entryNodeId)
  ) {
    const reachableStepIds = new Set<string>([scenarioMetadata.entryNodeId])
    const stepIdsToVisit = [scenarioMetadata.entryNodeId]

    while (stepIdsToVisit.length > 0) {
      const currentStepId = stepIdsToVisit.shift()

      if (!currentStepId) {
        continue
      }

      edges
        .filter(
          (edge) =>
            edge.source === currentStepId &&
            nodeIdSet.has(edge.source) &&
            nodeIdSet.has(edge.target),
        )
        .forEach((edge) => {
          if (!reachableStepIds.has(edge.target)) {
            reachableStepIds.add(edge.target)
            stepIdsToVisit.push(edge.target)
          }
        })
    }

    nodes.forEach((node) => {
      if (node.id && !reachableStepIds.has(node.id)) {
        addWarning(
          `שלב ${node.id} לא נגיש משלב הפתיחה ${scenarioMetadata.entryNodeId}.`,
          node.id,
        )
      }
    })
  }

  nodes.forEach((node) => {
    const nodeData = normalizeNodeData(node.data)
    const stepLabel = node.id.trim() || 'שלב ללא מזהה'

    nodeData.images.forEach((image, imageIndex) => {
      if (!image.key.trim()) {
        addWarning(
          `בשלב ${stepLabel}, תמונה ${imageIndex + 1} חסרה מזהה תמונה.`,
          node.id,
        )
      }
    })

    nodeData.links.forEach((link, linkIndex) => {
      if (!link.label.trim() || !link.itemId.trim()) {
        addWarning(
          `בשלב ${stepLabel}, קישור ${linkIndex + 1} חסר שם קישור או מזהה קישור/URL.`,
          node.id,
        )
      }
    })
  })

  if (!scenarioMetadata.searchoItemUrl.trim()) {
    addWarning('קישור לפריט בסרצ׳ו ריק.')
  }

  if (!scenarioMetadata.scenarioDescription.trim()) {
    addWarning('תיאור כללי של התסריט ריק.')
  }

  return { errors, warnings }
}

const createAutoLayoutPositions = (
  steps: ImportedStep[],
  edges: Array<Pick<DecisionEdge, 'source' | 'target'>>,
) => {
  const graph = new dagre.graphlib.Graph()

  graph.setGraph({
    marginx: 80,
    marginy: 80,
    nodesep: 80,
    rankdir: 'LR',
    ranksep: 140,
  })
  graph.setDefaultEdgeLabel(() => ({}))

  steps.forEach((step) => {
    graph.setNode(step.id, {
      height: nodeLayoutHeight,
      width: nodeLayoutWidth,
    })
  })

  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target)
  })

  dagre.layout(graph)

  return Object.fromEntries(
    steps.map((step, stepIndex) => {
      const layoutNode = graph.node(step.id)
      const fallbackRow = Math.floor(stepIndex / 3)
      const fallbackColumn = stepIndex % 3

      return [
        step.id,
        {
          x:
            typeof layoutNode?.x === 'number'
              ? layoutNode.x - nodeLayoutWidth / 2
              : 80 + fallbackColumn * 280,
          y:
            typeof layoutNode?.y === 'number'
              ? layoutNode.y - nodeLayoutHeight / 2
              : 80 + fallbackRow * 180,
        },
      ]
    }),
  )
}

const getImportedEditorLayout = (editorValue: unknown) => {
  const positions: Record<string, { x: number; y: number }> = {}

  if (!isRecord(editorValue)) {
    return {
      hasEditorSection: false,
      positions,
      viewport: undefined,
    }
  }

  const positionsValue = editorValue.positions

  if (isRecord(positionsValue)) {
    Object.entries(positionsValue).forEach(([stepId, positionValue]) => {
      if (!isRecord(positionValue)) {
        return
      }

      const { x, y } = positionValue

      if (typeof x === 'number' && typeof y === 'number') {
        positions[stepId] = { x, y }
      }
    })
  }

  return {
    hasEditorSection: true,
    positions,
    viewport: getViewportFromUnknown(editorValue.viewport),
  }
}

const parseYamlImportText = (yamlText: string) => {
  const errors: string[] = []

  if (!yamlText.trim()) {
    return {
      errors: ['יש להדביק YAML או לבחור קובץ YAML לייבוא.'],
      flow: null,
    }
  }

  let parsedYaml: unknown

  try {
    parsedYaml = parse(yamlText)
  } catch {
    return {
      errors: ['קובץ ה-YAML אינו תקין. יש לבדוק את המבנה ולנסות שוב.'],
      flow: null,
    }
  }

  if (!isRecord(parsedYaml)) {
    return {
      errors: ['מבנה ה-YAML חייב להיות אובייקט עם scenario ו-steps.'],
      flow: null,
    }
  }

  const scenarioValue = parsedYaml.scenario
  const stepsValue = parsedYaml.steps

  if (!isRecord(scenarioValue)) {
    errors.push('חסר מקטע scenario או שהוא אינו תקין.')
  }

  if (!Array.isArray(stepsValue)) {
    errors.push('חסר מקטע steps או שהוא אינו מערך.')
  }

  if (errors.length > 0 || !isRecord(scenarioValue) || !Array.isArray(stepsValue)) {
    return { errors, flow: null }
  }

  const importedSteps: ImportedStep[] = []
  const stepIds = new Set<string>()
  const duplicatedStepIds = new Set<string>()

  stepsValue.forEach((stepValue, stepIndex) => {
    if (!isRecord(stepValue)) {
      errors.push(`שלב מספר ${stepIndex + 1} אינו אובייקט תקין.`)

      return
    }

    const stepId = getStringValue(stepValue.id)
    const stepType = stepValue.type
    const script = stepValue.script

    if (!stepId.trim()) {
      errors.push(`שלב מספר ${stepIndex + 1} חסר id.`)
    }

    if (stepId && stepIds.has(stepId)) {
      duplicatedStepIds.add(stepId)
    }

    if (stepId) {
      stepIds.add(stepId)
    }

    if (!isDecisionNodeType(stepType)) {
      errors.push(
        `בשלב ${stepId || stepIndex + 1}, type חייב להיות אחד מסוגי השלבים הנתמכים.`,
      )
    }

    if (typeof script !== 'string') {
      errors.push(`בשלב ${stepId || stepIndex + 1}, חסר script תקין.`)
    }

    const images: Array<Omit<DecisionImage, 'id'>> = []

    if (stepValue.images !== undefined) {
      if (!Array.isArray(stepValue.images)) {
        errors.push(`בשלב ${stepId || stepIndex + 1}, images חייב להיות מערך.`)
      } else {
        stepValue.images.forEach((imageValue, imageIndex) => {
          if (!isRecord(imageValue)) {
            errors.push(
              `בשלב ${stepId || stepIndex + 1}, תמונה ${imageIndex + 1} אינה תקינה.`,
            )

            return
          }

          images.push({
            key: getStringValue(imageValue.key),
            title: getStringValue(imageValue.title),
          })
        })
      }
    }

    const links: Array<Omit<DecisionLink, 'id'>> = []

    if (stepValue.links !== undefined) {
      if (!Array.isArray(stepValue.links)) {
        errors.push(`בשלב ${stepId || stepIndex + 1}, links חייב להיות מערך.`)
      } else {
        stepValue.links.forEach((linkValue, linkIndex) => {
          if (!isRecord(linkValue)) {
            errors.push(
              `בשלב ${stepId || stepIndex + 1}, קישור ${linkIndex + 1} אינו תקין.`,
            )

            return
          }

          links.push({
            itemId: getStringValue(linkValue.itemId),
            label: getStringValue(linkValue.label),
          })
        })
      }
    }

    const options: ImportedStepOption[] = []

    if (stepValue.options !== undefined) {
      if (!Array.isArray(stepValue.options)) {
        errors.push(`בשלב ${stepId || stepIndex + 1}, options חייב להיות מערך.`)
      } else {
        stepValue.options.forEach((optionValue, optionIndex) => {
          if (!isRecord(optionValue)) {
            errors.push(
              `בשלב ${stepId || stepIndex + 1}, אפשרות ${optionIndex + 1} אינה תקינה.`,
            )

            return
          }

          if (typeof optionValue.label !== 'string') {
            errors.push(
              `בשלב ${stepId || stepIndex + 1}, אפשרות ${optionIndex + 1} חסרה label.`,
            )
          }

          if (
            optionValue.next !== undefined &&
            typeof optionValue.next !== 'string'
          ) {
            errors.push(
              `בשלב ${stepId || stepIndex + 1}, next של אפשרות ${optionIndex + 1} אינו תקין.`,
            )
          }

          options.push({
            label: getStringValue(optionValue.label),
            next: getStringValue(optionValue.next),
          })
        })
      }
    }

    if (stepValue.next !== undefined && typeof stepValue.next !== 'string') {
      errors.push(`בשלב ${stepId || stepIndex + 1}, next חייב להיות טקסט.`)
    }

    if (stepId && isDecisionNodeType(stepType) && typeof script === 'string') {
      importedSteps.push({
        id: stepId,
        images,
        links,
        next: getStringValue(stepValue.next),
        nodeType: stepType,
        options,
        script,
      })
    }
  })

  duplicatedStepIds.forEach((stepId) => {
    errors.push(`מזהה השלב ${stepId} מופיע יותר מפעם אחת.`)
  })

  const entryStepId = getStringValue(scenarioValue.entryStepId)

  if (!entryStepId.trim()) {
    errors.push('חובה להגדיר scenario.entryStepId.')
  } else if (!stepIds.has(entryStepId)) {
    errors.push(`שלב הפתיחה ${entryStepId} לא קיים ברשימת השלבים.`)
  }

  importedSteps.forEach((step) => {
    if (step.nodeType === 'end') {
      return
    }

    if (step.options.length > 0) {
      step.options.forEach((option, optionIndex) => {
        if (option.next && !stepIds.has(option.next)) {
          errors.push(
            `בשלב ${step.id}, אפשרות ${optionIndex + 1} מצביעה לשלב שלא קיים: ${option.next}.`,
          )
        }
      })

      return
    }

    if (step.next && !stepIds.has(step.next)) {
      errors.push(`בשלב ${step.id}, next מצביע לשלב שלא קיים: ${step.next}.`)
    }
  })

  if (errors.length > 0) {
    return { errors, flow: null }
  }

  const scenarioMetadata: ScenarioMetadata = {
    entryNodeId: entryStepId,
    glassixKnowledgeItemName: getStringValue(
      scenarioValue.glassixKnowledgeItemName,
    ),
    scenarioDescription: getStringValue(scenarioValue.description),
    searchoItemName: getStringValue(scenarioValue.searchoItemName),
    searchoItemUrl: getStringValue(scenarioValue.searchoItemUrl),
  }
  const importedEditorLayout = getImportedEditorLayout(parsedYaml._editor)
  const edgeDrafts = importedSteps.flatMap((step) => {
    if (step.nodeType === 'end') {
      return []
    }

    if (step.options.length > 0) {
      return step.options.flatMap((option) =>
        option.next ? [{ source: step.id, target: option.next }] : [],
      )
    }

    return step.next ? [{ source: step.id, target: step.next }] : []
  })
  const fallbackPositions = createAutoLayoutPositions(importedSteps, edgeDrafts)
  const nodes: DecisionNode[] = importedSteps.map((step) => {
    const savedPosition = importedEditorLayout.positions[step.id]
    const fallbackPosition = fallbackPositions[step.id] ?? { x: 80, y: 80 }

    return {
      id: step.id,
      position: savedPosition ?? fallbackPosition,
      selected: false,
      type: 'decision',
      data: {
        images: step.images.map((image, imageIndex) => ({
          ...image,
          id: `image-${imageIndex + 1}`,
        })),
        links: step.links.map((link, linkIndex) => ({
          ...link,
          id: `link-${linkIndex + 1}`,
        })),
        nodeType: step.nodeType,
        options: step.options.map((option, optionIndex) => ({
          id: `option-${optionIndex + 1}`,
          label: option.label,
        })),
        script: step.script,
      },
    }
  })
  const importedNodeDataById = new Map(
    nodes.map((node) => [node.id, normalizeNodeData(node.data)]),
  )
  const edges = importedSteps.flatMap((step): DecisionEdge[] => {
    if (step.nodeType === 'end') {
      return []
    }

    const sourceData = importedNodeDataById.get(step.id)

    if (!sourceData) {
      return []
    }

    if (step.options.length > 0) {
      return step.options.flatMap((option, optionIndex) => {
        if (!option.next) {
          return []
        }

        return [
          createDecisionEdge(
            {
              source: step.id,
              sourceHandle: `option-${optionIndex + 1}`,
              target: option.next,
              targetHandle: null,
            },
            sourceData,
          ),
        ]
      })
    }

    if (!step.next) {
      return []
    }

    return [
      createDecisionEdge(
        {
          source: step.id,
          sourceHandle: DIRECT_SOURCE_HANDLE_ID,
          target: step.next,
          targetHandle: null,
        },
        sourceData,
      ),
    ]
  })
  const maxOptionCount = Math.max(0, ...importedSteps.map((step) => step.options.length))
  const maxImageCount = Math.max(0, ...importedSteps.map((step) => step.images.length))
  const maxLinkCount = Math.max(0, ...importedSteps.map((step) => step.links.length))

  return {
    errors: [],
    flow: {
      edges,
      nextImageNumber: maxImageCount + 1,
      nextLinkNumber: maxLinkCount + 1,
      nextOptionNumber: maxOptionCount + 1,
      nodes,
      scenarioMetadata,
      shouldFitView: !importedEditorLayout.hasEditorSection,
      viewport: importedEditorLayout.viewport,
    },
  }
}

const buildYamlExport = (
  scenarioMetadata: ScenarioMetadata,
  nodes: DecisionNode[],
  edges: DecisionEdge[],
  viewport: Viewport,
): YamlExport => {
  const exportEdges = scenarioMetadata.entryNodeId
    ? edges.filter((edge) => edge.target !== scenarioMetadata.entryNodeId)
    : edges

  return {
    scenario: {
      entryStepId: scenarioMetadata.entryNodeId,
      glassixKnowledgeItemName: scenarioMetadata.glassixKnowledgeItemName,
      searchoItemName: scenarioMetadata.searchoItemName,
      searchoItemUrl: scenarioMetadata.searchoItemUrl,
      description: scenarioMetadata.scenarioDescription,
    },
    steps: nodes.map((node) => {
      const nodeData = normalizeNodeData(node.data)
      const step: YamlExportStep = {
        id: node.id,
        type: nodeData.nodeType,
        script: nodeData.script,
        navigation: {
          previousStepIds: getPreviousStepIds(node.id, exportEdges),
          nextStepIds: getNextStepIds(node.id, exportEdges),
        },
      }

      if (nodeData.images.length > 0) {
        step.images = nodeData.images.map((image) => ({
          key: image.key,
          title: image.title,
        }))
      }

      if (nodeData.links.length > 0) {
        step.links = nodeData.links.map((link) => ({
          label: link.label,
          itemId: link.itemId,
        }))
      }

      if (nodeData.nodeType === 'end') {
        return step
      }

      if (nodeData.options.length > 0) {
        step.options = nodeData.options.map((option) => {
          const targetStepId =
            getOutgoingEdgeForHandle(exportEdges, node.id, option.id)?.target ?? ''
          const exportOption: YamlExportOption = {
            label: option.label,
          }

          if (targetStepId) {
            exportOption.next = targetStepId
          }

          return exportOption
        })

        return step
      }

      const directTargetStepId =
        getOutgoingEdgeForHandle(exportEdges, node.id, DIRECT_SOURCE_HANDLE_ID)
          ?.target ?? ''

      if (directTargetStepId) {
        step.next = directTargetStepId
      }

      return step
    }),
    _editor: {
      viewport,
      positions: Object.fromEntries(
        nodes.map((node) => [
          node.id,
          {
            x: node.position.x,
            y: node.position.y,
          },
        ]),
      ),
    },
  }
}

const createYamlExportText = (
  scenarioMetadata: ScenarioMetadata,
  nodes: DecisionNode[],
  edges: DecisionEdge[],
  viewport: Viewport,
) =>
  stringify(buildYamlExport(scenarioMetadata, nodes, edges, viewport), {
    lineWidth: 0,
  })

const sanitizeYamlFileName = (fileName: string) =>
  fileName.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-')

const getYamlDownloadFileName = (scenarioMetadata: ScenarioMetadata) => {
  const baseFileName = sanitizeYamlFileName(
    scenarioMetadata.searchoItemName || scenarioMetadata.glassixKnowledgeItemName,
  )

  return `${baseFileName || 'decision-flow'}.yaml`
}

function DecisionTreeNode({ id, data, selected }: NodeProps<DecisionNode>) {
  const updateNodeInternals = useUpdateNodeInternals()
  const nodeData = normalizeNodeData(data)
  const scriptText = nodeData.script.trim()
  const [isEditingScript, setIsEditingScript] = useState(false)
  const [scriptDraft, setScriptDraft] = useState(nodeData.script)
  const scriptEditorRef = useRef<HTMLTextAreaElement | null>(null)
  const shouldSaveScriptOnBlurRef = useRef(true)
  const canHaveOutgoingHandles = supportsOptions(nodeData.nodeType)
  const hasOptionHandles = canHaveOutgoingHandles && nodeData.options.length > 0
  const hasRegularSourceHandle = canHaveOutgoingHandles && nodeData.options.length === 0
  const isMultiSelected = nodeData.isMultiSelected ?? selected
  const nodeClassName = [
    'decision-node',
    isMultiSelected ? 'decision-node--multi-selected' : '',
    nodeData.edgeHighlightRole ? 'decision-node--edge-highlighted' : '',
    nodeData.edgeHighlightRole === 'source' ? 'decision-node--edge-source' : '',
    nodeData.edgeHighlightRole === 'target' ? 'decision-node--edge-target' : '',
  ]
    .filter(Boolean)
    .join(' ')

  useEffect(() => {
    updateNodeInternals(id)
  }, [nodeData.nodeType, nodeData.options.length, id, updateNodeInternals])

  useEffect(() => {
    if (isEditingScript) {
      scriptEditorRef.current?.focus()
      scriptEditorRef.current?.select()
    }
  }, [isEditingScript])

  const startScriptEditing = () => {
    shouldSaveScriptOnBlurRef.current = true
    setScriptDraft(nodeData.script)
    setIsEditingScript(true)
  }

  const saveScriptEditing = () => {
    nodeData.onScriptChange?.(id, scriptDraft)
    setIsEditingScript(false)
  }

  const cancelScriptEditing = () => {
    shouldSaveScriptOnBlurRef.current = false
    setScriptDraft(nodeData.script)
    setIsEditingScript(false)
  }

  return (
    <article
      className={nodeClassName}
      dir="rtl"
      onDoubleClick={(event) => {
        event.stopPropagation()
        startScriptEditing()
      }}
    >
      <label
        className="decision-node__select-control nodrag nopan"
        title="בחר שלב"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isMultiSelected}
          aria-label="בחר שלב"
          onChange={(event) =>
            nodeData.onToggleMultiSelect?.(id, event.currentTarget.checked)
          }
        />
      </label>

      <Handle
        type="target"
        position={Position.Right}
        className="decision-node__handle decision-node__target-handle"
      />

      <div className="decision-node__header">
        <span className="decision-node__id">{id}</span>
        <span className="decision-node__type">{typeLabels[nodeData.nodeType]}</span>
      </div>
      {nodeData.isEntryNode ? (
        <div className="decision-node__entry-badge">שלב פתיחה</div>
      ) : null}
      {isEditingScript ? (
        <textarea
          ref={scriptEditorRef}
          value={scriptDraft}
          dir="rtl"
          rows={4}
          className="decision-node__script-editor nodrag nopan"
          aria-label="עריכת טקסט לנציג"
          onBlur={() => {
            if (!shouldSaveScriptOnBlurRef.current) {
              shouldSaveScriptOnBlurRef.current = true

              return
            }

            saveScriptEditing()
          }}
          onChange={(event) => setScriptDraft(event.currentTarget.value)}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              cancelScriptEditing()

              return
            }

            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              saveScriptEditing()
            }
          }}
          onPointerDown={(event) => event.stopPropagation()}
        />
      ) : (
        <p className={scriptText ? 'decision-node__script' : 'decision-node__placeholder'}>
          {scriptText || 'טקסט התסריט יופיע כאן'}
        </p>
      )}

      {nodeData.images.length > 0 || nodeData.links.length > 0 ? (
        <div className="decision-node__summary" aria-label="תקציר נכסי מידע">
          {nodeData.images.length > 0 ? (
            <span>{`תמונות: ${nodeData.images.length}`}</span>
          ) : null}
          {nodeData.links.length > 0 ? (
            <span>{`קישורים: ${nodeData.links.length}`}</span>
          ) : null}
        </div>
      ) : null}

      {hasOptionHandles && nodeData.options.length > 0 ? (
        <div className="decision-node__options" aria-label="אפשרויות תשובה">
          {nodeData.options.map((option) => (
            <div
              key={option.id}
              className={[
                'decision-node__option-row',
                nodeData.highlightedOptionId === option.id
                  ? 'decision-node__option-row--selected'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span>{option.label.trim() || 'אפשרות ללא טקסט'}</span>
              <Handle
                type="source"
                id={option.id}
                position={Position.Left}
                className="decision-node__handle decision-node__option-handle"
              />
            </div>
          ))}
        </div>
      ) : null}

      {hasRegularSourceHandle ? (
        <Handle
          type="source"
          id={DIRECT_SOURCE_HANDLE_ID}
          position={Position.Left}
          className="decision-node__handle decision-node__regular-handle"
        />
      ) : null}

      {canHaveOutgoingHandles ? (
        <button
          type="button"
          className="decision-node__quick-add-option nodrag nopan"
          title="הוסף אפשרות"
          aria-label="הוסף אפשרות"
          onClick={(event) => {
            event.stopPropagation()
            nodeData.onAddOption?.(id)
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          +
        </button>
      ) : null}
    </article>
  )
}

function StepTargetInput({
  label,
  value,
  datalistId,
  candidateNodeIds,
  onTargetChange,
}: StepTargetInputProps) {
  const updateDraftTarget = (targetId: string) => {
    if (targetId === '' || candidateNodeIds.includes(targetId)) {
      onTargetChange(targetId)
    }
  }

  return (
    <label className="target-editor__field">
      <span>{label}</span>
      <input
        key={value}
        type="text"
        defaultValue={value}
        list={datalistId}
        dir="rtl"
        className="properties-panel__control"
        placeholder="בחר שלב"
        onChange={(event) => updateDraftTarget(event.currentTarget.value)}
      />
      <small>{`יעד נוכחי: ${value || 'אין'}`}</small>
    </label>
  )
}

function EntryNodeSelect({ value, nodes, onEntryNodeChange }: EntryNodeSelectProps) {
  const [searchText, setSearchText] = useState('')
  const normalizedSearchText = searchText.trim().toLowerCase()
  const filteredNodes = nodes.filter((node) => {
    const nodeData = normalizeNodeData(node.data)
    const searchableText = `${node.id} ${typeLabels[nodeData.nodeType]}`.toLowerCase()

    return node.id === value || searchableText.includes(normalizedSearchText)
  })

  return (
    <div className="entry-node-select">
      <label className="scenario-panel__field">
        <span>חיפוש שלב פתיחה</span>
        <input
          type="search"
          value={searchText}
          dir="rtl"
          placeholder="חפש לפי מזהה שלב"
          onChange={(event) => setSearchText(event.currentTarget.value)}
        />
      </label>

      <label className="scenario-panel__field">
        <span>שלב פתיחה</span>
        <select
          value={value}
          dir="rtl"
          onChange={(event) => onEntryNodeChange(event.currentTarget.value)}
        >
          <option value="">לא נבחר</option>
          {filteredNodes.map((node) => {
            const nodeData = normalizeNodeData(node.data)

            return (
              <option key={node.id} value={node.id}>
                {`${node.id} - ${typeLabels[nodeData.nodeType]}`}
              </option>
            )
          })}
        </select>
      </label>
    </div>
  )
}

function DeletableDecisionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerStart,
  markerEnd,
  style,
  label,
  labelStyle,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  selected,
  data,
}: EdgeProps<DecisionEdge>) {
  const [isHovered, setIsHovered] = useState(false)
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  const hasVisibleLabel = Boolean(label)
  const deleteButtonX = labelX
  const deleteButtonY = labelY - (hasVisibleLabel ? 34 : 20)
  const showDeleteButton = isHovered || selected

  return (
    <>
      <g
        className="deletable-edge"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <BaseEdge
          id={id}
          path={edgePath}
          markerStart={markerStart}
          markerEnd={markerEnd}
          style={style}
          label={label}
          labelX={labelX}
          labelY={labelY}
          labelStyle={labelStyle}
          labelBgStyle={labelBgStyle}
          labelBgPadding={labelBgPadding}
          labelBgBorderRadius={labelBgBorderRadius}
        />
      </g>

      <EdgeLabelRenderer>
        <button
          type="button"
          className={[
            'edge-delete-button nodrag nopan',
            showDeleteButton ? 'edge-delete-button--visible' : '',
            selected ? 'edge-delete-button--selected' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
            transform: `translate(-50%, -50%) translate(${deleteButtonX}px, ${deleteButtonY}px)`,
          }}
          aria-label="מחק חיבור"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={(event) => {
            event.stopPropagation()
            data?.onDelete?.(id)
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          ×
        </button>
      </EdgeLabelRenderer>
    </>
  )
}

const nodeTypes: NodeTypes = {
  decision: DecisionTreeNode as ComponentType<NodeProps>,
}

const edgeTypes: EdgeTypes = {
  deletable: DeletableDecisionEdge as EdgeTypes[string],
}

function App() {
  const reactFlowInstanceRef = useRef<ReactFlowInstance<DecisionNode, DecisionEdge> | null>(
    null,
  )
  const nextOptionNumber = useRef(1)
  const nextImageNumber = useRef(1)
  const nextLinkNumber = useRef(1)
  const [scenarioMetadata, setScenarioMetadata] = useState<ScenarioMetadata>(
    initialScenarioMetadata,
  )
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('pan')
  const [editorViewport, setEditorViewport] = useState<Viewport>(initialViewport)
  const [isScenarioPanelOpen, setIsScenarioPanelOpen] = useState(false)
  const [isYamlImportPanelOpen, setIsYamlImportPanelOpen] = useState(false)
  const [isYamlExportPanelOpen, setIsYamlExportPanelOpen] = useState(false)
  const [isValidationPanelOpen, setIsValidationPanelOpen] = useState(false)
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(
    null,
  )
  const [yamlImportText, setYamlImportText] = useState('')
  const [yamlImportErrors, setYamlImportErrors] = useState<string[]>([])
  const [yamlImportFileName, setYamlImportFileName] = useState('')
  const [yamlCopyMessage, setYamlCopyMessage] = useState('')
  const [appMessage, setAppMessage] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<DecisionNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<DecisionEdge>([])

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  )
  const selectedNodeData = useMemo(
    () => (selectedNode ? normalizeNodeData(selectedNode.data) : null),
    [selectedNode],
  )
  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  )
  const activeSelectedEdgeId = selectedEdge?.id ?? null
  const selectedNodeIds = useMemo(
    () => nodes.filter((node) => node.selected).map((node) => node.id),
    [nodes],
  )
  const selectedNodeCount = selectedNodeIds.length
  const targetCandidateNodes = useMemo(
    () =>
      nodes.filter(
        (node) =>
          node.id !== selectedNodeId && node.id !== scenarioMetadata.entryNodeId,
      ),
    [nodes, scenarioMetadata.entryNodeId, selectedNodeId],
  )
  const targetCandidateNodeIds = useMemo(
    () => targetCandidateNodes.map((node) => node.id),
    [targetCandidateNodes],
  )
  const isSelectionMode = canvasMode === 'select'
  const targetDatalistId = 'step-target-options'
  const generatedYamlText = useMemo(
    () => createYamlExportText(scenarioMetadata, nodes, edges, editorViewport),
    [edges, editorViewport, nodes, scenarioMetadata],
  )
  const hasValidationErrors = Boolean(validationReport?.errors.length)
  const hasValidationWarnings = Boolean(validationReport?.warnings.length)

  const deleteEdgeById = useCallback(
    (edgeId: string) => {
      setEdges((currentEdges) => currentEdges.filter((edge) => edge.id !== edgeId))
      setSelectedEdgeId((currentSelectedEdgeId) =>
        currentSelectedEdgeId === edgeId ? null : currentSelectedEdgeId,
      )
    },
    [setEdges],
  )

  const toggleNodeMultiSelection = useCallback(
    (nodeId: string, isSelected: boolean) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId ? { ...node, selected: isSelected } : node,
        ),
      )
    },
    [setNodes],
  )

  const updateNodeScript = useCallback(
    (nodeId: string, script: string) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...normalizeNodeData(node.data),
                  script,
                },
              }
            : node,
        ),
      )
    },
    [setNodes],
  )

  const addOptionToNode = useCallback(
    (nodeId: string) => {
      const newOption: DecisionOption = {
        id: `option-${nextOptionNumber.current}`,
        label: '',
      }

      nextOptionNumber.current += 1
      setSelectedNodeId(nodeId)
      setSelectedEdgeId(null)
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== nodeId) {
            return node
          }

          const nodeData = normalizeNodeData(node.data)

          if (!supportsOptions(nodeData.nodeType)) {
            return node
          }

          return {
            ...node,
            selected: true,
            data: {
              ...nodeData,
              options: [...nodeData.options, newOption],
            },
          }
        }),
      )
      setEdges((currentEdges) =>
        currentEdges.filter(
          (edge) =>
            edge.source !== nodeId || !isDirectSourceHandle(edge.sourceHandle),
        ),
      )
    },
    [setEdges, setNodes],
  )

  const displayNodes = useMemo<DecisionNode[]>(
    () =>
      nodes.map((node) => {
        const nodeData = normalizeNodeData(node.data)
        const commonNodeData = {
          ...nodeData,
          isEntryNode: node.id === scenarioMetadata.entryNodeId,
          isMultiSelected: Boolean(node.selected),
          onAddOption: addOptionToNode,
          onScriptChange: updateNodeScript,
          onToggleMultiSelect: toggleNodeMultiSelection,
        }

        if (!selectedEdge) {
          return {
            ...node,
            data: commonNodeData,
          }
        }

        const edgeHighlightRole =
          selectedEdge.source === node.id
            ? 'source'
            : selectedEdge.target === node.id
              ? 'target'
              : undefined
        const highlightedOptionId =
          selectedEdge.source === node.id &&
          !isDirectSourceHandle(selectedEdge.sourceHandle)
            ? selectedEdge.sourceHandle
            : null

        return {
          ...node,
          data: {
            ...commonNodeData,
            edgeHighlightRole,
            highlightedOptionId,
          },
        }
      }),
    [
      addOptionToNode,
      nodes,
      scenarioMetadata.entryNodeId,
      selectedEdge,
      toggleNodeMultiSelection,
      updateNodeScript,
    ],
  )
  const displayEdges = useMemo<DecisionEdge[]>(
    () =>
      edges.map((edge) => {
        const isSelected = edge.id === activeSelectedEdgeId

        return {
          ...edge,
          selected: isSelected,
          animated: isSelected,
          className: isSelected
            ? 'decision-edge decision-edge--selected'
            : 'decision-edge',
          style: {
            stroke: isSelected ? '#1d4ed8' : '#64748b',
            strokeWidth: isSelected ? 4 : 2,
          },
          labelStyle: {
            fill: isSelected ? '#1d4ed8' : '#334155',
            fontWeight: isSelected ? 800 : 700,
          },
          labelBgStyle: {
            fill: isSelected ? '#eff6ff' : '#ffffff',
            stroke: isSelected ? '#93c5fd' : '#dbe3ef',
          },
          labelBgPadding: [8, 4],
          labelBgBorderRadius: 6,
          type: 'deletable',
          data: {
            ...(edge.data ?? {}),
            onDelete: deleteEdgeById,
          },
        }
      }),
    [activeSelectedEdgeId, deleteEdgeById, edges],
  )

  useEffect(() => {
    setEdges((currentEdges) =>
      normalizeEdgesForNodes(currentEdges, nodes, scenarioMetadata.entryNodeId),
    )
  }, [nodes, scenarioMetadata.entryNodeId, setEdges])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (nodes.length === 0) {
        return
      }

      event.preventDefault()
      event.returnValue = 'אם לא ייצאת YAML, העבודה תאבד.'
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [nodes.length])

  const updateScenarioMetadata = useCallback(
    (metadataPatch: Partial<ScenarioMetadata>) => {
      setScenarioMetadata((currentMetadata) => ({
        ...currentMetadata,
        ...metadataPatch,
      }))
    },
    [],
  )

  const openYamlImportPanel = useCallback(() => {
    setYamlImportText('')
    setYamlImportErrors([])
    setYamlImportFileName('')
    setIsYamlImportPanelOpen(true)
  }, [])

  const applyImportedFlow = useCallback(
    (importedFlow: ImportedFlow) => {
      setNodes(importedFlow.nodes)
      setEdges(importedFlow.edges)
      setScenarioMetadata(importedFlow.scenarioMetadata)
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setValidationReport(null)
      setIsValidationPanelOpen(false)
      setIsYamlExportPanelOpen(false)
      setIsYamlImportPanelOpen(false)
      setYamlImportText('')
      setYamlImportErrors([])
      setYamlImportFileName('')
      setAppMessage('התסריט יובא בהצלחה')

      nextOptionNumber.current = importedFlow.nextOptionNumber
      nextImageNumber.current = importedFlow.nextImageNumber
      nextLinkNumber.current = importedFlow.nextLinkNumber

      window.requestAnimationFrame(() => {
        if (importedFlow.viewport) {
          setEditorViewport(importedFlow.viewport)
          void reactFlowInstanceRef.current?.setViewport(importedFlow.viewport, {
            duration: 0,
          })

          return
        }

        if (importedFlow.shouldFitView) {
          void reactFlowInstanceRef.current?.fitView({
            duration: 250,
            padding: 0.18,
          })
        }
      })
    },
    [setEdges, setNodes],
  )

  const importYamlText = useCallback(() => {
    const importResult = parseYamlImportText(yamlImportText)

    if (!importResult.flow) {
      setYamlImportErrors(importResult.errors)

      return
    }

    if (
      nodes.length > 0 &&
      !window.confirm('ייבוא הקובץ יחליף את התסריט הנוכחי. להמשיך?')
    ) {
      return
    }

    applyImportedFlow(importResult.flow)
  }, [applyImportedFlow, nodes.length, yamlImportText])

  const loadYamlImportFile = useCallback(
    async (file: File | undefined) => {
      if (!file) {
        return
      }

      try {
        const fileText = await file.text()

        setYamlImportText(fileText)
        setYamlImportFileName(file.name)
        setYamlImportErrors([])
      } catch {
        setYamlImportErrors(['לא ניתן לקרוא את הקובץ שנבחר.'])
      }
    },
    [],
  )

  const createNewScenario = useCallback(() => {
    const hasCurrentFlow = nodes.length > 0 || edges.length > 0

    if (
      hasCurrentFlow &&
      !window.confirm(
        'יצירת תסריט חדש תנקה את התסריט הנוכחי מהמסך. אם לא ייצאת YAML, העבודה תאבד. להמשיך?',
      )
    ) {
      return
    }

    setNodes([])
    setEdges([])
    setScenarioMetadata(initialScenarioMetadata)
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setValidationReport(null)
    setIsValidationPanelOpen(false)
    setIsYamlExportPanelOpen(false)
    setIsYamlImportPanelOpen(false)
    setYamlCopyMessage('')
    setYamlImportErrors([])
    setYamlImportFileName('')
    setYamlImportText('')
    setAppMessage('נוצר תסריט חדש. יש לייצא YAML כדי לשמור את העבודה.')
    setEditorViewport(initialViewport)

    nextOptionNumber.current = 1
    nextImageNumber.current = 1
    nextLinkNumber.current = 1

    void reactFlowInstanceRef.current?.setViewport(initialViewport, { duration: 250 })
  }, [edges.length, nodes.length, setEdges, setNodes])

  const openYamlExportPanelWithoutValidation = useCallback(() => {
    setYamlCopyMessage('')
    setValidationReport(null)
    setIsValidationPanelOpen(false)
    setIsYamlExportPanelOpen(true)
  }, [])

  const openYamlExportPanel = useCallback(() => {
    const nextValidationReport = validateFlowForYamlExport(
      scenarioMetadata,
      nodes,
      edges,
    )
    const hasValidationMessages =
      nextValidationReport.errors.length > 0 ||
      nextValidationReport.warnings.length > 0

    if (hasValidationMessages) {
      setValidationReport(nextValidationReport)
      setIsYamlExportPanelOpen(false)
      setIsValidationPanelOpen(true)

      return
    }

    openYamlExportPanelWithoutValidation()
  }, [edges, nodes, openYamlExportPanelWithoutValidation, scenarioMetadata])

  const continueYamlExportAfterWarnings = useCallback(() => {
    openYamlExportPanelWithoutValidation()
  }, [openYamlExportPanelWithoutValidation])

  const focusValidationStep = useCallback(
    (stepId: string) => {
      const node = nodes.find((currentNode) => currentNode.id === stepId)

      if (!node) {
        return
      }

      setSelectedNodeId(stepId)
      setSelectedEdgeId(null)
      setNodes((currentNodes) =>
        currentNodes.map((currentNode) => ({
          ...currentNode,
          selected: currentNode.id === stepId,
        })),
      )

      const nodeWidth = typeof node.width === 'number' ? node.width : 218
      const nodeHeight = typeof node.height === 'number' ? node.height : 140
      const viewport = reactFlowInstanceRef.current?.getViewport() ?? editorViewport

      void reactFlowInstanceRef.current?.setCenter(
        node.position.x + nodeWidth / 2,
        node.position.y + nodeHeight / 2,
        { zoom: viewport.zoom, duration: 350 },
      )
      setIsValidationPanelOpen(false)
    },
    [editorViewport, nodes, setNodes],
  )

  const copyGeneratedYaml = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generatedYamlText)
      setYamlCopyMessage('ה-YAML הועתק ללוח.')
    } catch {
      setYamlCopyMessage('לא ניתן להעתיק אוטומטית. אפשר לסמן ולהעתיק מהתצוגה.')
    }
  }, [generatedYamlText])

  const downloadGeneratedYaml = useCallback(() => {
    const blob = new Blob([generatedYamlText], {
      type: 'text/yaml;charset=utf-8',
    })
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = objectUrl
    link.download = getYamlDownloadFileName(scenarioMetadata)
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
  }, [generatedYamlText, scenarioMetadata])

  const updateEntryNodeId = useCallback((entryNodeId: string) => {
    setScenarioMetadata((currentMetadata) => ({
      ...currentMetadata,
      entryNodeId,
    }))
    setEdges((currentEdges) =>
      entryNodeId
        ? currentEdges.filter((edge) => edge.target !== entryNodeId)
        : currentEdges,
    )
    setAppMessage(
      entryNodeId
        ? 'שלב הפתיחה עודכן. חיבורים נכנסים לשלב זה הוסרו.'
        : 'יש לבחור שלב פתיחה חדש.',
    )
    setSelectedEdgeId(null)
  }, [setEdges])

  const handleNodeClick = useCallback<NodeMouseHandler<DecisionNode>>(
    (_event, node) => {
      setSelectedNodeId(node.id)
    },
    [],
  )

  const updateSelectedNodeId = useCallback(
    (id: string) => {
      if (selectedNodeId === null) {
        return
      }

      const previousId = selectedNodeId

      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === previousId ? { ...node, id } : node,
        ),
      )
      setEdges((currentEdges) =>
        currentEdges.map((edge) => ({
          ...edge,
          source: edge.source === previousId ? id : edge.source,
          target: edge.target === previousId ? id : edge.target,
        })),
      )
      setScenarioMetadata((currentMetadata) => ({
        ...currentMetadata,
        entryNodeId:
          currentMetadata.entryNodeId === previousId ? id : currentMetadata.entryNodeId,
      }))
      setSelectedNodeId(id)
    },
    [selectedNodeId, setEdges, setNodes],
  )

  const updateSelectedNodeDataBy = useCallback(
    (getNextData: (nodeData: DecisionNodeData) => DecisionNodeData) => {
      if (selectedNodeId === null) {
        return
      }

      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === selectedNodeId
            ? { ...node, data: getNextData(normalizeNodeData(node.data)) }
            : node,
        ),
      )
    },
    [selectedNodeId, setNodes],
  )

  const updateSelectedNodeData = useCallback(
    (dataPatch: Partial<DecisionNodeData>) => {
      updateSelectedNodeDataBy((nodeData) => ({ ...nodeData, ...dataPatch }))

      if (selectedNodeId !== null && dataPatch.nodeType === 'end') {
        setEdges((currentEdges) =>
          currentEdges.filter((edge) => edge.source !== selectedNodeId),
        )
      }
    },
    [selectedNodeId, setEdges, updateSelectedNodeDataBy],
  )

  const addSelectedNodeOption = useCallback(() => {
    if (selectedNodeId === null) {
      return
    }

    addOptionToNode(selectedNodeId)
  }, [addOptionToNode, selectedNodeId])

  const updateSelectedNodeOption = useCallback(
    (optionId: string, label: string) => {
      updateSelectedNodeDataBy((nodeData) => ({
        ...nodeData,
        options: nodeData.options.map((option) =>
          option.id === optionId ? { ...option, label } : option,
        ),
      }))

      if (selectedNodeId !== null) {
        setEdges((currentEdges) =>
          currentEdges.map((edge) =>
            edge.source === selectedNodeId && edge.sourceHandle === optionId
              ? { ...edge, label: getOptionEdgeLabel(label) }
              : edge,
          ),
        )
      }
    },
    [selectedNodeId, setEdges, updateSelectedNodeDataBy],
  )

  const deleteSelectedNodeOption = useCallback(
    (optionId: string) => {
      updateSelectedNodeDataBy((nodeData) => ({
        ...nodeData,
        options: nodeData.options.filter((option) => option.id !== optionId),
      }))

      if (selectedNodeId !== null) {
        setEdges((currentEdges) =>
          currentEdges.filter(
            (edge) => !(edge.source === selectedNodeId && edge.sourceHandle === optionId),
          ),
        )
      }
    },
    [selectedNodeId, setEdges, updateSelectedNodeDataBy],
  )

  const addSelectedNodeImage = useCallback(() => {
    if (selectedNodeId === null) {
      return
    }

    const newImage: DecisionImage = {
      id: `image-${nextImageNumber.current}`,
      key: '',
      title: '',
    }
    nextImageNumber.current += 1

    updateSelectedNodeDataBy((nodeData) => ({
      ...nodeData,
      images: [...nodeData.images, newImage],
    }))
  }, [selectedNodeId, updateSelectedNodeDataBy])

  const updateSelectedNodeImage = useCallback(
    (imageId: string, imagePatch: Partial<DecisionImage>) => {
      updateSelectedNodeDataBy((nodeData) => ({
        ...nodeData,
        images: nodeData.images.map((image) =>
          image.id === imageId ? { ...image, ...imagePatch } : image,
        ),
      }))
    },
    [updateSelectedNodeDataBy],
  )

  const deleteSelectedNodeImage = useCallback(
    (imageId: string) => {
      updateSelectedNodeDataBy((nodeData) => ({
        ...nodeData,
        images: nodeData.images.filter((image) => image.id !== imageId),
      }))
    },
    [updateSelectedNodeDataBy],
  )

  const addSelectedNodeLink = useCallback(() => {
    if (selectedNodeId === null) {
      return
    }

    const newLink: DecisionLink = {
      id: `link-${nextLinkNumber.current}`,
      label: '',
      itemId: '',
    }
    nextLinkNumber.current += 1

    updateSelectedNodeDataBy((nodeData) => ({
      ...nodeData,
      links: [...nodeData.links, newLink],
    }))
  }, [selectedNodeId, updateSelectedNodeDataBy])

  const updateSelectedNodeLink = useCallback(
    (linkId: string, linkPatch: Partial<DecisionLink>) => {
      updateSelectedNodeDataBy((nodeData) => ({
        ...nodeData,
        links: nodeData.links.map((link) =>
          link.id === linkId ? { ...link, ...linkPatch } : link,
        ),
      }))
    },
    [updateSelectedNodeDataBy],
  )

  const deleteSelectedNodeLink = useCallback(
    (linkId: string) => {
      updateSelectedNodeDataBy((nodeData) => ({
        ...nodeData,
        links: nodeData.links.filter((link) => link.id !== linkId),
      }))
    },
    [updateSelectedNodeDataBy],
  )

  const isValidConnection = useCallback<IsValidConnection>(
    (connection) =>
      isDecisionConnectionValid(
        {
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle ?? null,
          targetHandle: connection.targetHandle ?? null,
        },
        nodes,
        edges,
        scenarioMetadata.entryNodeId,
      ),
    [edges, nodes, scenarioMetadata.entryNodeId],
  )

  const handleConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) => {
        if (
          !isDecisionConnectionValid(
            connection,
            nodes,
            currentEdges,
            scenarioMetadata.entryNodeId,
          )
        ) {
          return currentEdges
        }

        const sourceData = getNodeDataById(nodes, connection.source)

        if (!sourceData) {
          return currentEdges
        }

        const newEdge = createDecisionEdge(connection, sourceData)

        return addEdge(newEdge, currentEdges)
      })
    },
    [nodes, scenarioMetadata.entryNodeId, setEdges],
  )

  const setOutgoingTarget = useCallback(
    (sourceId: string, sourceHandle: string, targetId: string) => {
      const trimmedTargetId = targetId.trim()

      setEdges((currentEdges) => {
        const edgesWithoutHandle = currentEdges.filter(
          (edge) =>
            edge.source !== sourceId ||
            (edge.sourceHandle ?? DIRECT_SOURCE_HANDLE_ID) !== sourceHandle,
        )

        if (!trimmedTargetId) {
          return edgesWithoutHandle
        }

        const connection: Connection = {
          source: sourceId,
          sourceHandle,
          target: trimmedTargetId,
          targetHandle: null,
        }

        if (
          !isDecisionConnectionValid(
            connection,
            nodes,
            edgesWithoutHandle,
            scenarioMetadata.entryNodeId,
          )
        ) {
          return currentEdges
        }

        const sourceData = getNodeDataById(nodes, sourceId)

        if (!sourceData) {
          return currentEdges
        }

        return addEdge(createDecisionEdge(connection, sourceData), edgesWithoutHandle)
      })
    },
    [nodes, scenarioMetadata.entryNodeId, setEdges],
  )

  const handleEdgeClick = useCallback<EdgeMouseHandler<DecisionEdge>>((_event, edge) => {
    setSelectedEdgeId(edge.id)
  }, [])

  const getSelectedNodeTargetForHandle = useCallback(
    (sourceHandle: string) =>
      selectedNode
        ? (getOutgoingEdgeForHandle(edges, selectedNode.id, sourceHandle)?.target ?? '')
        : '',
    [edges, selectedNode],
  )

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNode) {
      return
    }

    const shouldDelete = window.confirm(
      'למחוק את השלב הזה? כל החיבורים אליו וממנו יימחקו.',
    )

    if (!shouldDelete) {
      return
    }

    const deletedNodeId = selectedNode.id

    setNodes((currentNodes) =>
      currentNodes.filter((node) => node.id !== deletedNodeId),
    )
    setEdges((currentEdges) =>
      currentEdges.filter(
        (edge) => edge.source !== deletedNodeId && edge.target !== deletedNodeId,
      ),
    )
    setSelectedNodeId(null)
    setSelectedEdgeId(null)

    if (scenarioMetadata.entryNodeId === deletedNodeId) {
      setScenarioMetadata((currentMetadata) => ({
        ...currentMetadata,
        entryNodeId: '',
      }))
      setAppMessage('שלב הפתיחה נמחק. יש לבחור שלב פתיחה חדש.')
    }
  }, [scenarioMetadata.entryNodeId, selectedNode, setEdges, setNodes])

  const clearNodeSelection = useCallback(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.selected ? { ...node, selected: false } : node,
      ),
    )
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
  }, [setNodes])

  const deleteSelectedNodes = useCallback(() => {
    if (selectedNodeIds.length === 0) {
      return
    }

    const shouldDelete = window.confirm(
      'למחוק את השלבים שנבחרו? כל החיבורים אליהם ומהם יימחקו.',
    )

    if (!shouldDelete) {
      return
    }

    const deletedNodeIds = new Set(selectedNodeIds)

    setNodes((currentNodes) =>
      currentNodes.filter((node) => !deletedNodeIds.has(node.id)),
    )
    setEdges((currentEdges) =>
      currentEdges.filter(
        (edge) => !deletedNodeIds.has(edge.source) && !deletedNodeIds.has(edge.target),
      ),
    )
    setSelectedNodeId(null)
    setSelectedEdgeId(null)

    if (scenarioMetadata.entryNodeId && deletedNodeIds.has(scenarioMetadata.entryNodeId)) {
      setScenarioMetadata((currentMetadata) => ({
        ...currentMetadata,
        entryNodeId: '',
      }))
      setAppMessage('שלב הפתיחה נמחק. יש לבחור שלב פתיחה חדש.')
    }
  }, [scenarioMetadata.entryNodeId, selectedNodeIds, setEdges, setNodes])

  const duplicateSelectedNodes = useCallback(() => {
    if (selectedNodeIds.length === 0) {
      return
    }

    const selectedNodeIdSet = new Set(selectedNodeIds)
    const reservedNodeIds = new Set(nodes.map((node) => node.id))
    const nodeIdMap = new Map<string, string>()
    const optionIdMaps = new Map<string, Map<string, string>>()

    const duplicatedNodes: DecisionNode[] = nodes
      .filter((node) => selectedNodeIdSet.has(node.id))
      .map((node) => {
        const nodeData = normalizeNodeData(node.data)
        const nextNodeId = getNextStepId(reservedNodeIds)
        const optionIdMap = new Map<string, string>()
        const options = nodeData.options.map((option) => {
          const optionId = `option-${nextOptionNumber.current}`
          nextOptionNumber.current += 1
          optionIdMap.set(option.id, optionId)

          return {
            ...option,
            id: optionId,
          }
        })
        const images = nodeData.images.map((image) => {
          const imageId = `image-${nextImageNumber.current}`
          nextImageNumber.current += 1

          return {
            ...image,
            id: imageId,
          }
        })
        const links = nodeData.links.map((link) => {
          const linkId = `link-${nextLinkNumber.current}`
          nextLinkNumber.current += 1

          return {
            ...link,
            id: linkId,
          }
        })

        nodeIdMap.set(node.id, nextNodeId)
        reservedNodeIds.add(nextNodeId)
        optionIdMaps.set(node.id, optionIdMap)

        return {
          ...node,
          id: nextNodeId,
          selected: true,
          position: {
            x: node.position.x + 280,
            y: node.position.y + 180,
          },
          data: {
            nodeType: nodeData.nodeType,
            script: nodeData.script,
            options,
            images,
            links,
          },
        }
      })

    const duplicatedDataById = new Map(
      duplicatedNodes.map((node) => [node.id, normalizeNodeData(node.data)]),
    )
    const duplicatedEdges = edges.flatMap((edge) => {
      const copiedSourceId = nodeIdMap.get(edge.source)
      const copiedTargetId = nodeIdMap.get(edge.target)

      if (!copiedSourceId || !copiedTargetId) {
        return []
      }

      const sourceHandle = edge.sourceHandle ?? DIRECT_SOURCE_HANDLE_ID
      const copiedSourceHandle = isDirectSourceHandle(sourceHandle)
        ? DIRECT_SOURCE_HANDLE_ID
        : optionIdMaps.get(edge.source)?.get(sourceHandle)

      if (!copiedSourceHandle) {
        return []
      }

      const copiedSourceData = duplicatedDataById.get(copiedSourceId)

      if (!copiedSourceData) {
        return []
      }

      return [
        createDecisionEdge(
          {
            source: copiedSourceId,
            sourceHandle: copiedSourceHandle,
            target: copiedTargetId,
            targetHandle: edge.targetHandle ?? null,
          },
          copiedSourceData,
        ),
      ]
    })

    setNodes((currentNodes) => [
      ...currentNodes.map((node) =>
        node.selected ? { ...node, selected: false } : node,
      ),
      ...duplicatedNodes,
    ])
    setEdges((currentEdges) => [...currentEdges, ...duplicatedEdges])
    setSelectedNodeId(duplicatedNodes[0]?.id ?? null)
    setSelectedEdgeId(null)
  }, [edges, nodes, selectedNodeIds, setEdges, setNodes])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !selectedNode ||
        isEditableElement(event.target) ||
        (event.key !== 'Delete' && event.key !== 'Backspace')
      ) {
        return
      }

      event.preventDefault()
      deleteSelectedNode()
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deleteSelectedNode, selectedNode])

  const addNode = useCallback(
    (nodeType: DecisionNodeType) => {
      setNodes((currentNodes) => {
        const nodeIndex = currentNodes.length
        const id = getNextStepId(currentNodes.map((node) => node.id))
        const row = Math.floor(nodeIndex / 3)
        const column = nodeIndex % 3

        const newNode: DecisionNode = {
          id,
          type: 'decision',
          position: {
            x: 80 + column * 260,
            y: 80 + row * 170,
          },
          data: createNodeData(nodeType),
        }

        return [...currentNodes, newNode]
      })
    },
    [setNodes],
  )

  return (
    <main className="app-shell" dir="rtl">
      <header className="top-toolbar">
        <p className="top-toolbar__autosave-notice">
          אין שמירה אוטומטית — יש לייצא YAML כדי לשמור את העבודה
        </p>
        <button
          type="button"
          className="top-toolbar__button"
          onClick={createNewScenario}
        >
          תסריט חדש
        </button>
        <button
          type="button"
          className="top-toolbar__button"
          onClick={() => setIsScenarioPanelOpen(true)}
        >
          פרטי תסריט
        </button>
        <button
          type="button"
          className="top-toolbar__button"
          onClick={openYamlImportPanel}
        >
          ייבוא YAML
        </button>
        <button
          type="button"
          className="top-toolbar__button"
          onClick={openYamlExportPanel}
        >
          ייצוא YAML
        </button>

        <div className="canvas-mode-toggle" role="group" aria-label="מצב קנבס">
          {(['pan', 'select'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={[
                'canvas-mode-toggle__button',
                canvasMode === mode ? 'canvas-mode-toggle__button--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={canvasMode === mode}
              onClick={() => setCanvasMode(mode)}
            >
              {canvasModeLabels[mode]}
            </button>
          ))}
        </div>

        <p className="canvas-mode-toggle__helper">{canvasModeHelperText[canvasMode]}</p>
      </header>

      <div className="workspace-shell">
        <datalist id={targetDatalistId}>
          {targetCandidateNodes.map((node) => (
            <option key={node.id} value={node.id}>
              {`${node.id} - ${typeLabels[normalizeNodeData(node.data).nodeType]}`}
            </option>
          ))}
        </datalist>

        <aside className="sidebar" aria-label="סרגל הוספת צמתים">
        <div className="sidebar__header">
          <p className="sidebar__eyebrow">עורך עץ החלטות</p>
          <h1>בונה זרימה</h1>
        </div>

        <div className="sidebar__actions">
          {sidebarActions.map((action) => (
            <button
              key={action.nodeType}
              type="button"
              className="sidebar__button"
              onClick={() => addNode(action.nodeType)}
            >
              {action.label}
            </button>
          ))}
        </div>

        {appMessage ? <p className="app-message">{appMessage}</p> : null}

        <section className="properties-panel" aria-label="פרטי השלב הנבחר">
          <h2>פרטי שלב</h2>

          {selectedNode && selectedNodeData ? (
            <div className="properties-panel__form" dir="rtl">
              <label className="properties-panel__field">
                <span>מזהה שלב</span>
                <input
                  type="text"
                  value={selectedNode.id}
                  dir="rtl"
                  className="properties-panel__control properties-panel__control--code"
                  onChange={(event) => updateSelectedNodeId(event.currentTarget.value)}
                />
              </label>

              <label className="properties-panel__field">
                <span>סוג שלב</span>
                <select
                  value={selectedNodeData.nodeType}
                  dir="rtl"
                  className="properties-panel__control"
                  onChange={(event) =>
                    updateSelectedNodeData({
                      nodeType: event.currentTarget.value as DecisionNodeType,
                    })
                  }
                >
                  {sidebarActions.map((action) => (
                    <option key={action.nodeType} value={action.nodeType}>
                      {typeLabels[action.nodeType]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="properties-panel__field">
                <span>טקסט לנציג</span>
                <textarea
                  value={selectedNodeData.script}
                  dir="rtl"
                  rows={5}
                  className="properties-panel__control properties-panel__textarea"
                  onChange={(event) =>
                    updateSelectedNodeData({ script: event.currentTarget.value })
                  }
                />
              </label>

              {supportsOptions(selectedNodeData.nodeType) ? (
                <section className="collection-editor" aria-label="אפשרויות תשובה">
                  <div className="collection-editor__header">
                    <h3>אפשרויות תשובה</h3>
                    <button
                      type="button"
                      className="collection-editor__add-button"
                      onClick={addSelectedNodeOption}
                    >
                      הוסף אפשרות
                    </button>
                  </div>

                  <div className="collection-editor__list">
                    {selectedNodeData.options.map((option, optionIndex) => (
                      <div key={option.id} className="collection-editor__row">
                        <div className="collection-editor__fields">
                          <label className="collection-editor__field">
                            <span>{`אפשרות ${optionIndex + 1}`}</span>
                            <input
                              type="text"
                              value={option.label}
                              dir="rtl"
                              className="properties-panel__control"
                              onChange={(event) =>
                                updateSelectedNodeOption(
                                  option.id,
                                  event.currentTarget.value,
                                )
                              }
                            />
                          </label>

                          <StepTargetInput
                            label="שלב יעד"
                            value={getSelectedNodeTargetForHandle(option.id)}
                            datalistId={targetDatalistId}
                            candidateNodeIds={targetCandidateNodeIds}
                            onTargetChange={(targetId) =>
                              setOutgoingTarget(selectedNode.id, option.id, targetId)
                            }
                          />
                        </div>
                        <button
                          type="button"
                          className="collection-editor__delete-button"
                          onClick={() => deleteSelectedNodeOption(option.id)}
                        >
                          מחק
                        </button>
                      </div>
                    ))}

                    {selectedNodeData.options.length === 0 ? (
                      <p className="collection-editor__empty">אין אפשרויות עדיין</p>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {selectedNodeData.nodeType !== 'end' &&
              selectedNodeData.options.length === 0 ? (
                <section className="target-editor" aria-label="שלב הבא">
                  <h3>שלב הבא</h3>
                  <StepTargetInput
                    label="שלב הבא"
                    value={getSelectedNodeTargetForHandle(DIRECT_SOURCE_HANDLE_ID)}
                    datalistId={targetDatalistId}
                    candidateNodeIds={targetCandidateNodeIds}
                    onTargetChange={(targetId) =>
                      setOutgoingTarget(
                        selectedNode.id,
                        DIRECT_SOURCE_HANDLE_ID,
                        targetId,
                      )
                    }
                  />
                </section>
              ) : null}

              <section className="collection-editor" aria-label="תמונות">
                <div className="collection-editor__header">
                  <h3>תמונות</h3>
                  <button
                    type="button"
                    className="collection-editor__add-button"
                    onClick={addSelectedNodeImage}
                  >
                    הוסף תמונה
                  </button>
                </div>

                <div className="collection-editor__list">
                  {selectedNodeData.images.map((image, imageIndex) => (
                    <div key={image.id} className="collection-editor__row">
                      <div className="collection-editor__fields">
                        <label className="collection-editor__field">
                          <span>{`תמונה ${imageIndex + 1}: מזהה תמונה`}</span>
                          <input
                            type="text"
                            value={image.key}
                            dir="rtl"
                            className="properties-panel__control"
                            onChange={(event) =>
                              updateSelectedNodeImage(image.id, {
                                key: event.currentTarget.value,
                              })
                            }
                          />
                        </label>

                        <label className="collection-editor__field">
                          <span>שם תמונה</span>
                          <input
                            type="text"
                            value={image.title}
                            dir="rtl"
                            className="properties-panel__control"
                            onChange={(event) =>
                              updateSelectedNodeImage(image.id, {
                                title: event.currentTarget.value,
                              })
                            }
                          />
                        </label>
                      </div>

                      <button
                        type="button"
                        className="collection-editor__delete-button"
                        onClick={() => deleteSelectedNodeImage(image.id)}
                      >
                        מחק
                      </button>
                    </div>
                  ))}

                  {selectedNodeData.images.length === 0 ? (
                    <p className="collection-editor__empty">אין תמונות עדיין</p>
                  ) : null}
                </div>
              </section>

              <section className="collection-editor" aria-label="קישורי מידע">
                <div className="collection-editor__header">
                  <h3>קישורי מידע</h3>
                  <button
                    type="button"
                    className="collection-editor__add-button"
                    onClick={addSelectedNodeLink}
                  >
                    הוסף קישור
                  </button>
                </div>

                <div className="collection-editor__list">
                  {selectedNodeData.links.map((link, linkIndex) => (
                    <div key={link.id} className="collection-editor__row">
                      <div className="collection-editor__fields">
                        <label className="collection-editor__field">
                          <span>{`קישור ${linkIndex + 1}: שם קישור`}</span>
                          <input
                            type="text"
                            value={link.label}
                            dir="rtl"
                            className="properties-panel__control"
                            onChange={(event) =>
                              updateSelectedNodeLink(link.id, {
                                label: event.currentTarget.value,
                              })
                            }
                          />
                        </label>

                        <label className="collection-editor__field">
                          <span>מזהה קישור או URL</span>
                          <input
                            type="text"
                            value={link.itemId}
                            dir="rtl"
                            className="properties-panel__control"
                            onChange={(event) =>
                              updateSelectedNodeLink(link.id, {
                                itemId: event.currentTarget.value,
                              })
                            }
                          />
                        </label>
                      </div>

                      <button
                        type="button"
                        className="collection-editor__delete-button"
                        onClick={() => deleteSelectedNodeLink(link.id)}
                      >
                        מחק
                      </button>
                    </div>
                  ))}

                  {selectedNodeData.links.length === 0 ? (
                    <p className="collection-editor__empty">אין קישורי מידע עדיין</p>
                  ) : null}
                </div>
              </section>

              <button
                type="button"
                className="delete-step-button"
                onClick={deleteSelectedNode}
              >
                מחק שלב
              </button>
            </div>
          ) : (
            <p className="properties-panel__empty">אין שלב נבחר</p>
          )}
        </section>
        </aside>

        <section className="canvas-panel" aria-label="קנבס עץ ההחלטות">
        <ReactFlow<DecisionNode, DecisionEdge>
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          onInit={(reactFlowInstance) => {
            reactFlowInstanceRef.current = reactFlowInstance
            setEditorViewport(reactFlowInstance.getViewport())
          }}
          onMove={(_, viewport) => setEditorViewport(viewport)}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onPaneClick={() => {
            setSelectedNodeId(null)
            setSelectedEdgeId(null)
          }}
          isValidConnection={isValidConnection}
          edgesReconnectable={false}
          deleteKeyCode={null}
          selectionKeyCode={null}
          selectionOnDrag={isSelectionMode}
          selectionMode={SelectionMode.Partial}
          panActivationKeyCode={null}
          panOnDrag={!isSelectionMode}
          defaultViewport={initialViewport}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#c7d2fe" gap={28} variant={BackgroundVariant.Dots} />
          <Controls position="bottom-left" />
        </ReactFlow>

        {selectedNodeCount > 0 ? (
          <div className="bulk-actions-toolbar" dir="rtl" aria-label="פעולות על בחירה">
            <strong>{`${selectedNodeCount} ${
              selectedNodeCount === 1 ? 'שלב נבחר' : 'שלבים נבחרו'
            }`}</strong>
            <button type="button" onClick={duplicateSelectedNodes}>
              שכפל נבחרים
            </button>
            <button
              type="button"
              className="bulk-actions-toolbar__danger"
              onClick={deleteSelectedNodes}
            >
              מחק נבחרים
            </button>
            <button type="button" onClick={clearNodeSelection}>
              נקה בחירה
            </button>
          </div>
        ) : null}
        </section>
      </div>

      {isScenarioPanelOpen ? (
        <div className="scenario-panel-backdrop" role="presentation">
          <section
            className="scenario-panel"
            role="dialog"
            aria-modal="true"
            aria-label="פרטי תסריט"
            dir="rtl"
          >
            <div className="scenario-panel__header">
              <h2>פרטי תסריט</h2>
              <button
                type="button"
                className="scenario-panel__close-button"
                onClick={() => setIsScenarioPanelOpen(false)}
              >
                סגור
              </button>
            </div>

            <div className="scenario-panel__form">
              <section className="scenario-panel__field scenario-panel__field--wide">
                <EntryNodeSelect
                  value={scenarioMetadata.entryNodeId}
                  nodes={nodes}
                  onEntryNodeChange={updateEntryNodeId}
                />
              </section>

              <label className="scenario-panel__field scenario-panel__field--wide">
                <span>תיאור כללי של התסריט ומה הוא בא לפתור</span>
                <textarea
                  value={scenarioMetadata.scenarioDescription}
                  dir="rtl"
                  rows={4}
                  onChange={(event) =>
                    updateScenarioMetadata({
                      scenarioDescription: event.currentTarget.value,
                    })
                  }
                />
              </label>

              <label className="scenario-panel__field">
                <span>שם פריט במאגר הידע בגלסיקס</span>
                <input
                  type="text"
                  value={scenarioMetadata.glassixKnowledgeItemName}
                  dir="rtl"
                  onChange={(event) =>
                    updateScenarioMetadata({
                      glassixKnowledgeItemName: event.currentTarget.value,
                    })
                  }
                />
              </label>

              <label className="scenario-panel__field">
                <span>שם הפריט בסרצ'ו</span>
                <input
                  type="text"
                  value={scenarioMetadata.searchoItemName}
                  dir="rtl"
                  onChange={(event) =>
                    updateScenarioMetadata({
                      searchoItemName: event.currentTarget.value,
                    })
                  }
                />
              </label>

              <label className="scenario-panel__field scenario-panel__field--wide">
                <span>קישור לפריט בסרצ'ו</span>
                <input
                  type="text"
                  value={scenarioMetadata.searchoItemUrl}
                  dir="rtl"
                  onChange={(event) =>
                    updateScenarioMetadata({
                      searchoItemUrl: event.currentTarget.value,
                    })
                  }
                />
              </label>
            </div>
          </section>
        </div>
      ) : null}

      {isYamlImportPanelOpen ? (
        <div className="yaml-import-panel-backdrop" role="presentation">
          <section
            className="yaml-import-panel"
            role="dialog"
            aria-modal="true"
            aria-label="ייבוא YAML"
            dir="rtl"
          >
            <div className="yaml-import-panel__header">
              <h2>ייבוא YAML</h2>
              <button
                type="button"
                className="yaml-import-panel__close-button"
                onClick={() => setIsYamlImportPanelOpen(false)}
              >
                סגור
              </button>
            </div>

            <div className="yaml-import-panel__body">
              <label className="yaml-import-panel__field">
                <span>הדבקת YAML</span>
                <textarea
                  value={yamlImportText}
                  dir="ltr"
                  rows={14}
                  spellCheck={false}
                  placeholder="scenario:"
                  onChange={(event) => {
                    setYamlImportText(event.currentTarget.value)
                    setYamlImportErrors([])
                  }}
                />
              </label>

              <label className="yaml-import-panel__field">
                <span>או העלאת קובץ YAML</span>
                <input
                  type="file"
                  accept=".yaml,.yml,text/yaml,application/x-yaml"
                  dir="rtl"
                  onChange={(event) => {
                    void loadYamlImportFile(event.currentTarget.files?.[0])
                  }}
                />
              </label>

              {yamlImportFileName ? (
                <p className="yaml-import-panel__file-name">
                  {`קובץ נבחר: ${yamlImportFileName}`}
                </p>
              ) : null}

              {yamlImportErrors.length > 0 ? (
                <section className="yaml-import-panel__errors" aria-label="שגיאות ייבוא">
                  <h3>שגיאות ייבוא</h3>
                  <ul>
                    {yamlImportErrors.map((errorMessage, errorIndex) => (
                      <li key={`${errorMessage}-${errorIndex}`}>{errorMessage}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>

            <div className="yaml-import-panel__actions">
              <button type="button" onClick={importYamlText}>
                ייבא YAML
              </button>
              <button type="button" onClick={() => setIsYamlImportPanelOpen(false)}>
                סגור
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isValidationPanelOpen && validationReport ? (
        <div className="validation-panel-backdrop" role="presentation">
          <section
            className="validation-panel"
            role="dialog"
            aria-modal="true"
            aria-label="בעיות בתסריט"
            dir="rtl"
          >
            <div className="validation-panel__header">
              <h2>בעיות בתסריט</h2>
            </div>

            <div className="validation-panel__content">
              <section className="validation-panel__section" aria-label="שגיאות">
                <h3>שגיאות</h3>
                {validationReport.errors.length > 0 ? (
                  <ul className="validation-panel__list">
                    {validationReport.errors.map((message) => (
                      <li key={message.id}>
                        {message.stepId ? (
                          <button
                            type="button"
                            className="validation-panel__message-button"
                            onClick={() => focusValidationStep(message.stepId ?? '')}
                          >
                            {message.text}
                          </button>
                        ) : (
                          <span>{message.text}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="validation-panel__empty">אין שגיאות</p>
                )}
              </section>

              <section className="validation-panel__section" aria-label="אזהרות">
                <h3>אזהרות</h3>
                {validationReport.warnings.length > 0 ? (
                  <ul className="validation-panel__list">
                    {validationReport.warnings.map((message) => (
                      <li key={message.id}>
                        {message.stepId ? (
                          <button
                            type="button"
                            className="validation-panel__message-button"
                            onClick={() => focusValidationStep(message.stepId ?? '')}
                          >
                            {message.text}
                          </button>
                        ) : (
                          <span>{message.text}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="validation-panel__empty">אין אזהרות</p>
                )}
              </section>
            </div>

            <div className="validation-panel__actions">
              {!hasValidationErrors && hasValidationWarnings ? (
                <button type="button" onClick={continueYamlExportAfterWarnings}>
                  ייצא בכל זאת
                </button>
              ) : null}
              <button type="button" onClick={() => setIsValidationPanelOpen(false)}>
                חזור לעריכה
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isYamlExportPanelOpen ? (
        <div className="yaml-export-panel-backdrop" role="presentation">
          <section
            className="yaml-export-panel"
            role="dialog"
            aria-modal="true"
            aria-label="ייצוא YAML"
            dir="rtl"
          >
            <div className="yaml-export-panel__header">
              <h2>ייצוא YAML</h2>
            </div>

            <textarea
              readOnly
              value={generatedYamlText}
              dir="ltr"
              spellCheck={false}
              className="yaml-export-panel__preview"
              aria-label="תצוגת YAML"
            />

            {yamlCopyMessage ? (
              <p className="yaml-export-panel__message">{yamlCopyMessage}</p>
            ) : null}

            <div className="yaml-export-panel__actions">
              <button type="button" onClick={copyGeneratedYaml}>
                העתקה
              </button>
              <button type="button" onClick={downloadGeneratedYaml}>
                הורדת קובץ YAML
              </button>
              <button
                type="button"
                onClick={() => setIsYamlExportPanelOpen(false)}
              >
                סגור
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default App
