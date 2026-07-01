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
  MiniMap,
  Position,
  ReactFlow,
  SelectionMode,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type EdgeProps,
  type EdgeTypes,
  getSmoothStepPath,
  getBezierPath,
  type IsValidConnection,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
  type NodeTypes,
  type OnConnectEnd,
  type OnConnectStart,
  type ReactFlowInstance,
  type Viewport,
  type XYPosition,
  useEdgesState,
  useNodesState,
  useUpdateNodeInternals,
} from '@xyflow/react'
import dagre from 'dagre'
import { parse, stringify } from 'yaml'
import '@xyflow/react/dist/style.css'
import { getNextStepIds, getPreviousStepIds } from './flowGraph'
import './App.css'

type DecisionNodeType =
  | 'question'
  | 'choice'
  | 'instruction'
  | 'note'
  | 'agentInstruction'
  | 'end'
  | 'parameterUpdate'
  | 'condition'
  | 'action'
  | 'tool'

type CanvasMode = 'pan' | 'select'

type EdgeStyle = 'orthogonal' | 'curved'

type DirectSourcePosition = 'left' | 'bottom'

type ConditionLogic = 'all' | 'any'

type ConditionOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'exists'
  | 'notExists'

type TargetHandleId =
  | 'target-top'
  | 'target-right'
  | 'target-bottom'
  | 'target-left'

type DecisionOption = {
  id: string
  label: string
  next?: string
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

type DecisionParameterUpdate = {
  id: string
  name: string
  value: string
}

type DecisionAction = {
  id: string
  name: string
}

type DecisionTool = {
  id: string
  name: string
}

type StandaloneParameterUpdate = {
  name: string
  value: string
}

type StandaloneAction = {
  name: string
}

type StandaloneTool = {
  name: string
}

type DecisionConditionRule = {
  id: string
  parameterName: string
  operator: ConditionOperator
  value: string
}

type DecisionCondition = {
  logic: ConditionLogic
  rules: DecisionConditionRule[]
}

type InternalEditableFieldId =
  | 'parameterName'
  | 'parameterValue'
  | 'actionName'
  | 'toolName'

type InternalEditableField = {
  id: InternalEditableFieldId
  label: string
  value: string
  emptyLabel: string
  ariaLabel: string
}

type DecisionNodeData = {
  nodeType: DecisionNodeType
  script: string
  options: DecisionOption[]
  images: DecisionImage[]
  links: DecisionLink[]
  parameterUpdates: DecisionParameterUpdate[]
  actions: DecisionAction[]
  tools: DecisionTool[]
  parameterUpdate: StandaloneParameterUpdate
  action: StandaloneAction
  tool: StandaloneTool
  condition: DecisionCondition
  edgeHighlightRole?: 'source' | 'target'
  highlightedOptionId?: string | null
  isEntryNode?: boolean
  isMultiSelected?: boolean
  directSourcePosition?: DirectSourcePosition
  onAddOption?: (nodeId: string) => void
  onDeleteNode?: (nodeId: string) => void
  onDeleteOption?: (nodeId: string, optionId: string) => void
  onOptionLabelChange?: (nodeId: string, optionId: string, label: string) => void
  onScriptChange?: (nodeId: string, script: string) => void
  onStandaloneActionChange?: (nodeId: string, patch: Partial<StandaloneAction>) => void
  onStandaloneParameterUpdateChange?: (
    nodeId: string,
    patch: Partial<StandaloneParameterUpdate>,
  ) => void
  onStandaloneToolChange?: (nodeId: string, patch: Partial<StandaloneTool>) => void
  onToggleMultiSelect?: (nodeId: string, isSelected: boolean) => void
}

type LegacyDecisionNodeData = Partial<
  Omit<
    DecisionNodeData,
    | 'action'
    | 'actions'
    | 'condition'
    | 'options'
    | 'parameterUpdate'
    | 'parameterUpdates'
    | 'tool'
    | 'tools'
  >
> & {
  nodeType?: DecisionNodeType
  imageKey?: string
  options?: Array<DecisionOption | string>
  parameterUpdates?: Array<Partial<DecisionParameterUpdate>>
  actions?: Array<Partial<DecisionAction>>
  tools?: Array<Partial<DecisionTool>>
  parameterUpdate?: Partial<StandaloneParameterUpdate>
  action?: Partial<StandaloneAction>
  tool?: Partial<StandaloneTool>
  condition?: Partial<
    Omit<DecisionCondition, 'rules'> & {
      rules?: Array<Partial<DecisionConditionRule>>
    }
  >
}

type DecisionNode = Node<DecisionNodeData, 'decision'>

type DecisionEdgeData = {
  edgeStyle?: EdgeStyle
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
  draft?: {
    hasValidationIssues: boolean
    exportedWithErrors: boolean
  }
  scenario: {
    entryStepId: string
    glassixKnowledgeItemName: string
    searchoItemName: string
    searchoItemUrl: string
    description: string
  }
  steps: YamlExportStep[]
  _editor: {
    edgeStyle: EdgeStyle
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
  script?: string
  visibility?: 'internal'
  images?: Array<{
    key: string
    title: string
  }>
  links?: Array<{
    label: string
    itemId: string
  }>
  parameterUpdates?: Array<{
    name: string
    value: string
  }>
  actions?: Array<{
    name: string
  }>
  tools?: Array<{
    name: string
  }>
  parameterUpdate?: {
    name: string
    value: string
  }
  action?: {
    name: string
  }
  tool?: {
    name: string
  }
  condition?: {
    logic: ConditionLogic
    rules: Array<{
      parameterName: string
      operator: ConditionOperator
      value?: string
    }>
    thenNext?: string
    elseNext?: string
  }
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
  parameterUpdates: Array<Omit<DecisionParameterUpdate, 'id'>>
  actions: Array<Omit<DecisionAction, 'id'>>
  tools: Array<Omit<DecisionTool, 'id'>>
  parameterUpdate: StandaloneParameterUpdate
  action: StandaloneAction
  tool: StandaloneTool
  condition: {
    logic: ConditionLogic
    rules: Array<Omit<DecisionConditionRule, 'id'>>
    thenNext: string
    elseNext: string
  }
  options: ImportedStepOption[]
  next: string
}

type ImportedFlow = {
  edges: DecisionEdge[]
  nextActionNumber: number
  nextImageNumber: number
  nextLinkNumber: number
  nextOptionNumber: number
  nextParameterUpdateNumber: number
  nextConditionRuleNumber: number
  nextToolNumber: number
  nodes: DecisionNode[]
  edgeStyle: EdgeStyle
  scenarioMetadata: ScenarioMetadata
  shouldFitView: boolean
  viewport?: Viewport
}

type EntryNodeSelectProps = {
  value: string
  nodes: DecisionNode[]
  onEntryNodeChange: (nodeId: string) => void
}

type PendingConnectionPopover = {
  sourceId: string
  sourceHandle: string
  nodePosition: XYPosition
  popoverPosition: XYPosition
}

type DismissibleNoticeProps = {
  children: string
  className: string
  onDismiss: () => void
}

type SourceHandleOption = {
  currentTargetId?: string
  value: string
  label: string
}

type YamlImportMode = 'replace' | 'append'
type AppendLayoutMode = 'preserve' | 'auto'

type ConfirmDialogState = {
  actions?: Array<{
    label: string
    value: DialogActionValue
    variant?: 'danger' | 'primary' | 'secondary'
  }>
  cancelLabel?: string
  confirmLabel?: string
  message: string
  title: string
  variant?: 'danger' | 'primary'
}

type DialogActionValue = string

type ScenarioTab = {
  edgeStyle: EdgeStyle
  edges: DecisionEdge[]
  editorViewport: Viewport
  id: string
  isValidationPanelOpen: boolean
  name: string
  nodes: DecisionNode[]
  scenarioMetadata: ScenarioMetadata
  selectedEdgeId: string | null
  selectedNodeId: string | null
  validationReport: ValidationReport | null
}

type FlowClipboard = {
  edges: DecisionEdge[]
  entryNodeId: string
  nodes: DecisionNode[]
}

type ParseYamlImportOptions = {
  allowedExternalStepIds?: Set<string>
  blockedTargetStepIds?: Set<string>
}

const typeLabels: Record<DecisionNodeType, string> = {
  question: 'שאלה',
  choice: 'בחירה',
  instruction: 'הנחיה',
  note: 'הערה (ישן)',
  agentInstruction: 'הוראה לסוכן',
  end: 'סיום',
  parameterUpdate: 'עדכון פרמטר',
  condition: 'תנאי IF/THEN',
  action: 'יציאה ל-ACTION',
  tool: 'יציאה לכלי',
}

const conditionLogicLabels: Record<ConditionLogic, string> = {
  all: 'כל התנאים מתקיימים',
  any: 'לפחות תנאי אחד מתקיים',
}

const conditionOperatorLabels: Record<ConditionOperator, string> = {
  equals: 'שווה',
  notEquals: 'לא שווה',
  contains: 'מכיל',
  notContains: 'לא מכיל',
  greaterThan: 'גדול מ',
  greaterThanOrEqual: 'גדול או שווה',
  lessThan: 'קטן מ',
  lessThanOrEqual: 'קטן או שווה',
  exists: 'קיים',
  notExists: 'לא קיים',
}

const conditionOperators = Object.keys(
  conditionOperatorLabels,
) as ConditionOperator[]

const conditionOperatorsWithoutValue = new Set<ConditionOperator>([
  'exists',
  'notExists',
])

const canvasModeLabels: Record<CanvasMode, string> = {
  pan: 'מצב הזזה',
  select: 'מצב סימון',
}

const canvasModeHelperText: Record<CanvasMode, string> = {
  pan: 'גרור את הרקע כדי לזוז במפה',
  select: 'גרור על הרקע כדי לסמן כמה שלבים',
}

const edgeStyleLabels: Record<EdgeStyle, string> = {
  orthogonal: 'קווים זוויתיים',
  curved: 'קווים מעוקלים',
}

const sidebarActions: SidebarAction[] = [
  { nodeType: 'question', label: 'הוסף שאלה' },
  { nodeType: 'choice', label: 'הוסף בחירה' },
  { nodeType: 'instruction', label: 'הוסף הנחיה' },
  { nodeType: 'agentInstruction', label: 'הוסף הוראה לסוכן' },
  { nodeType: 'end', label: 'הוסף סיום' },
  { nodeType: 'parameterUpdate', label: 'הוסף עדכון פרמטר' },
  { nodeType: 'condition', label: 'הוסף תנאי IF/THEN' },
  { nodeType: 'action', label: 'הוסף יציאה ל-ACTION' },
  { nodeType: 'tool', label: 'הוסף יציאה לכלי' },
]

const decisionNodeTypes = new Set<DecisionNodeType>(
  [...sidebarActions.map((action) => action.nodeType), 'note'],
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
const stepReferencePattern = /\bSTEP-\d+\b/g

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

const getStepReferencesFromText = (text: string) => [
  ...new Set(text.match(stepReferencePattern) ?? []),
]

const getStepNumberFromId = (stepId: string) => {
  const stepIdMatch = stepId.match(stepIdPattern)

  return stepIdMatch ? Number(stepIdMatch[1]) : Number.POSITIVE_INFINITY
}

const getFirstScenarioNode = (nodes: DecisionNode[]) =>
  nodes.reduce<DecisionNode | null>((firstNode, node) => {
    if (!firstNode) {
      return node
    }

    return getStepNumberFromId(node.id) < getStepNumberFromId(firstNode.id)
      ? node
      : firstNode
  }, null)

const DIRECT_SOURCE_HANDLE_ID = 'out'
const DIRECT_EDGE_LABEL = 'המשך'
const CONDITION_THEN_HANDLE_ID = 'condition-then'
const CONDITION_ELSE_HANDLE_ID = 'condition-else'
const conditionSourceHandleLabels: Record<string, string> = {
  [CONDITION_THEN_HANDLE_ID]: 'מתקיים',
  [CONDITION_ELSE_HANDLE_ID]: 'לא מתקיים',
}
const DEFAULT_EDGE_STYLE: EdgeStyle = 'curved'
const TARGET_HANDLE_TOP: TargetHandleId = 'target-top'
const TARGET_HANDLE_RIGHT: TargetHandleId = 'target-right'
const TARGET_HANDLE_BOTTOM: TargetHandleId = 'target-bottom'
const TARGET_HANDLE_LEFT: TargetHandleId = 'target-left'
const targetHandleConfigs: Array<{
  className: string
  id: TargetHandleId
  position: Position
}> = [
  {
    className: 'decision-node__target-handle decision-node__target-handle--top',
    id: TARGET_HANDLE_TOP,
    position: Position.Top,
  },
  {
    className: 'decision-node__target-handle decision-node__target-handle--right',
    id: TARGET_HANDLE_RIGHT,
    position: Position.Right,
  },
  {
    className: 'decision-node__target-handle decision-node__target-handle--bottom',
    id: TARGET_HANDLE_BOTTOM,
    position: Position.Bottom,
  },
  {
    className: 'decision-node__target-handle decision-node__target-handle--left',
    id: TARGET_HANDLE_LEFT,
    position: Position.Left,
  },
]
const initialViewport: Viewport = { x: 40, y: 40, zoom: 0.95 }
const nodeLayoutWidth = 218
const nodeLayoutHeight = 140
const initialScenarioTabId = 'scenario-tab-1'

const createEmptyScenarioTab = (id: string, name: string): ScenarioTab => ({
  edgeStyle: DEFAULT_EDGE_STYLE,
  edges: [],
  editorViewport: initialViewport,
  id,
  isValidationPanelOpen: false,
  name,
  nodes: [],
  scenarioMetadata: { ...initialScenarioMetadata },
  selectedEdgeId: null,
  selectedNodeId: null,
  validationReport: null,
})

const hasScenarioTabContent = (tab: Pick<ScenarioTab, 'edges' | 'nodes'>) =>
  tab.nodes.length > 0 || tab.edges.length > 0

const internalNodeTypes = new Set<DecisionNodeType>([
  'agentInstruction',
  'parameterUpdate',
  'condition',
  'action',
  'tool',
])

const isInternalNodeType = (nodeType: DecisionNodeType) =>
  internalNodeTypes.has(nodeType)

const isTerminalNodeType = (nodeType: DecisionNodeType) =>
  nodeType === 'end' || nodeType === 'action'

const supportsOptions = (nodeType: DecisionNodeType) =>
  !isTerminalNodeType(nodeType) && !isInternalNodeType(nodeType)

const conditionOperatorRequiresValue = (operator: ConditionOperator) =>
  !conditionOperatorsWithoutValue.has(operator)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isDecisionNodeType = (value: unknown): value is DecisionNodeType =>
  typeof value === 'string' && decisionNodeTypes.has(value as DecisionNodeType)

const isConditionLogic = (value: unknown): value is ConditionLogic =>
  value === 'all' || value === 'any'

const isConditionOperator = (value: unknown): value is ConditionOperator =>
  typeof value === 'string' &&
  conditionOperators.includes(value as ConditionOperator)

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

const getEdgeStyleFromUnknown = (value: unknown): EdgeStyle =>
  value === 'curved' || value === 'orthogonal' ? value : DEFAULT_EDGE_STYLE

const createEmptyConditionRule = (id: string): DecisionConditionRule => ({
  id,
  parameterName: '',
  operator: 'equals',
  value: '',
})

const createNodeData = (
  nodeType: DecisionNodeType,
  conditionRuleId = 'condition-rule-1',
): DecisionNodeData => ({
  nodeType,
  script: '',
  options: [],
  images: [],
  links: [],
  parameterUpdates: [],
  actions: [],
  tools: [],
  parameterUpdate: {
    name: '',
    value: '',
  },
  action: {
    name: '',
  },
  tool: {
    name: '',
  },
  condition: {
    logic: 'all',
    rules:
      nodeType === 'condition'
        ? [createEmptyConditionRule(conditionRuleId)]
        : [],
  },
})

const normalizeOptions = (
  options: Array<DecisionOption | string> | undefined,
): DecisionOption[] =>
  (options ?? []).map((option, optionIndex) =>
    typeof option === 'string'
      ? { id: `option-${optionIndex + 1}`, label: option }
      : {
          id: option.id,
          label: option.label,
          next: option.next,
        },
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

const normalizeStandaloneParameterUpdate = (
  parameterUpdate: Partial<StandaloneParameterUpdate> | undefined,
): StandaloneParameterUpdate => ({
  name: parameterUpdate?.name ?? '',
  value: parameterUpdate?.value ?? '',
})

const normalizeStandaloneAction = (
  action: Partial<StandaloneAction> | undefined,
): StandaloneAction => ({
  name: action?.name ?? '',
})

const normalizeStandaloneTool = (
  tool: Partial<StandaloneTool> | undefined,
): StandaloneTool => ({
  name: tool?.name ?? '',
})

const normalizeCondition = (
  condition: LegacyDecisionNodeData['condition'] | undefined,
): DecisionCondition => ({
  logic: isConditionLogic(condition?.logic) ? condition.logic : 'all',
  rules: (condition?.rules ?? []).map((rule, ruleIndex) => ({
    id: rule.id ?? `condition-rule-${ruleIndex + 1}`,
    parameterName: rule.parameterName ?? '',
    operator: isConditionOperator(rule.operator) ? rule.operator : 'equals',
    value: rule.value ?? '',
  })),
})

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
    parameterUpdates: normalizeParameterUpdates(data.parameterUpdates),
    actions: normalizeActions(data.actions),
    tools: normalizeTools(data.tools),
    parameterUpdate: normalizeStandaloneParameterUpdate(data.parameterUpdate),
    action: normalizeStandaloneAction(data.action),
    tool: normalizeStandaloneTool(data.tool),
    condition: normalizeCondition(data.condition),
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
    onStandaloneActionChange: data.onStandaloneActionChange,
    onStandaloneParameterUpdateChange: data.onStandaloneParameterUpdateChange,
    onStandaloneToolChange: data.onStandaloneToolChange,
    onToggleMultiSelect: data.onToggleMultiSelect,
  }
}

const isDirectSourceHandle = (sourceHandle: string | null | undefined) =>
  sourceHandle === null ||
  sourceHandle === undefined ||
  sourceHandle === DIRECT_SOURCE_HANDLE_ID

const isConditionSourceHandle = (sourceHandle: string | null | undefined) =>
  sourceHandle === CONDITION_THEN_HANDLE_ID ||
  sourceHandle === CONDITION_ELSE_HANDLE_ID

const getAllowedOutgoingHandles = (sourceData: DecisionNodeData) => {
  if (isTerminalNodeType(sourceData.nodeType)) {
    return []
  }

  if (sourceData.nodeType === 'condition') {
    return [CONDITION_THEN_HANDLE_ID, CONDITION_ELSE_HANDLE_ID]
  }

  if (supportsOptions(sourceData.nodeType) && sourceData.options.length > 0) {
    return sourceData.options.map((option) => option.id)
  }

  return [DIRECT_SOURCE_HANDLE_ID]
}

const getOptionEdgeLabel = (optionLabel: string) =>
  optionLabel.trim() || 'אפשרות ללא טקסט'

const getEdgeLabel = (sourceData: DecisionNodeData, sourceHandle?: string | null) => {
  if (isDirectSourceHandle(sourceHandle)) {
    return DIRECT_EDGE_LABEL
  }

  if (isConditionSourceHandle(sourceHandle)) {
    return conditionSourceHandleLabels[sourceHandle] ?? ''
  }

  const option = sourceData.options.find((currentOption) => currentOption.id === sourceHandle)

  return option ? getOptionEdgeLabel(option.label) : ''
}

const getSourceHandleDisplayLabel = (
  sourceData: DecisionNodeData,
  sourceHandle: string,
) => {
  if (isDirectSourceHandle(sourceHandle)) {
    return DIRECT_EDGE_LABEL
  }

  if (isConditionSourceHandle(sourceHandle)) {
    return conditionSourceHandleLabels[sourceHandle] ?? sourceHandle
  }

  const option = sourceData.options.find(
    (currentOption) => currentOption.id === sourceHandle,
  )

  return option ? `אפשרות: ${getOptionEdgeLabel(option.label)}` : sourceHandle
}

const getAvailableSourceHandleOptions = (
  node: DecisionNode | null,
  edges: DecisionEdge[],
  includeConnectedHandles = false,
): SourceHandleOption[] => {
  if (!node) {
    return []
  }

  const nodeData = normalizeNodeData(node.data)

  return getAllowedOutgoingHandles(nodeData)
    .flatMap((sourceHandle) => {
      const currentEdge = getOutgoingEdgeForHandle(edges, node.id, sourceHandle)

      if (currentEdge && !includeConnectedHandles) {
        return []
      }

      return [
        {
          currentTargetId: currentEdge?.target,
          value: sourceHandle,
          label: getSourceHandleDisplayLabel(nodeData, sourceHandle),
        },
      ]
    })
}

const getInternalNodeSummaryItems = (nodeData: DecisionNodeData) => {
  if (nodeData.nodeType === 'condition') {
    return [
      conditionLogicLabels[nodeData.condition.logic],
      `כללים: ${nodeData.condition.rules.length}`,
    ]
  }

  return []
}

const getEditableInternalNodeFields = (
  nodeData: DecisionNodeData,
): InternalEditableField[] => {
  if (nodeData.nodeType === 'parameterUpdate') {
    return [
      {
        id: 'parameterName',
        label: 'שם פרמטר',
        value: nodeData.parameterUpdate.name,
        emptyLabel: 'לא הוגדר שם פרמטר',
        ariaLabel: 'עריכת שם פרמטר',
      },
      {
        id: 'parameterValue',
        label: 'ערך פרמטר',
        value: nodeData.parameterUpdate.value,
        emptyLabel: 'לא הוגדר ערך',
        ariaLabel: 'עריכת ערך פרמטר',
      },
    ]
  }

  if (nodeData.nodeType === 'action') {
    return [
      {
        id: 'actionName',
        label: 'שם ACTION',
        value: nodeData.action.name,
        emptyLabel: 'לא הוגדר ACTION',
        ariaLabel: 'עריכת שם ACTION',
      },
    ]
  }

  if (nodeData.nodeType === 'tool') {
    return [
      {
        id: 'toolName',
        label: 'שם כלי',
        value: nodeData.tool.name,
        emptyLabel: 'לא הוגדר כלי',
        ariaLabel: 'עריכת שם כלי',
      },
    ]
  }

  return []
}

const getInternalNodeBadgeLabel = (nodeType: DecisionNodeType) =>
  nodeType === 'action'
    ? 'פנימי · מסיים תסריט'
    : nodeType === 'agentInstruction'
      ? 'פנימי · הוראה לסוכן'
      : 'פנימי · מבוצע מאחורי הקלעים'

const getScriptFieldLabel = (nodeType: DecisionNodeType) =>
  nodeType === 'agentInstruction' ? 'הוראה לסוכן' : 'טקסט לנציג'

const getScriptPlaceholder = (nodeType: DecisionNodeType) =>
  nodeType === 'agentInstruction'
    ? 'הוראת הסוכן תופיע כאן'
    : isInternalNodeType(nodeType)
      ? 'תיאור פנימי אופציונלי'
      : 'טקסט התסריט יופיע כאן'

const shouldShowScriptFieldInSidePanel = (nodeType: DecisionNodeType) =>
  !isInternalNodeType(nodeType) || nodeType === 'agentInstruction'

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

const canCreateOutgoingConnection = (
  sourceId: string,
  sourceHandle: string | null | undefined,
  nodes: DecisionNode[],
  edges: DecisionEdge[],
) => {
  const sourceData = getNodeDataById(nodes, sourceId)

  if (!sourceData || isTerminalNodeType(sourceData.nodeType)) {
    return false
  }

  const normalizedSourceHandle = isDirectSourceHandle(sourceHandle)
    ? DIRECT_SOURCE_HANDLE_ID
    : sourceHandle

  if (
    !normalizedSourceHandle ||
    !getAllowedOutgoingHandles(sourceData).includes(normalizedSourceHandle)
  ) {
    return false
  }

  return !edges.some(
    (edge) =>
      edge.source === sourceId &&
      (edge.sourceHandle ?? DIRECT_SOURCE_HANDLE_ID) === normalizedSourceHandle,
  )
}

const getClientPositionFromEvent = (
  event: MouseEvent | TouchEvent,
): XYPosition | null => {
  if ('changedTouches' in event) {
    const touch = event.changedTouches[0]

    return touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  return { x: event.clientX, y: event.clientY }
}

const clampNumber = (value: number, min: number, max: number) => {
  const lowerBound = Math.min(min, max)
  const upperBound = Math.max(min, max)

  return Math.min(Math.max(value, lowerBound), upperBound)
}

const getNodeCenterPosition = (node: DecisionNode) => ({
  x:
    node.position.x +
    (typeof node.width === 'number' ? node.width : nodeLayoutWidth) / 2,
  y:
    node.position.y +
    (typeof node.height === 'number' ? node.height : nodeLayoutHeight) / 2,
})

const getNodeBounds = (node: DecisionNode) => ({
  minX: node.position.x,
  minY: node.position.y,
  maxX:
    node.position.x +
    (typeof node.width === 'number' ? node.width : nodeLayoutWidth),
  maxY:
    node.position.y +
    (typeof node.height === 'number' ? node.height : nodeLayoutHeight),
})

const getNodesBounds = (nodes: DecisionNode[]) => {
  if (nodes.length === 0) {
    return null
  }

  return nodes.reduce(
    (bounds, node) => {
      const nodeBounds = getNodeBounds(node)

      return {
        minX: Math.min(bounds.minX, nodeBounds.minX),
        minY: Math.min(bounds.minY, nodeBounds.minY),
        maxX: Math.max(bounds.maxX, nodeBounds.maxX),
        maxY: Math.max(bounds.maxY, nodeBounds.maxY),
      }
    },
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  )
}

const boundsOverlap = (
  firstBounds: NonNullable<ReturnType<typeof getNodesBounds>>,
  secondBounds: NonNullable<ReturnType<typeof getNodesBounds>>,
  margin = 48,
) =>
  firstBounds.minX - margin < secondBounds.maxX &&
  firstBounds.maxX + margin > secondBounds.minX &&
  firstBounds.minY - margin < secondBounds.maxY &&
  firstBounds.maxY + margin > secondBounds.minY

const getAppendPlacementOffset = (
  importedNodes: DecisionNode[],
  currentNodes: DecisionNode[],
  preferredTopLeft: XYPosition,
) => {
  const importedBounds = getNodesBounds(importedNodes)
  const currentBounds = getNodesBounds(currentNodes)

  if (!importedBounds) {
    return { x: 0, y: 0 }
  }

  const importedWidth = importedBounds.maxX - importedBounds.minX
  const importedHeight = importedBounds.maxY - importedBounds.minY
  const candidateOffsets = [
    { x: 0, y: 0 },
    { x: nodeLayoutWidth + 120, y: 0 },
    { x: 0, y: nodeLayoutHeight + 120 },
    { x: -(importedWidth + 120), y: 0 },
    { x: 0, y: -(importedHeight + 120) },
    { x: nodeLayoutWidth + 120, y: nodeLayoutHeight + 120 },
    { x: nodeLayoutWidth * 2 + 220, y: 0 },
  ]

  for (const candidateOffset of candidateOffsets) {
    const offset = {
      x: preferredTopLeft.x + candidateOffset.x - importedBounds.minX,
      y: preferredTopLeft.y + candidateOffset.y - importedBounds.minY,
    }
    const shiftedBounds = {
      minX: importedBounds.minX + offset.x,
      minY: importedBounds.minY + offset.y,
      maxX: importedBounds.maxX + offset.x,
      maxY: importedBounds.maxY + offset.y,
    }

    if (!currentBounds || !boundsOverlap(shiftedBounds, currentBounds)) {
      return offset
    }
  }

  return {
    x:
      preferredTopLeft.x + nodeLayoutWidth * 2 + 220 - importedBounds.minX,
    y: preferredTopLeft.y - importedBounds.minY,
  }
}

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

const getConnectionWithPreferredHandles = (
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

const getDirectSourcePositionForNode = (
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

  if (isTerminalNodeType(sourceData.nodeType)) {
    return false
  }

  const sourceHandle = connection.sourceHandle
  const normalizedSourceHandle = isDirectSourceHandle(sourceHandle)
    ? DIRECT_SOURCE_HANDLE_ID
    : sourceHandle

  if (
    !normalizedSourceHandle ||
    !getAllowedOutgoingHandles(sourceData).includes(normalizedSourceHandle)
  ) {
    return false
  }

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

    if (isTerminalNodeType(sourceData.nodeType)) {
      didChange = true
      continue
    }

    const normalizedSourceHandle = isDirectSourceHandle(edge.sourceHandle)
      ? DIRECT_SOURCE_HANDLE_ID
      : edge.sourceHandle

    const isValidHandle =
      Boolean(normalizedSourceHandle) &&
      getAllowedOutgoingHandles(sourceData).includes(normalizedSourceHandle)

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

    const label = getEdgeLabel(sourceData, normalizedSourceHandle)
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

    if (!isInternalNodeType(nodeData.nodeType) && !nodeData.script.trim()) {
      addError(`בשלב ${stepLabel} חסר טקסט לנציג.`, node.id)
    }

    if (nodeData.nodeType === 'agentInstruction') {
      if (!nodeData.script.trim()) {
        addError(`בשלב ${stepLabel} חסרה הוראה לסוכן.`, node.id)
      }

      getStepReferencesFromText(nodeData.script).forEach((referencedStepId) => {
        if (!nodeIdSet.has(referencedStepId)) {
          addWarning(
            `בשלב ${stepLabel}, ההוראה לסוכן מזכירה שלב שלא קיים: ${referencedStepId}.`,
            node.id,
          )
        }
      })
    }

    if (isTerminalNodeType(nodeData.nodeType)) {
      if (edges.some((edge) => edge.source === node.id)) {
        addError(
          nodeData.nodeType === 'action'
            ? `שלב ACTION ${stepLabel} מסיים את התסריט ולא יכול לכלול חיבורים יוצאים.`
            : `שלב סיום ${stepLabel} לא יכול לכלול חיבורים יוצאים.`,
          node.id,
        )
      }

      if (nodeData.nodeType === 'action' && !nodeData.action.name.trim()) {
        addError(`בשלב ${stepLabel} חסר שם ACTION.`, node.id)
      }

      return
    }

    if (nodeData.nodeType === 'parameterUpdate') {
      if (!nodeData.parameterUpdate.name.trim()) {
        addError(`בשלב ${stepLabel} חסר שם פרמטר לעדכון.`, node.id)
      }

      if (!nodeData.parameterUpdate.value.trim()) {
        addError(`בשלב ${stepLabel} חסר ערך פרמטר לעדכון.`, node.id)
      }
    }

    if (nodeData.nodeType === 'tool' && !nodeData.tool.name.trim()) {
      addError(`בשלב ${stepLabel} חסר שם כלי.`, node.id)
    }

    if (nodeData.nodeType === 'condition') {
      if (nodeData.condition.rules.length === 0) {
        addError(`בשלב ${stepLabel} חייב להיות לפחות כלל תנאי אחד.`, node.id)
      }

      nodeData.condition.rules.forEach((rule, ruleIndex) => {
        const ruleLabel = `כלל ${ruleIndex + 1}`

        if (!rule.parameterName.trim()) {
          addError(`בשלב ${stepLabel}, ${ruleLabel} חסר שם פרמטר.`, node.id)
        }

        if (!isConditionOperator(rule.operator)) {
          addError(`בשלב ${stepLabel}, ${ruleLabel} מכיל אופרטור לא תקין.`, node.id)
        }

        if (
          conditionOperatorRequiresValue(rule.operator) &&
          !rule.value.trim()
        ) {
          addError(`בשלב ${stepLabel}, ${ruleLabel} חסר ערך להשוואה.`, node.id)
        }
      })

      ;[
        [CONDITION_THEN_HANDLE_ID, 'מתקיים'],
        [CONDITION_ELSE_HANDLE_ID, 'לא מתקיים'],
      ].forEach(([sourceHandle, label]) => {
        const branchEdge = getOutgoingEdgeForHandle(edges, node.id, sourceHandle)

        if (!branchEdge) {
          addError(`בשלב ${stepLabel}, ענף "${label}" לא מחובר לשלב יעד.`, node.id)

          return
        }

        if (!nodeIdSet.has(branchEdge.target)) {
          addError(
            `בשלב ${stepLabel}, ענף "${label}" מצביע לשלב שלא קיים: ${branchEdge.target || 'ללא מזהה'}.`,
            node.id,
          )
        }
      })

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
    addWarning('קישור לפריט במאגר המידע ריק.')
  }

  if (!scenarioMetadata.scenarioDescription.trim()) {
    addWarning('תיאור כללי של התסריט ריק.')
  }

  return { errors, warnings }
}

const createAutoLayoutPositions = (
  steps: Array<{ id: string }>,
  edges: Array<Pick<DecisionEdge, 'source' | 'target'>>,
) => {
  const graph = new dagre.graphlib.Graph()

  graph.setGraph({
    marginx: 80,
    marginy: 80,
    nodesep: 80,
    rankdir: 'RL',
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
              : 80 + (2 - fallbackColumn) * 280,
          y:
            typeof layoutNode?.y === 'number'
              ? layoutNode.y - nodeLayoutHeight / 2
              : 80 + fallbackRow * 180,
        },
      ]
    }),
  )
}

const cloneNodeDataPreservingIds = (nodeData: DecisionNodeData): DecisionNodeData => ({
  action: { ...nodeData.action },
  actions: nodeData.actions.map((action) => ({ ...action })),
  condition: {
    logic: nodeData.condition.logic,
    rules: nodeData.condition.rules.map((rule) => ({ ...rule })),
  },
  images: nodeData.images.map((image) => ({ ...image })),
  links: nodeData.links.map((link) => ({ ...link })),
  nodeType: nodeData.nodeType,
  options: nodeData.options.map((option) => ({ ...option })),
  parameterUpdate: { ...nodeData.parameterUpdate },
  parameterUpdates: nodeData.parameterUpdates.map((parameterUpdate) => ({
    ...parameterUpdate,
  })),
  script: nodeData.script,
  tool: { ...nodeData.tool },
  tools: nodeData.tools.map((tool) => ({ ...tool })),
})

const getInternalSubgraphEdges = (
  edges: DecisionEdge[],
  selectedNodeIdSet: Set<string>,
) =>
  edges.filter(
    (edge) =>
      selectedNodeIdSet.has(edge.source) && selectedNodeIdSet.has(edge.target),
  )

const getReachableTreeNodeIds = (
  nodes: DecisionNode[],
  edges: DecisionEdge[],
  startNodeId: string,
  initialSourceHandles?: string[],
) => {
  const reachableNodeIds = new Set([startNodeId])
  const queuedNodeIds: string[] = []
  const enqueueTargets = (sourceId: string, sourceHandles?: string[]) => {
    const sourceData = getNodeDataById(nodes, sourceId)

    if (!sourceData || isTerminalNodeType(sourceData.nodeType)) {
      return
    }

    const allowedSourceHandles = sourceHandles
      ? new Set(
          sourceHandles.map((sourceHandle) =>
            isDirectSourceHandle(sourceHandle)
              ? DIRECT_SOURCE_HANDLE_ID
              : sourceHandle,
          ),
        )
      : null

    edges.forEach((edge) => {
      const sourceHandle = edge.sourceHandle ?? DIRECT_SOURCE_HANDLE_ID

      if (
        edge.source !== sourceId ||
        (allowedSourceHandles && !allowedSourceHandles.has(sourceHandle)) ||
        reachableNodeIds.has(edge.target)
      ) {
        return
      }

      reachableNodeIds.add(edge.target)
      queuedNodeIds.push(edge.target)
    })
  }

  enqueueTargets(startNodeId, initialSourceHandles)

  while (queuedNodeIds.length > 0) {
    const nextNodeId = queuedNodeIds.shift()

    if (nextNodeId) {
      enqueueTargets(nextNodeId)
    }
  }

  return reachableNodeIds
}

const cloneSubgraphWithNewIds = ({
  basePosition,
  layoutMode,
  pasteOffset = { x: 0, y: 0 },
  reservedNodeIds,
  sourceEdges,
  sourceEntryNodeId,
  sourceNodes,
  sourceNodeIds,
}: {
  basePosition?: XYPosition
  layoutMode: 'auto' | 'viewport'
  pasteOffset?: XYPosition
  reservedNodeIds: Iterable<string>
  sourceEdges: DecisionEdge[]
  sourceEntryNodeId: string
  sourceNodeIds: string[]
  sourceNodes: DecisionNode[]
}) => {
  const selectedNodeIdSet = new Set(sourceNodeIds)
  const selectedNodes = sourceNodes.filter((node) => selectedNodeIdSet.has(node.id))
  const reservedIds = new Set(reservedNodeIds)
  const nodeIdMap = new Map<string, string>()
  const optionIdMaps = new Map<string, Map<string, string>>()
  const internalTargetBySourceHandle = new Map<string, string>()
  let nextOptionId = 1
  let nextImageId = 1
  let nextLinkId = 1
  let nextParameterUpdateId = 1
  let nextActionId = 1
  let nextToolId = 1
  let nextConditionRuleId = 1

  selectedNodes.forEach((node) => {
    const nodeData = normalizeNodeData(node.data)
    const nextNodeId = getNextStepId(reservedIds)
    const optionIdMap = new Map<string, string>()

    nodeData.options.forEach((option) => {
      const optionId = `option-${nextOptionId}`

      nextOptionId += 1
      optionIdMap.set(option.id, optionId)
    })

    nodeIdMap.set(node.id, nextNodeId)
    optionIdMaps.set(node.id, optionIdMap)
    reservedIds.add(nextNodeId)
  })

  getInternalSubgraphEdges(sourceEdges, selectedNodeIdSet).forEach((edge) => {
    const sourceHandle = edge.sourceHandle ?? DIRECT_SOURCE_HANDLE_ID

    internalTargetBySourceHandle.set(`${edge.source}:${sourceHandle}`, edge.target)
  })

  const clonedNodes: DecisionNode[] = selectedNodes.map((node) => {
    const nodeData = normalizeNodeData(node.data)
    const nextNodeId = nodeIdMap.get(node.id) ?? node.id
    const optionIdMap = optionIdMaps.get(node.id) ?? new Map<string, string>()
    const options = nodeData.options.map((option) => {
      const oldTargetId = internalTargetBySourceHandle.get(`${node.id}:${option.id}`)
      const remappedTargetId = oldTargetId ? nodeIdMap.get(oldTargetId) : undefined

      return {
        ...option,
        id: optionIdMap.get(option.id) ?? option.id,
        next: remappedTargetId,
      }
    })

    return {
      ...node,
      id: nextNodeId,
      position: { ...node.position },
      selected: true,
      data: {
        action: { ...nodeData.action },
        actions: nodeData.actions.map((action) => ({
          ...action,
          id: `action-${nextActionId++}`,
        })),
        condition: {
          logic: nodeData.condition.logic,
          rules: nodeData.condition.rules.map((rule) => ({
            ...rule,
            id: `condition-rule-${nextConditionRuleId++}`,
          })),
        },
        images: nodeData.images.map((image) => ({
          ...image,
          id: `image-${nextImageId++}`,
        })),
        links: nodeData.links.map((link) => ({
          ...link,
          id: `link-${nextLinkId++}`,
        })),
        nodeType: nodeData.nodeType,
        options,
        parameterUpdate: { ...nodeData.parameterUpdate },
        parameterUpdates: nodeData.parameterUpdates.map((parameterUpdate) => ({
          ...parameterUpdate,
          id: `parameter-${nextParameterUpdateId++}`,
        })),
        script: nodeData.script,
        tool: { ...nodeData.tool },
        tools: nodeData.tools.map((tool) => ({
          ...tool,
          id: `tool-${nextToolId++}`,
        })),
      },
    }
  })

  const edgeDrafts = Array.from(internalTargetBySourceHandle.entries()).flatMap(
    ([sourceKey, targetId]) => {
      const sourceHandleSeparatorIndex = sourceKey.indexOf(':')
      const edge = {
        source: sourceKey.slice(0, sourceHandleSeparatorIndex),
        sourceHandle: sourceKey.slice(sourceHandleSeparatorIndex + 1),
        target: targetId,
      }
      const source = nodeIdMap.get(edge.source)
      const target = nodeIdMap.get(edge.target)
      const sourceHandle = edge.sourceHandle ?? DIRECT_SOURCE_HANDLE_ID
      const mappedSourceHandle = isDirectSourceHandle(sourceHandle)
        ? DIRECT_SOURCE_HANDLE_ID
        : isConditionSourceHandle(sourceHandle)
          ? sourceHandle
          : optionIdMaps.get(edge.source)?.get(sourceHandle)

      if (!source || !target || !mappedSourceHandle) {
        return []
      }

      return [
        {
          source,
          sourceHandle: mappedSourceHandle,
          target,
        },
      ]
    },
  )
  const positionedNodes =
    layoutMode === 'auto'
      ? (() => {
          const layoutPositions = createAutoLayoutPositions(
            clonedNodes.map((node) => ({ id: node.id })),
            edgeDrafts.map((edge) => ({
              source: edge.source,
              target: edge.target,
            })),
          )

          return clonedNodes.map((node) => ({
            ...node,
            position: layoutPositions[node.id] ?? node.position,
          }))
        })()
      : (() => {
          const bounds = getNodesBounds(clonedNodes)
          const offset = bounds
            ? {
                x:
                  (basePosition?.x ?? bounds.minX) +
                  pasteOffset.x -
                  bounds.minX,
                y:
                  (basePosition?.y ?? bounds.minY) +
                  pasteOffset.y -
                  bounds.minY,
              }
            : pasteOffset

          return clonedNodes.map((node) => ({
            ...node,
            position: {
              x: node.position.x + offset.x,
              y: node.position.y + offset.y,
            },
          }))
        })()
  const clonedNodeDataById = new Map(
    positionedNodes.map((node) => [node.id, normalizeNodeData(node.data)]),
  )
  const clonedEdges = edgeDrafts.flatMap((edge) => {
    const sourceData = clonedNodeDataById.get(edge.source)

    if (!sourceData) {
      return []
    }

    return [
      createDecisionEdge(
        getConnectionWithPreferredHandles(
          {
            source: edge.source,
            sourceHandle: edge.sourceHandle,
            target: edge.target,
            targetHandle: null,
          },
          positionedNodes,
        ),
        sourceData,
      ),
    ]
  })

  return {
    edges: clonedEdges,
    entryNodeId: nodeIdMap.get(sourceEntryNodeId) ?? '',
    nodeIdMap,
    nodes: positionedNodes,
  }
}

const getImportedEditorLayout = (editorValue: unknown) => {
  const positions: Record<string, { x: number; y: number }> = {}

  if (!isRecord(editorValue)) {
    return {
      edgeStyle: DEFAULT_EDGE_STYLE,
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
    edgeStyle: getEdgeStyleFromUnknown(editorValue.edgeStyle),
    hasEditorSection: Object.keys(positions).length > 0,
    positions,
    viewport: getViewportFromUnknown(editorValue.viewport),
  }
}

const getImportedStepOutgoingConnections = (step: ImportedStep) => {
  if (isTerminalNodeType(step.nodeType)) {
    return []
  }

  if (step.nodeType === 'condition') {
    return [
      {
        source: step.id,
        sourceHandle: CONDITION_THEN_HANDLE_ID,
        target: step.condition.thenNext,
      },
      {
        source: step.id,
        sourceHandle: CONDITION_ELSE_HANDLE_ID,
        target: step.condition.elseNext,
      },
    ].filter((connection) => connection.target)
  }

  if (supportsOptions(step.nodeType) && step.options.length > 0) {
    return step.options.flatMap((option, optionIndex) =>
      option.next
        ? [
            {
              source: step.id,
              sourceHandle: `option-${optionIndex + 1}`,
              target: option.next,
            },
          ]
        : [],
    )
  }

  return step.next
    ? [
        {
          source: step.id,
          sourceHandle: DIRECT_SOURCE_HANDLE_ID,
          target: step.next,
        },
      ]
    : []
}

const parseYamlImportText = (
  yamlText: string,
  options: ParseYamlImportOptions = {},
) => {
  const errors: string[] = []
  const allowedExternalStepIds = options.allowedExternalStepIds ?? new Set<string>()
  const blockedTargetStepIds = options.blockedTargetStepIds ?? new Set<string>()

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
    const nodeType = isDecisionNodeType(stepType) ? stepType : null
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

    if (!nodeType) {
      errors.push(
        `בשלב ${stepId || stepIndex + 1}, type חייב להיות אחד מסוגי השלבים הנתמכים.`,
      )
    }

    if (script !== undefined && typeof script !== 'string') {
      errors.push(`בשלב ${stepId || stepIndex + 1}, script חייב להיות טקסט.`)
    }

    if (nodeType && !isInternalNodeType(nodeType) && typeof script !== 'string') {
      errors.push(`בשלב ${stepId || stepIndex + 1}, חסר script תקין.`)
    }

    if (
      nodeType === 'agentInstruction' &&
      (typeof script !== 'string' || !script.trim())
    ) {
      errors.push(`בשלב ${stepId || stepIndex + 1}, חסרה הוראה לסוכן ב-script.`)
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

    const parameterUpdates: Array<Omit<DecisionParameterUpdate, 'id'>> = []

    if (stepValue.parameterUpdates !== undefined) {
      if (!Array.isArray(stepValue.parameterUpdates)) {
        errors.push(
          `בשלב ${stepId || stepIndex + 1}, parameterUpdates חייב להיות מערך.`,
        )
      } else {
        stepValue.parameterUpdates.forEach((parameterValue, parameterIndex) => {
          if (!isRecord(parameterValue)) {
            errors.push(
              `בשלב ${stepId || stepIndex + 1}, עדכון פרמטר ${parameterIndex + 1} אינו תקין.`,
            )

            return
          }

          parameterUpdates.push({
            name: getStringValue(parameterValue.name),
            value: getStringValue(parameterValue.value),
          })
        })
      }
    }

    const actions: Array<Omit<DecisionAction, 'id'>> = []

    if (stepValue.actions !== undefined) {
      if (!Array.isArray(stepValue.actions)) {
        errors.push(`בשלב ${stepId || stepIndex + 1}, actions חייב להיות מערך.`)
      } else {
        stepValue.actions.forEach((actionValue, actionIndex) => {
          if (!isRecord(actionValue)) {
            errors.push(
              `בשלב ${stepId || stepIndex + 1}, פעולה ${actionIndex + 1} אינה תקינה.`,
            )

            return
          }

          actions.push({
            name: getStringValue(actionValue.name),
          })
        })
      }
    }

    const tools: Array<Omit<DecisionTool, 'id'>> = []

    if (stepValue.tools !== undefined) {
      if (!Array.isArray(stepValue.tools)) {
        errors.push(`בשלב ${stepId || stepIndex + 1}, tools חייב להיות מערך.`)
      } else {
        stepValue.tools.forEach((toolValue, toolIndex) => {
          if (!isRecord(toolValue)) {
            errors.push(
              `בשלב ${stepId || stepIndex + 1}, כלי ${toolIndex + 1} אינו תקין.`,
            )

            return
          }

          tools.push({
            name: getStringValue(toolValue.name),
          })
        })
      }
    }

    const parameterUpdate: StandaloneParameterUpdate = {
      name: '',
      value: '',
    }

    if (nodeType === 'parameterUpdate') {
      if (!isRecord(stepValue.parameterUpdate)) {
        errors.push(
          `בשלב ${stepId || stepIndex + 1}, parameterUpdate חייב להיות אובייקט עם name ו-value.`,
        )
      } else {
        parameterUpdate.name = getStringValue(stepValue.parameterUpdate.name)
        parameterUpdate.value = getStringValue(stepValue.parameterUpdate.value)

        if (!parameterUpdate.name.trim()) {
          errors.push(`בשלב ${stepId || stepIndex + 1}, חסר parameterUpdate.name.`)
        }

        if (!parameterUpdate.value.trim()) {
          errors.push(`בשלב ${stepId || stepIndex + 1}, חסר parameterUpdate.value.`)
        }
      }
    }

    const action: StandaloneAction = {
      name: '',
    }

    if (nodeType === 'action') {
      if (!isRecord(stepValue.action)) {
        errors.push(
          `בשלב ${stepId || stepIndex + 1}, action חייב להיות אובייקט עם name.`,
        )
      } else {
        action.name = getStringValue(stepValue.action.name)

        if (!action.name.trim()) {
          errors.push(`בשלב ${stepId || stepIndex + 1}, חסר action.name.`)
        }
      }
    }

    const tool: StandaloneTool = {
      name: '',
    }

    if (nodeType === 'tool') {
      if (!isRecord(stepValue.tool)) {
        errors.push(
          `בשלב ${stepId || stepIndex + 1}, tool חייב להיות אובייקט עם name.`,
        )
      } else {
        tool.name = getStringValue(stepValue.tool.name)

        if (!tool.name.trim()) {
          errors.push(`בשלב ${stepId || stepIndex + 1}, חסר tool.name.`)
        }
      }
    }

    const condition: ImportedStep['condition'] = {
      logic: 'all',
      rules: [],
      thenNext: '',
      elseNext: '',
    }

    if (nodeType === 'condition') {
      if (!isRecord(stepValue.condition)) {
        errors.push(
          `בשלב ${stepId || stepIndex + 1}, condition חייב להיות אובייקט תקין.`,
        )
      } else {
        const conditionValue = stepValue.condition

        if (!isConditionLogic(conditionValue.logic)) {
          errors.push(
            `בשלב ${stepId || stepIndex + 1}, condition.logic חייב להיות all או any.`,
          )
        } else {
          condition.logic = conditionValue.logic
        }

        if (!Array.isArray(conditionValue.rules)) {
          errors.push(
            `בשלב ${stepId || stepIndex + 1}, condition.rules חייב להיות מערך.`,
          )
        } else {
          conditionValue.rules.forEach((ruleValue, ruleIndex) => {
            if (!isRecord(ruleValue)) {
              errors.push(
                `בשלב ${stepId || stepIndex + 1}, כלל תנאי ${ruleIndex + 1} אינו תקין.`,
              )

              return
            }

            const parameterName = getStringValue(ruleValue.parameterName)
            const operator = isConditionOperator(ruleValue.operator)
              ? ruleValue.operator
              : 'equals'
            const value = getStringValue(ruleValue.value)

            if (!parameterName.trim()) {
              errors.push(
                `בשלב ${stepId || stepIndex + 1}, כלל תנאי ${ruleIndex + 1} חסר parameterName.`,
              )
            }

            if (!isConditionOperator(ruleValue.operator)) {
              errors.push(
                `בשלב ${stepId || stepIndex + 1}, כלל תנאי ${ruleIndex + 1} מכיל operator לא נתמך.`,
              )
            }

            if (conditionOperatorRequiresValue(operator) && !value.trim()) {
              errors.push(
                `בשלב ${stepId || stepIndex + 1}, כלל תנאי ${ruleIndex + 1} חסר value.`,
              )
            }

            condition.rules.push({
              parameterName,
              operator,
              value,
            })
          })

          if (condition.rules.length === 0) {
            errors.push(
              `בשלב ${stepId || stepIndex + 1}, condition.rules חייב לכלול לפחות כלל אחד.`,
            )
          }
        }

        if (conditionValue.thenNext !== undefined && typeof conditionValue.thenNext !== 'string') {
          errors.push(`בשלב ${stepId || stepIndex + 1}, condition.thenNext חייב להיות טקסט.`)
        }

        if (conditionValue.elseNext !== undefined && typeof conditionValue.elseNext !== 'string') {
          errors.push(`בשלב ${stepId || stepIndex + 1}, condition.elseNext חייב להיות טקסט.`)
        }

        condition.thenNext = getStringValue(conditionValue.thenNext)
        condition.elseNext = getStringValue(conditionValue.elseNext)

        if (!condition.thenNext.trim()) {
          errors.push(`בשלב ${stepId || stepIndex + 1}, חסר condition.thenNext.`)
        }

        if (!condition.elseNext.trim()) {
          errors.push(`בשלב ${stepId || stepIndex + 1}, חסר condition.elseNext.`)
        }
      }
    }

    const options: ImportedStepOption[] = []

    if (stepValue.options !== undefined) {
      if (nodeType && !supportsOptions(nodeType)) {
        errors.push(
          `בשלב ${stepId || stepIndex + 1}, סוג שלב זה לא תומך ב-options.`,
        )
      } else if (!Array.isArray(stepValue.options)) {
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

    if (
      stepId &&
      nodeType &&
      (isInternalNodeType(nodeType) || typeof script === 'string')
    ) {
      importedSteps.push({
        id: stepId,
        action,
        actions,
        condition,
        images,
        links,
        next: getStringValue(stepValue.next),
        nodeType,
        options,
        parameterUpdate,
        parameterUpdates,
        script: getStringValue(script),
        tool,
        tools,
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
    getImportedStepOutgoingConnections(step).forEach((connection) => {
      if (blockedTargetStepIds.has(connection.target)) {
        errors.push(
          `בשלב ${step.id}, החיבור אל ${connection.target} אינו תקין כי זהו שלב הפתיחה הנוכחי.`,
        )

        return
      }

      if (
        !stepIds.has(connection.target) &&
        !allowedExternalStepIds.has(connection.target)
      ) {
        errors.push(
          `בשלב ${step.id}, ${getSourceHandleDisplayLabel(
            {
              ...createNodeData(step.nodeType),
              options: step.options.map((option, optionIndex) => ({
                id: `option-${optionIndex + 1}`,
                label: option.label,
              })),
            },
            connection.sourceHandle,
          )} מצביע לשלב שלא קיים: ${connection.target}.`,
        )
      }
    })
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
  const edgeDrafts = importedSteps.flatMap((step) =>
    getImportedStepOutgoingConnections(step)
      .filter((connection) => stepIds.has(connection.target))
      .map((connection) => ({
        source: connection.source,
        target: connection.target,
      })),
  )
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
        parameterUpdates: step.parameterUpdates.map(
          (parameterUpdate, parameterUpdateIndex) => ({
            ...parameterUpdate,
            id: `parameter-${parameterUpdateIndex + 1}`,
          }),
        ),
        actions: step.actions.map((action, actionIndex) => ({
          ...action,
          id: `action-${actionIndex + 1}`,
        })),
        tools: step.tools.map((tool, toolIndex) => ({
          ...tool,
          id: `tool-${toolIndex + 1}`,
        })),
        parameterUpdate: step.parameterUpdate,
        action: step.action,
        tool: step.tool,
        condition: {
          logic: step.condition.logic,
          rules: step.condition.rules.map((rule, ruleIndex) => ({
            ...rule,
            id: `condition-rule-${ruleIndex + 1}`,
          })),
        },
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
    const sourceData = importedNodeDataById.get(step.id)

    if (!sourceData) {
      return []
    }

    return getImportedStepOutgoingConnections(step).map((connection) =>
      createDecisionEdge(
        getConnectionWithPreferredHandles(
          {
            source: connection.source,
            sourceHandle: connection.sourceHandle,
            target: connection.target,
            targetHandle: null,
          },
          nodes,
        ),
        sourceData,
      ),
    )
  })
  const maxOptionCount = Math.max(0, ...importedSteps.map((step) => step.options.length))
  const maxImageCount = Math.max(0, ...importedSteps.map((step) => step.images.length))
  const maxLinkCount = Math.max(0, ...importedSteps.map((step) => step.links.length))
  const maxParameterUpdateCount = Math.max(
    0,
    ...importedSteps.map((step) => step.parameterUpdates.length),
  )
  const maxActionCount = Math.max(0, ...importedSteps.map((step) => step.actions.length))
  const maxToolCount = Math.max(0, ...importedSteps.map((step) => step.tools.length))
  const maxConditionRuleCount = Math.max(
    0,
    ...importedSteps.map((step) => step.condition.rules.length),
  )

  return {
    errors: [],
    flow: {
      edges,
      nextActionNumber: maxActionCount + 1,
      nextImageNumber: maxImageCount + 1,
      nextLinkNumber: maxLinkCount + 1,
      nextOptionNumber: maxOptionCount + 1,
      nextParameterUpdateNumber: maxParameterUpdateCount + 1,
      nextConditionRuleNumber: maxConditionRuleCount + 1,
      nextToolNumber: maxToolCount + 1,
      nodes,
      edgeStyle: importedEditorLayout.edgeStyle,
      scenarioMetadata,
      shouldFitView: !importedEditorLayout.hasEditorSection,
      viewport: importedEditorLayout.hasEditorSection
        ? importedEditorLayout.viewport
        : undefined,
    },
  }
}

const buildYamlExport = (
  scenarioMetadata: ScenarioMetadata,
  nodes: DecisionNode[],
  edges: DecisionEdge[],
  viewport: Viewport,
  edgeStyle: EdgeStyle,
  includeDraftSection = false,
): YamlExport => {
  const nodeDataById = new Map(
    nodes.map((node) => [node.id, normalizeNodeData(node.data)]),
  )
  const rawExportEdges = scenarioMetadata.entryNodeId
    ? edges.filter((edge) => edge.target !== scenarioMetadata.entryNodeId)
    : edges
  const exportEdges = rawExportEdges.filter((edge) => {
    const sourceData = nodeDataById.get(edge.source)

    return sourceData
      ? getAllowedOutgoingHandles(sourceData).includes(
          edge.sourceHandle ?? DIRECT_SOURCE_HANDLE_ID,
        )
      : false
  })

  const yamlExport: YamlExport = {
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
        navigation: {
          previousStepIds: getPreviousStepIds(node.id, exportEdges),
          nextStepIds: getNextStepIds(node.id, exportEdges),
        },
      }

      if (isInternalNodeType(nodeData.nodeType)) {
        step.visibility = 'internal'
      }

      if (
        !isInternalNodeType(nodeData.nodeType) ||
        nodeData.nodeType === 'agentInstruction' ||
        nodeData.script.trim()
      ) {
        step.script = nodeData.script
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

      if (nodeData.parameterUpdates.length > 0) {
        step.parameterUpdates = nodeData.parameterUpdates.map((parameterUpdate) => ({
          name: parameterUpdate.name,
          value: parameterUpdate.value,
        }))
      }

      if (nodeData.actions.length > 0) {
        step.actions = nodeData.actions.map((action) => ({
          name: action.name,
        }))
      }

      if (nodeData.tools.length > 0) {
        step.tools = nodeData.tools.map((tool) => ({
          name: tool.name,
        }))
      }

      if (nodeData.nodeType === 'end') {
        return step
      }

      if (nodeData.nodeType === 'parameterUpdate') {
        step.parameterUpdate = {
          name: nodeData.parameterUpdate.name,
          value: nodeData.parameterUpdate.value,
        }

        const directTargetStepId =
          getOutgoingEdgeForHandle(exportEdges, node.id, DIRECT_SOURCE_HANDLE_ID)
            ?.target ?? ''

        if (directTargetStepId) {
          step.next = directTargetStepId
        }

        return step
      }

      if (nodeData.nodeType === 'action') {
        step.action = {
          name: nodeData.action.name,
        }

        return step
      }

      if (nodeData.nodeType === 'tool') {
        step.tool = {
          name: nodeData.tool.name,
        }

        const directTargetStepId =
          getOutgoingEdgeForHandle(exportEdges, node.id, DIRECT_SOURCE_HANDLE_ID)
            ?.target ?? ''

        if (directTargetStepId) {
          step.next = directTargetStepId
        }

        return step
      }

      if (nodeData.nodeType === 'condition') {
        const thenNext =
          getOutgoingEdgeForHandle(exportEdges, node.id, CONDITION_THEN_HANDLE_ID)
            ?.target ?? ''
        const elseNext =
          getOutgoingEdgeForHandle(exportEdges, node.id, CONDITION_ELSE_HANDLE_ID)
            ?.target ?? ''

        step.condition = {
          logic: nodeData.condition.logic,
          rules: nodeData.condition.rules.map((rule) => ({
            parameterName: rule.parameterName,
            operator: rule.operator,
            ...(conditionOperatorRequiresValue(rule.operator)
              ? { value: rule.value }
              : {}),
          })),
        }

        if (thenNext) {
          step.condition.thenNext = thenNext
        }

        if (elseNext) {
          step.condition.elseNext = elseNext
        }

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
      edgeStyle,
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

  if (includeDraftSection) {
    yamlExport.draft = {
      hasValidationIssues: true,
      exportedWithErrors: true,
    }
  }

  return yamlExport
}

const createYamlExportText = (
  scenarioMetadata: ScenarioMetadata,
  nodes: DecisionNode[],
  edges: DecisionEdge[],
  viewport: Viewport,
  edgeStyle: EdgeStyle,
  includeDraftSection = false,
) =>
  stringify(
    buildYamlExport(
      scenarioMetadata,
      nodes,
      edges,
      viewport,
      edgeStyle,
      includeDraftSection,
    ),
    {
      lineWidth: 0,
    },
  )

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
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null)
  const [optionDraft, setOptionDraft] = useState('')
  const [editingInternalField, setEditingInternalField] =
    useState<InternalEditableFieldId | null>(null)
  const [internalFieldDraft, setInternalFieldDraft] = useState('')
  const scriptEditorRef = useRef<HTMLTextAreaElement | null>(null)
  const optionEditorRef = useRef<HTMLInputElement | null>(null)
  const internalFieldEditorRef = useRef<HTMLInputElement | null>(null)
  const shouldSaveScriptOnBlurRef = useRef(true)
  const shouldSaveOptionOnBlurRef = useRef(true)
  const shouldSaveInternalFieldOnBlurRef = useRef(true)
  const canAddOptions = supportsOptions(nodeData.nodeType)
  const hasOptionHandles = canAddOptions && nodeData.options.length > 0
  const hasConditionHandles = nodeData.nodeType === 'condition'
  const hasRegularSourceHandle =
    !isTerminalNodeType(nodeData.nodeType) &&
    nodeData.nodeType !== 'condition' &&
    (!supportsOptions(nodeData.nodeType) || nodeData.options.length === 0)
  const directSourcePosition =
    nodeData.directSourcePosition === 'bottom' ? Position.Bottom : Position.Left
  const isMultiSelected = nodeData.isMultiSelected ?? selected
  const internalEditableFields = getEditableInternalNodeFields(nodeData)
  const internalSummaryItems =
    internalEditableFields.length === 0 ? getInternalNodeSummaryItems(nodeData) : []
  const nodeClassName = [
    'decision-node',
    isInternalNodeType(nodeData.nodeType) ? 'decision-node--internal' : '',
    isMultiSelected ? 'decision-node--multi-selected' : '',
    nodeData.edgeHighlightRole ? 'decision-node--edge-highlighted' : '',
    nodeData.edgeHighlightRole === 'source' ? 'decision-node--edge-source' : '',
    nodeData.edgeHighlightRole === 'target' ? 'decision-node--edge-target' : '',
  ]
    .filter(Boolean)
    .join(' ')

  useEffect(() => {
    updateNodeInternals(id)
  }, [
    nodeData.directSourcePosition,
    nodeData.isEntryNode,
    nodeData.nodeType,
    nodeData.options.length,
    id,
    updateNodeInternals,
  ])

  useEffect(() => {
    if (isEditingScript) {
      scriptEditorRef.current?.focus()
      scriptEditorRef.current?.select()
    }
  }, [isEditingScript])

  useEffect(() => {
    if (editingOptionId !== null) {
      optionEditorRef.current?.focus()
      optionEditorRef.current?.select()
    }
  }, [editingOptionId])

  useEffect(() => {
    if (editingInternalField !== null) {
      internalFieldEditorRef.current?.focus()
      internalFieldEditorRef.current?.select()
    }
  }, [editingInternalField])

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

  const startOptionEditing = (option: DecisionOption) => {
    shouldSaveOptionOnBlurRef.current = true
    setEditingOptionId(option.id)
    setOptionDraft(option.label)
  }

  const saveOptionEditing = () => {
    if (editingOptionId !== null) {
      nodeData.onOptionLabelChange?.(id, editingOptionId, optionDraft)
    }

    setEditingOptionId(null)
  }

  const cancelOptionEditing = () => {
    shouldSaveOptionOnBlurRef.current = false
    setEditingOptionId(null)
    setOptionDraft('')
  }

  const startInternalFieldEditing = (field: InternalEditableField) => {
    shouldSaveInternalFieldOnBlurRef.current = true
    setEditingInternalField(field.id)
    setInternalFieldDraft(field.value)
  }

  const saveInternalFieldEditing = () => {
    if (editingInternalField === 'parameterName') {
      nodeData.onStandaloneParameterUpdateChange?.(id, {
        name: internalFieldDraft,
      })
    }

    if (editingInternalField === 'parameterValue') {
      nodeData.onStandaloneParameterUpdateChange?.(id, {
        value: internalFieldDraft,
      })
    }

    if (editingInternalField === 'actionName') {
      nodeData.onStandaloneActionChange?.(id, {
        name: internalFieldDraft,
      })
    }

    if (editingInternalField === 'toolName') {
      nodeData.onStandaloneToolChange?.(id, {
        name: internalFieldDraft,
      })
    }

    setEditingInternalField(null)
    setInternalFieldDraft('')
  }

  const cancelInternalFieldEditing = () => {
    shouldSaveInternalFieldOnBlurRef.current = false
    setEditingInternalField(null)
    setInternalFieldDraft('')
  }

  const renderInternalEditableField = (field: InternalEditableField) => (
    <div
      key={field.id}
      className="decision-node__internal-field"
      title="לחיצה כפולה לעריכה"
      onDoubleClick={(event) => {
        event.stopPropagation()
        startInternalFieldEditing(field)
      }}
    >
      {editingInternalField === field.id ? (
        <input
          ref={internalFieldEditorRef}
          type="text"
          value={internalFieldDraft}
          dir="rtl"
          className="decision-node__inline-field-editor nodrag nopan"
          aria-label={field.ariaLabel}
          onBlur={() => {
            if (!shouldSaveInternalFieldOnBlurRef.current) {
              shouldSaveInternalFieldOnBlurRef.current = true

              return
            }

            saveInternalFieldEditing()
          }}
          onChange={(event) => setInternalFieldDraft(event.currentTarget.value)}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              cancelInternalFieldEditing()

              return
            }

            if (event.key === 'Enter') {
              event.preventDefault()
              saveInternalFieldEditing()
            }
          }}
          onPointerDown={(event) => event.stopPropagation()}
        />
      ) : (
        <>
          <span className="decision-node__internal-field-label">{field.label}</span>
          <span
            className={[
              'decision-node__internal-field-value',
              field.value.trim()
                ? ''
                : 'decision-node__internal-field-value--empty',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {field.value.trim() || field.emptyLabel}
          </span>
        </>
      )}
    </div>
  )

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

      <button
        type="button"
        className="decision-node__delete-button nodrag nopan"
        title="מחק שלב"
        aria-label="מחק שלב"
        onClick={(event) => {
          event.stopPropagation()
          nodeData.onDeleteNode?.(id)
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        ×
      </button>

      {!nodeData.isEntryNode
        ? targetHandleConfigs.map((handleConfig) => (
            <Handle
              key={handleConfig.id}
              type="target"
              id={handleConfig.id}
              position={handleConfig.position}
              className={`decision-node__handle ${handleConfig.className}`}
            />
          ))
        : null}

      <div className="decision-node__header">
        <span className="decision-node__id">{id}</span>
        <span className="decision-node__type">{typeLabels[nodeData.nodeType]}</span>
      </div>
      {isInternalNodeType(nodeData.nodeType) ? (
        <div className="decision-node__internal-badge">
          {getInternalNodeBadgeLabel(nodeData.nodeType)}
        </div>
      ) : null}
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
          aria-label={`עריכת ${getScriptFieldLabel(nodeData.nodeType)}`}
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
          {scriptText || getScriptPlaceholder(nodeData.nodeType)}
        </p>
      )}

      {internalEditableFields.length > 0 ? (
        <div
          className="decision-node__internal-summary"
          aria-label="פרטי שלב פנימי לעריכה"
        >
          {internalEditableFields.map(renderInternalEditableField)}
        </div>
      ) : null}

      {internalSummaryItems.length > 0 ? (
        <div className="decision-node__internal-summary" aria-label="פרטי שלב פנימי">
          {internalSummaryItems.map((summaryItem) => (
            <span key={summaryItem}>{summaryItem}</span>
          ))}
        </div>
      ) : null}

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
              onDoubleClick={(event) => {
                event.stopPropagation()
                startOptionEditing(option)
              }}
            >
              {editingOptionId === option.id ? (
                <input
                  ref={optionEditorRef}
                  type="text"
                  value={optionDraft}
                  dir="rtl"
                  className="decision-node__option-editor nodrag nopan"
                  aria-label="עריכת אפשרות תשובה"
                  onBlur={() => {
                    if (!shouldSaveOptionOnBlurRef.current) {
                      shouldSaveOptionOnBlurRef.current = true

                      return
                    }

                    saveOptionEditing()
                  }}
                  onChange={(event) => setOptionDraft(event.currentTarget.value)}
                  onClick={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelOptionEditing()

                      return
                    }

                    if (event.key === 'Enter') {
                      event.preventDefault()
                      saveOptionEditing()
                    }
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                />
              ) : (
                <span>{option.label.trim() || 'אפשרות ללא טקסט'}</span>
              )}
              <button
                type="button"
                className="decision-node__option-delete-button nodrag nopan"
                title="מחק אפשרות"
                aria-label="מחק אפשרות"
                onClick={(event) => {
                  event.stopPropagation()
                  nodeData.onDeleteOption?.(id, option.id)
                }}
                onDoubleClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                ×
              </button>
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

      {hasConditionHandles ? (
        <div className="decision-node__condition-branches" aria-label="ענפי תנאי">
          {[
            [CONDITION_THEN_HANDLE_ID, 'מתקיים'],
            [CONDITION_ELSE_HANDLE_ID, 'לא מתקיים'],
          ].map(([sourceHandle, label]) => (
            <div key={sourceHandle} className="decision-node__condition-branch">
              <span>{label}</span>
              <Handle
                type="source"
                id={sourceHandle}
                position={Position.Left}
                className="decision-node__handle decision-node__condition-handle"
              />
            </div>
          ))}
        </div>
      ) : null}

      {hasRegularSourceHandle ? (
        <Handle
          type="source"
          id={DIRECT_SOURCE_HANDLE_ID}
          position={directSourcePosition}
          className={[
            'decision-node__handle',
            'decision-node__regular-handle',
            directSourcePosition === Position.Bottom
              ? 'decision-node__regular-handle--bottom'
              : 'decision-node__regular-handle--left',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      ) : null}

      {canAddOptions ? (
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
  const edgePathFactory =
    data?.edgeStyle === 'curved' ? getBezierPath : getSmoothStepPath
  const [edgePath, labelX, labelY] = edgePathFactory({
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

function DismissibleNotice({
  children,
  className,
  onDismiss,
}: DismissibleNoticeProps) {
  return (
    <div className={className} role="status">
      <span>{children}</span>
      <button
        type="button"
        className="notice-dismiss-button"
        aria-label="סגור הודעה"
        title="סגור הודעה"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  )
}

function ConfirmDialog({
  dialog,
  onCancel,
  onSelect,
}: {
  dialog: ConfirmDialogState
  onCancel: () => void
  onSelect: (value: DialogActionValue) => void
}) {
  const actions =
    dialog.actions ??
    ([
      {
        label: dialog.confirmLabel ?? 'אישור',
        value: 'confirm',
        variant: dialog.variant ?? 'primary',
      },
      ...(dialog.cancelLabel
        ? [
            {
              label: dialog.cancelLabel,
              value: 'cancel' as DialogActionValue,
              variant: 'secondary' as const,
            },
          ]
        : []),
    ] satisfies Array<{
      label: string
      value: DialogActionValue
      variant?: 'danger' | 'primary' | 'secondary'
    }>)

  return (
    <div className="flowly-dialog-backdrop" role="presentation">
      <section
        className="flowly-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="flowly-dialog-title"
        dir="rtl"
      >
        <h2 id="flowly-dialog-title">{dialog.title}</h2>
        <p>{dialog.message}</p>
        <div className="flowly-dialog__actions">
          {actions.map((action) => (
            <button
              key={action.value}
              type="button"
              className={[
                'flowly-dialog__button',
                action.variant === 'danger' ? 'flowly-dialog__button--danger' : '',
                action.variant === 'secondary'
                  ? 'flowly-dialog__button--secondary'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() =>
                action.value === 'cancel' ? onCancel() : onSelect(action.value)
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function App() {
  const reactFlowInstanceRef = useRef<ReactFlowInstance<DecisionNode, DecisionEdge> | null>(
    null,
  )
  const canvasPanelRef = useRef<HTMLElement | null>(null)
  const connectionStartRef = useRef<{
    sourceHandle: string
    sourceId: string
  } | null>(null)
  const shouldIgnoreNextPaneClickRef = useRef(false)
  const nextOptionNumber = useRef(1)
  const nextImageNumber = useRef(1)
  const nextLinkNumber = useRef(1)
  const nextParameterUpdateNumber = useRef(1)
  const nextActionNumber = useRef(1)
  const nextToolNumber = useRef(1)
  const nextConditionRuleNumber = useRef(1)
  const confirmDialogResolverRef = useRef<
    ((choice: DialogActionValue) => void) | null
  >(null)
  const nextScenarioTabNumber = useRef(2)
  const nextPasteOffsetNumber = useRef(0)
  const [scenarioTabs, setScenarioTabs] = useState<ScenarioTab[]>(() => [
    createEmptyScenarioTab(initialScenarioTabId, 'תסריט 1'),
  ])
  const [activeScenarioTabId, setActiveScenarioTabId] =
    useState(initialScenarioTabId)
  const [flowClipboard, setFlowClipboard] = useState<FlowClipboard | null>(null)
  const [scenarioMetadata, setScenarioMetadata] = useState<ScenarioMetadata>(
    initialScenarioMetadata,
  )
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('pan')
  const [edgeStyle, setEdgeStyle] = useState<EdgeStyle>(DEFAULT_EDGE_STYLE)
  const [editorViewport, setEditorViewport] = useState<Viewport>(initialViewport)
  const [isScenarioPanelOpen, setIsScenarioPanelOpen] = useState(false)
  const [isYamlImportPanelOpen, setIsYamlImportPanelOpen] = useState(false)
  const [isYamlExportPanelOpen, setIsYamlExportPanelOpen] = useState(false)
  const [isValidationPanelOpen, setIsValidationPanelOpen] = useState(false)
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(
    null,
  )
  const [yamlImportText, setYamlImportText] = useState('')
  const [yamlImportMode, setYamlImportMode] = useState<YamlImportMode>('replace')
  const [yamlImportErrors, setYamlImportErrors] = useState<string[]>([])
  const [yamlImportFileName, setYamlImportFileName] = useState('')
  const [shouldConnectAppendedFlow, setShouldConnectAppendedFlow] = useState(false)
  const [appendSourceHandle, setAppendSourceHandle] = useState('')
  const [appendLayoutMode, setAppendLayoutMode] =
    useState<AppendLayoutMode>('auto')
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(
    null,
  )
  const [yamlCopyMessage, setYamlCopyMessage] = useState('')
  const [isDraftExport, setIsDraftExport] = useState(false)
  const [appMessage, setAppMessage] = useState('')
  const [isAutosaveNoticeDismissed, setIsAutosaveNoticeDismissed] = useState(false)
  const [expandedAddStepsForNodeId, setExpandedAddStepsForNodeId] = useState<
    string | null
  >(null)
  const [pendingConnectionPopover, setPendingConnectionPopover] =
    useState<PendingConnectionPopover | null>(null)
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
  const appendSourceOptions = useMemo(
    () => getAvailableSourceHandleOptions(selectedNode, edges, true),
    [edges, selectedNode],
  )
  const selectedAppendSourceMode = selectedNodeData?.nodeType === 'condition'
    ? 'condition'
    : selectedNodeData && selectedNodeData.options.length > 0
      ? 'options'
      : selectedNodeData && isTerminalNodeType(selectedNodeData.nodeType)
        ? 'terminal'
        : selectedNodeData
          ? 'direct'
          : null
  const appendSourceSelectLabel =
    selectedAppendSourceMode === 'options'
      ? 'לאיזו אפשרות בחירה לחבר את התסריט המיובא?'
      : selectedAppendSourceMode === 'condition'
        ? 'לאיזה ענף תנאי לחבר את התסריט המיובא?'
        : 'נקודת חיבור'
  const activeAppendSourceHandle = appendSourceOptions.some(
    (sourceOption) => sourceOption.value === appendSourceHandle,
  )
    ? appendSourceHandle
    : (appendSourceOptions[0]?.value ?? '')
  const shouldApplyAppendConnection =
    shouldConnectAppendedFlow && appendSourceOptions.length > 0
  const isAddStepSectionExpanded =
    selectedNodeId === null || expandedAddStepsForNodeId === selectedNodeId
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
  const selectedActionNodeIds = useMemo(
    () =>
      selectedNodeIds.length > 0
        ? selectedNodeIds
        : selectedNodeId
          ? [selectedNodeId]
          : [],
    [selectedNodeId, selectedNodeIds],
  )
  const isSelectionMode = canvasMode === 'select'
  const activeScenarioTab = useMemo(
    () =>
      scenarioTabs.find((tab) => tab.id === activeScenarioTabId) ??
      scenarioTabs[0],
    [activeScenarioTabId, scenarioTabs],
  )
  const generatedYamlText = useMemo(
    () =>
      createYamlExportText(
        scenarioMetadata,
        nodes,
        edges,
        editorViewport,
        edgeStyle,
        isDraftExport,
      ),
    [edgeStyle, edges, editorViewport, isDraftExport, nodes, scenarioMetadata],
  )
  const hasValidationErrors = Boolean(validationReport?.errors.length)
  const hasValidationWarnings = Boolean(validationReport?.warnings.length)

  const closeConfirmDialog = useCallback((choice: DialogActionValue) => {
    confirmDialogResolverRef.current?.(choice)
    confirmDialogResolverRef.current = null
    setConfirmDialog(null)
  }, [])

  const requestDialogChoice = useCallback(
    (dialog: ConfirmDialogState) =>
      new Promise<DialogActionValue>((resolve) => {
        confirmDialogResolverRef.current?.('cancel')
        confirmDialogResolverRef.current = resolve
        setConfirmDialog({
          cancelLabel: 'ביטול',
          variant: 'primary',
          ...dialog,
        })
      }),
    [],
  )

  const requestConfirmation = useCallback(
    async (dialog: ConfirmDialogState) =>
      (await requestDialogChoice(dialog)) === 'confirm',
    [requestDialogChoice],
  )

  const applyEditorCountersForNodes = useCallback((flowNodes: DecisionNode[]) => {
    const getNextNumberForPrefix = (ids: string[], prefix: string) =>
      Math.max(
        0,
        ...ids.map((id) => {
          const match = id.match(new RegExp(`^${prefix}-(\\d+)$`))

          return match ? Number(match[1]) : 0
        }),
      ) + 1
    const nodeDataList = flowNodes.map((node) => normalizeNodeData(node.data))

    nextOptionNumber.current = getNextNumberForPrefix(
      nodeDataList.flatMap((nodeData) =>
        nodeData.options.map((option) => option.id),
      ),
      'option',
    )
    nextImageNumber.current = getNextNumberForPrefix(
      nodeDataList.flatMap((nodeData) => nodeData.images.map((image) => image.id)),
      'image',
    )
    nextLinkNumber.current = getNextNumberForPrefix(
      nodeDataList.flatMap((nodeData) => nodeData.links.map((link) => link.id)),
      'link',
    )
    nextParameterUpdateNumber.current = getNextNumberForPrefix(
      nodeDataList.flatMap((nodeData) =>
        nodeData.parameterUpdates.map((parameterUpdate) => parameterUpdate.id),
      ),
      'parameter',
    )
    nextActionNumber.current = getNextNumberForPrefix(
      nodeDataList.flatMap((nodeData) =>
        nodeData.actions.map((action) => action.id),
      ),
      'action',
    )
    nextToolNumber.current = getNextNumberForPrefix(
      nodeDataList.flatMap((nodeData) => nodeData.tools.map((tool) => tool.id)),
      'tool',
    )
    nextConditionRuleNumber.current = getNextNumberForPrefix(
      nodeDataList.flatMap((nodeData) =>
        nodeData.condition.rules.map((rule) => rule.id),
      ),
      'condition-rule',
    )
  }, [])

  const getActiveScenarioSnapshot = useCallback(
    (tab: ScenarioTab): ScenarioTab => ({
      ...tab,
      edgeStyle,
      edges,
      editorViewport,
      isValidationPanelOpen,
      nodes,
      scenarioMetadata,
      selectedEdgeId,
      selectedNodeId,
      validationReport,
    }),
    [
      edgeStyle,
      edges,
      editorViewport,
      isValidationPanelOpen,
      nodes,
      scenarioMetadata,
      selectedEdgeId,
      selectedNodeId,
      validationReport,
    ],
  )

  const syncActiveTabInList = useCallback(
    (tabs: ScenarioTab[]) =>
      tabs.map((tab) =>
        tab.id === activeScenarioTabId ? getActiveScenarioSnapshot(tab) : tab,
      ),
    [activeScenarioTabId, getActiveScenarioSnapshot],
  )

  const loadScenarioTab = useCallback(
    (tab: ScenarioTab) => {
      setActiveScenarioTabId(tab.id)
      setNodes(tab.nodes)
      setEdges(tab.edges)
      setScenarioMetadata(tab.scenarioMetadata)
      setEdgeStyle(tab.edgeStyle)
      setEditorViewport(tab.editorViewport)
      setSelectedNodeId(tab.selectedNodeId)
      setSelectedEdgeId(tab.selectedEdgeId)
      setValidationReport(tab.validationReport)
      setIsValidationPanelOpen(tab.isValidationPanelOpen)
      setIsScenarioPanelOpen(false)
      setIsYamlImportPanelOpen(false)
      setIsYamlExportPanelOpen(false)
      setPendingConnectionPopover(null)
      setYamlCopyMessage('')
      setIsDraftExport(false)
      applyEditorCountersForNodes(tab.nodes)

      window.requestAnimationFrame(() => {
        void reactFlowInstanceRef.current?.setViewport(tab.editorViewport, {
          duration: 150,
        })
      })
    },
    [applyEditorCountersForNodes, setEdges, setNodes],
  )

  const createScenarioTab = useCallback((name: string) => {
    const tab = createEmptyScenarioTab(
      `scenario-tab-${nextScenarioTabNumber.current}`,
      name,
    )

    nextScenarioTabNumber.current += 1

    return tab
  }, [])

  const switchScenarioTab = useCallback(
    (tabId: string) => {
      if (tabId === activeScenarioTabId) {
        return
      }

      const syncedTabs = syncActiveTabInList(scenarioTabs)
      const nextTab = syncedTabs.find((tab) => tab.id === tabId)

      if (!nextTab) {
        return
      }

      setScenarioTabs(syncedTabs)
      loadScenarioTab(nextTab)
    },
    [activeScenarioTabId, loadScenarioTab, scenarioTabs, syncActiveTabInList],
  )

  const closeScenarioTab = useCallback(
    async (tabId: string) => {
      const syncedTabs = syncActiveTabInList(scenarioTabs)
      const closedTab = syncedTabs.find((tab) => tab.id === tabId)

      if (!closedTab) {
        return
      }

      if (
        hasScenarioTabContent(closedTab) &&
        !(await requestConfirmation({
          title: 'סגירת כרטיסייה',
          message:
            'סגירת הכרטיסייה תמחק את העבודה בכרטיסייה הזו מהזיכרון. אם לא ייצאת YAML, העבודה תאבד.',
          confirmLabel: 'סגור כרטיסייה',
          variant: 'danger',
        }))
      ) {
        return
      }

      let nextTabs = syncedTabs.filter((tab) => tab.id !== tabId)

      if (nextTabs.length === 0) {
        nextTabs = [createScenarioTab('תסריט חדש')]
      }

      const nextActiveTab =
        tabId === activeScenarioTabId
          ? (nextTabs[Math.max(0, syncedTabs.findIndex((tab) => tab.id === tabId) - 1)] ??
            nextTabs[0])
          : (nextTabs.find((tab) => tab.id === activeScenarioTabId) ??
            nextTabs[0])

      setScenarioTabs(nextTabs)
      loadScenarioTab(nextActiveTab)
      setAppMessage('הכרטיסייה נסגרה.')
    },
    [
      activeScenarioTabId,
      createScenarioTab,
      loadScenarioTab,
      requestConfirmation,
      scenarioTabs,
      syncActiveTabInList,
    ],
  )

  const getCanvasPlacementFromClientPosition = useCallback(
    (clientPosition: XYPosition) => {
      const canvasBounds = canvasPanelRef.current?.getBoundingClientRect()
      const placementMargin = 36
      const clampedClientPosition = canvasBounds
        ? {
            x: clampNumber(
              clientPosition.x,
              canvasBounds.left + placementMargin,
              canvasBounds.right - placementMargin,
            ),
            y: clampNumber(
              clientPosition.y,
              canvasBounds.top + placementMargin,
              canvasBounds.bottom - placementMargin,
            ),
          }
        : clientPosition
      const flowPosition =
        reactFlowInstanceRef.current?.screenToFlowPosition(clampedClientPosition) ??
        (canvasBounds
          ? {
              x:
                (clampedClientPosition.x - canvasBounds.left - editorViewport.x) /
                editorViewport.zoom,
              y:
                (clampedClientPosition.y - canvasBounds.top - editorViewport.y) /
                editorViewport.zoom,
            }
          : {
              x: (clampedClientPosition.x - editorViewport.x) / editorViewport.zoom,
              y: (clampedClientPosition.y - editorViewport.y) / editorViewport.zoom,
            })

      return {
        nodePosition: {
          x: flowPosition.x - nodeLayoutWidth / 2,
          y: flowPosition.y - nodeLayoutHeight / 2,
        },
        popoverPosition: canvasBounds
          ? {
              x: clampNumber(
                clampedClientPosition.x - canvasBounds.left,
                126,
                canvasBounds.width - 126,
              ),
              y: clampNumber(
                clampedClientPosition.y - canvasBounds.top,
                16,
                canvasBounds.height - 230,
              ),
            }
          : clampedClientPosition,
      }
    },
    [editorViewport],
  )

  const getVisibleCanvasCenterPosition = useCallback(() => {
    const canvasBounds = canvasPanelRef.current?.getBoundingClientRect()

    return getCanvasPlacementFromClientPosition(
      canvasBounds
        ? {
            x: canvasBounds.left + canvasBounds.width / 2,
            y: canvasBounds.top + canvasBounds.height / 2,
          }
        : {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          },
    ).nodePosition
  }, [getCanvasPlacementFromClientPosition])

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

  const updateNodeStandaloneParameterUpdate = useCallback(
    (nodeId: string, parameterUpdatePatch: Partial<StandaloneParameterUpdate>) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== nodeId) {
            return node
          }

          const nodeData = normalizeNodeData(node.data)

          return {
            ...node,
            data: {
              ...nodeData,
              parameterUpdate: {
                ...nodeData.parameterUpdate,
                ...parameterUpdatePatch,
              },
            },
          }
        }),
      )
    },
    [setNodes],
  )

  const updateNodeStandaloneAction = useCallback(
    (nodeId: string, actionPatch: Partial<StandaloneAction>) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== nodeId) {
            return node
          }

          const nodeData = normalizeNodeData(node.data)

          return {
            ...node,
            data: {
              ...nodeData,
              action: {
                ...nodeData.action,
                ...actionPatch,
              },
            },
          }
        }),
      )
    },
    [setNodes],
  )

  const updateNodeStandaloneTool = useCallback(
    (nodeId: string, toolPatch: Partial<StandaloneTool>) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== nodeId) {
            return node
          }

          const nodeData = normalizeNodeData(node.data)

          return {
            ...node,
            data: {
              ...nodeData,
              tool: {
                ...nodeData.tool,
                ...toolPatch,
              },
            },
          }
        }),
      )
    },
    [setNodes],
  )

  const updateNodeOption = useCallback(
    (nodeId: string, optionId: string, label: string) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...normalizeNodeData(node.data),
                  options: normalizeNodeData(node.data).options.map((option) =>
                    option.id === optionId ? { ...option, label } : option,
                  ),
                },
              }
            : node,
        ),
      )
      setEdges((currentEdges) =>
        currentEdges.map((edge) =>
          edge.source === nodeId && edge.sourceHandle === optionId
            ? { ...edge, label: getOptionEdgeLabel(label) }
            : edge,
        ),
      )
    },
    [setEdges, setNodes],
  )

  const deleteNodeOption = useCallback(
    (nodeId: string, optionId: string) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...normalizeNodeData(node.data),
                  options: normalizeNodeData(node.data).options.filter(
                    (option) => option.id !== optionId,
                  ),
                },
              }
            : node,
        ),
      )
      setEdges((currentEdges) =>
        currentEdges.filter(
          (edge) => !(edge.source === nodeId && edge.sourceHandle === optionId),
        ),
      )
      setSelectedNodeId(nodeId)
      setSelectedEdgeId(null)
    },
    [setEdges, setNodes],
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

  const deleteNodeById = useCallback(
    async (nodeId: string) => {
      const shouldDelete = await requestConfirmation({
        title: 'מחיקת שלב',
        message: 'למחוק את השלב הזה? כל החיבורים אליו וממנו יימחקו.',
        confirmLabel: 'מחק שלב',
        variant: 'danger',
      })

      if (!shouldDelete) {
        return
      }

      setNodes((currentNodes) =>
        currentNodes.filter((node) => node.id !== nodeId),
      )
      setEdges((currentEdges) =>
        currentEdges.filter(
          (edge) => edge.source !== nodeId && edge.target !== nodeId,
        ),
      )
      setSelectedNodeId((currentSelectedNodeId) =>
        currentSelectedNodeId === nodeId ? null : currentSelectedNodeId,
      )
      setSelectedEdgeId(null)

      if (scenarioMetadata.entryNodeId === nodeId) {
        setScenarioMetadata((currentMetadata) => ({
          ...currentMetadata,
          entryNodeId: '',
        }))
        setAppMessage('שלב הפתיחה נמחק. יש לבחור שלב פתיחה חדש.')
      }
    },
    [requestConfirmation, scenarioMetadata.entryNodeId, setEdges, setNodes],
  )

  const displayNodes = useMemo<DecisionNode[]>(
    () =>
      nodes.map((node) => {
        const nodeData = normalizeNodeData(node.data)
        const commonNodeData = {
          ...nodeData,
          directSourcePosition: getDirectSourcePositionForNode(node, nodes, edges),
          isEntryNode: node.id === scenarioMetadata.entryNodeId,
          isMultiSelected: Boolean(node.selected),
          onAddOption: addOptionToNode,
          onDeleteNode: deleteNodeById,
          onDeleteOption: deleteNodeOption,
          onOptionLabelChange: updateNodeOption,
          onScriptChange: updateNodeScript,
          onStandaloneActionChange: updateNodeStandaloneAction,
          onStandaloneParameterUpdateChange: updateNodeStandaloneParameterUpdate,
          onStandaloneToolChange: updateNodeStandaloneTool,
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
      deleteNodeById,
      deleteNodeOption,
      edges,
      nodes,
      scenarioMetadata.entryNodeId,
      selectedEdge,
      toggleNodeMultiSelection,
      updateNodeStandaloneAction,
      updateNodeStandaloneParameterUpdate,
      updateNodeStandaloneTool,
      updateNodeOption,
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
            edgeStyle,
            onDelete: deleteEdgeById,
          },
        }
      }),
    [activeSelectedEdgeId, deleteEdgeById, edgeStyle, edges],
  )

  useEffect(() => {
    setEdges((currentEdges) =>
      normalizeEdgesForNodes(currentEdges, nodes, scenarioMetadata.entryNodeId),
    )
  }, [nodes, scenarioMetadata.entryNodeId, setEdges])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (
        nodes.length === 0 &&
        !scenarioTabs.some(
          (tab) => tab.id !== activeScenarioTabId && hasScenarioTabContent(tab),
        )
      ) {
        return
      }

      event.preventDefault()
      event.returnValue = 'אם לא ייצאת YAML, העבודה תאבד.'
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [activeScenarioTabId, nodes.length, scenarioTabs])

  useEffect(() => {
    if (!confirmDialog) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeConfirmDialog('cancel')
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeConfirmDialog, confirmDialog])

  useEffect(() => {
    if (!pendingConnectionPopover) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('.connection-create-popover')
      ) {
        return
      }

      shouldIgnoreNextPaneClickRef.current = false
      setPendingConnectionPopover(null)
    }

    window.addEventListener('pointerdown', handlePointerDown)

    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [pendingConnectionPopover])

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
    setYamlImportMode('replace')
    setYamlImportErrors([])
    setYamlImportFileName('')
    setShouldConnectAppendedFlow(false)
    setAppendSourceHandle('')
    setAppendLayoutMode('auto')
    setIsYamlImportPanelOpen(true)
  }, [])

  const applyImportedFlow = useCallback(
    (importedFlow: ImportedFlow) => {
      setNodes(importedFlow.nodes)
      setEdges(importedFlow.edges)
      setEdgeStyle(importedFlow.edgeStyle)
      setScenarioMetadata(importedFlow.scenarioMetadata)
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setValidationReport(null)
      setIsValidationPanelOpen(false)
      setIsYamlExportPanelOpen(false)
      setIsYamlImportPanelOpen(false)
      setYamlImportText('')
      setYamlImportMode('replace')
      setYamlImportErrors([])
      setYamlImportFileName('')
      setShouldConnectAppendedFlow(false)
      setAppendSourceHandle('')
      setAppendLayoutMode('auto')
      setYamlCopyMessage('')
      setIsDraftExport(false)
      setPendingConnectionPopover(null)
      setAppMessage('התסריט יובא בהצלחה')

      nextOptionNumber.current = importedFlow.nextOptionNumber
      nextImageNumber.current = importedFlow.nextImageNumber
      nextLinkNumber.current = importedFlow.nextLinkNumber
      nextParameterUpdateNumber.current = importedFlow.nextParameterUpdateNumber
      nextActionNumber.current = importedFlow.nextActionNumber
      nextToolNumber.current = importedFlow.nextToolNumber
      nextConditionRuleNumber.current = importedFlow.nextConditionRuleNumber

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

  const applyAppendedFlow = useCallback(
    (
      importedFlow: ImportedFlow,
      connectSource:
        | {
            sourceId: string
            sourceHandle: string
          }
        | null,
      replaceExistingSourceConnection = false,
    ) => {
      const currentNodeIds = new Set(nodes.map((node) => node.id))
      const reservedNodeIds = new Set(currentNodeIds)
      const stepIdMap = new Map<string, string>()
      const importedLayoutNodes =
        appendLayoutMode === 'auto'
          ? (() => {
              const importedNodeIds = new Set(
                importedFlow.nodes.map((node) => node.id),
              )
              const layoutPositions = createAutoLayoutPositions(
                importedFlow.nodes.map((node) => ({ id: node.id })),
                importedFlow.edges
                  .filter(
                    (edge) =>
                      importedNodeIds.has(edge.source) &&
                      importedNodeIds.has(edge.target),
                  )
                  .map((edge) => ({
                    source: edge.source,
                    target: edge.target,
                  })),
              )

              return importedFlow.nodes.map((node) => ({
                ...node,
                position: layoutPositions[node.id] ?? node.position,
              }))
            })()
          : importedFlow.nodes

      // Append always remaps imported STEP ids. This keeps the existing canvas
      // immutable and makes collision handling deterministic even for partial overlaps.
      importedLayoutNodes.forEach((node) => {
        const nextNodeId = getNextStepId(reservedNodeIds)

        stepIdMap.set(node.id, nextNodeId)
        reservedNodeIds.add(nextNodeId)
      })

      const importedEntryNodeId =
        stepIdMap.get(importedFlow.scenarioMetadata.entryNodeId) ?? ''
      const placementOffset = getAppendPlacementOffset(
        importedLayoutNodes,
        nodes,
        getVisibleCanvasCenterPosition(),
      )
      const remappedNodes: DecisionNode[] = importedLayoutNodes.map((node) => ({
        ...node,
        id: stepIdMap.get(node.id) ?? node.id,
        position: {
          x: node.position.x + placementOffset.x,
          y: node.position.y + placementOffset.y,
        },
        selected: (stepIdMap.get(node.id) ?? node.id) === importedEntryNodeId,
      }))
      const combinedNodes = [
        ...nodes.map((node) => ({ ...node, selected: false })),
        ...remappedNodes,
      ]
      const combinedNodeIds = new Set(combinedNodes.map((node) => node.id))
      const combinedNodeDataById = new Map(
        combinedNodes.map((node) => [node.id, normalizeNodeData(node.data)]),
      )
      const remappedImportedEdges = importedFlow.edges.flatMap((edge) => {
        const sourceId = stepIdMap.get(edge.source)
        const targetId = stepIdMap.get(edge.target) ?? edge.target

        if (!sourceId || !combinedNodeIds.has(targetId)) {
          return []
        }

        const sourceData = combinedNodeDataById.get(sourceId)

        if (!sourceData) {
          return []
        }

        return [
          createDecisionEdge(
            getConnectionWithPreferredHandles(
              {
                source: sourceId,
                sourceHandle: edge.sourceHandle ?? DIRECT_SOURCE_HANDLE_ID,
                target: targetId,
                targetHandle: null,
              },
              combinedNodes,
            ),
            sourceData,
          ),
        ]
      })
      let nextEdges = [...edges, ...remappedImportedEdges]
      let didConnectToImportedFlow = false

      if (connectSource && importedEntryNodeId) {
        const sourceData = combinedNodeDataById.get(connectSource.sourceId)
        const connection: Connection = {
          source: connectSource.sourceId,
          sourceHandle: connectSource.sourceHandle,
          target: importedEntryNodeId,
          targetHandle: null,
        }

        if (replaceExistingSourceConnection) {
          nextEdges = nextEdges.filter(
            (edge) =>
              edge.source !== connectSource.sourceId ||
              (edge.sourceHandle ?? DIRECT_SOURCE_HANDLE_ID) !==
                connectSource.sourceHandle,
          )
        }

        if (
          sourceData &&
          isDecisionConnectionValid(
            connection,
            combinedNodes,
            nextEdges,
            scenarioMetadata.entryNodeId,
          )
        ) {
          nextEdges = addEdge(
            createDecisionEdge(
              getConnectionWithPreferredHandles(connection, combinedNodes),
              sourceData,
            ),
            nextEdges,
          )
          didConnectToImportedFlow = true
        }
      }

      const normalizedNextEdges = normalizeEdgesForNodes(
        nextEdges,
        combinedNodes,
        scenarioMetadata.entryNodeId,
      )

      setNodes(combinedNodes)
      setEdges(normalizedNextEdges)
      setSelectedNodeId(importedEntryNodeId || null)
      setSelectedEdgeId(null)
      setValidationReport(null)
      setIsValidationPanelOpen(false)
      setIsYamlExportPanelOpen(false)
      setIsYamlImportPanelOpen(false)
      setYamlImportText('')
      setYamlImportErrors([])
      setYamlImportFileName('')
      setYamlImportMode('replace')
      setShouldConnectAppendedFlow(false)
      setAppendSourceHandle('')
      setAppendLayoutMode('auto')
      setYamlCopyMessage('')
      setIsDraftExport(false)
      setPendingConnectionPopover(null)
      setAppMessage(
        didConnectToImportedFlow
          ? 'ה-YAML נוסף וחובר לנקודה שנבחרה.'
          : 'ה-YAML נוסף לתסריט הנוכחי. אפשר לחבר אותו ידנית מהקנבס.',
      )

      if (!scenarioMetadata.entryNodeId && nodes.length === 0) {
        setScenarioMetadata((currentMetadata) => ({
          ...currentMetadata,
          entryNodeId: importedEntryNodeId,
        }))
      }

      nextOptionNumber.current = Math.max(
        nextOptionNumber.current,
        importedFlow.nextOptionNumber,
      )
      nextImageNumber.current = Math.max(
        nextImageNumber.current,
        importedFlow.nextImageNumber,
      )
      nextLinkNumber.current = Math.max(
        nextLinkNumber.current,
        importedFlow.nextLinkNumber,
      )
      nextParameterUpdateNumber.current = Math.max(
        nextParameterUpdateNumber.current,
        importedFlow.nextParameterUpdateNumber,
      )
      nextActionNumber.current = Math.max(
        nextActionNumber.current,
        importedFlow.nextActionNumber,
      )
      nextToolNumber.current = Math.max(
        nextToolNumber.current,
        importedFlow.nextToolNumber,
      )
      nextConditionRuleNumber.current = Math.max(
        nextConditionRuleNumber.current,
        importedFlow.nextConditionRuleNumber,
      )

      window.requestAnimationFrame(() => {
        const importedBounds = getNodesBounds(remappedNodes)

        if (!importedBounds) {
          return
        }

        const viewport = reactFlowInstanceRef.current?.getViewport() ?? editorViewport

        void reactFlowInstanceRef.current?.setCenter(
          (importedBounds.minX + importedBounds.maxX) / 2,
          (importedBounds.minY + importedBounds.maxY) / 2,
          {
            duration: 300,
            zoom: Math.min(viewport.zoom, 0.95),
          },
        )
      })
    },
    [
      appendLayoutMode,
      edges,
      editorViewport,
      getVisibleCanvasCenterPosition,
      nodes,
      scenarioMetadata.entryNodeId,
      setEdges,
      setNodes,
    ],
  )

  const importYamlText = useCallback(async () => {
    const importResult = parseYamlImportText(
      yamlImportText,
      yamlImportMode === 'append'
        ? {
            allowedExternalStepIds: new Set(nodes.map((node) => node.id)),
            blockedTargetStepIds: scenarioMetadata.entryNodeId
              ? new Set([scenarioMetadata.entryNodeId])
              : undefined,
          }
        : {},
    )

    if (!importResult.flow) {
      setYamlImportErrors(importResult.errors)

      return
    }

    if (yamlImportMode === 'append') {
      const connectSource =
        shouldApplyAppendConnection && selectedNode && activeAppendSourceHandle
          ? {
              sourceId: selectedNode.id,
              sourceHandle: activeAppendSourceHandle,
            }
          : null

      if (shouldApplyAppendConnection && !connectSource) {
        setYamlImportErrors(['לא נבחרה נקודת חיבור תקינה לתסריט המיובא.'])

        return
      }

      const existingSourceEdge = connectSource
        ? getOutgoingEdgeForHandle(
            edges,
            connectSource.sourceId,
            connectSource.sourceHandle,
          )
        : undefined
      const shouldReplaceExistingConnection = Boolean(existingSourceEdge)

      if (
        shouldReplaceExistingConnection &&
        !(await requestConfirmation({
          title: 'החלפת חיבור קיים',
          message:
            selectedAppendSourceMode === 'options'
              ? 'לאפשרות הבחירה הזו כבר קיים חיבור. האם להחליף אותו בחיבור לתסריט המיובא?'
              : selectedAppendSourceMode === 'condition'
                ? 'לענף התנאי הזה כבר קיים חיבור. האם להחליף אותו בחיבור לתסריט המיובא?'
                : 'לנקודת החיבור הזו כבר קיים חיבור. האם להחליף אותו בחיבור לתסריט המיובא?',
          confirmLabel: 'החלף חיבור',
          variant: 'danger',
        }))
      ) {
        return
      }

      applyAppendedFlow(
        importResult.flow,
        connectSource,
        shouldReplaceExistingConnection,
      )

      return
    }

    if (
      nodes.length > 0 &&
      !(await requestConfirmation({
        title: 'ייבוא תסריט',
        message:
          'ייבוא הקובץ יחליף את התסריט הנוכחי. אם לא ייצאת YAML, העבודה הנוכחית תאבד.',
        confirmLabel: 'ייבא והחלף',
        variant: 'danger',
      }))
    ) {
      return
    }

    applyImportedFlow(importResult.flow)
  }, [
    activeAppendSourceHandle,
    applyAppendedFlow,
    applyImportedFlow,
    edges,
    nodes,
    requestConfirmation,
    scenarioMetadata.entryNodeId,
    selectedAppendSourceMode,
    selectedNode,
    shouldApplyAppendConnection,
    yamlImportMode,
    yamlImportText,
  ])

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

  const createNewScenario = useCallback(async () => {
    const hasCurrentFlow = nodes.length > 0 || edges.length > 0
    const newScenarioChoice = await requestDialogChoice({
      title: 'תסריט חדש',
      message: 'איך לפתוח את התסריט החדש?',
      actions: [
        {
          label: 'פתח בכרטיסייה חדשה',
          value: 'newTab',
          variant: 'primary',
        },
        {
          label: 'החלף את הכרטיסייה הנוכחית',
          value: 'replaceCurrent',
          variant: 'danger',
        },
        {
          label: 'ביטול',
          value: 'cancel',
          variant: 'secondary',
        },
      ],
    })

    if (newScenarioChoice === 'cancel') {
      return
    }

    if (newScenarioChoice === 'newTab') {
      const syncedTabs = syncActiveTabInList(scenarioTabs)
      const newTab = createScenarioTab('תסריט חדש')

      setScenarioTabs([...syncedTabs, newTab])
      loadScenarioTab(newTab)
      setAppMessage('נפתחה כרטיסייה חדשה.')

      return
    }

    if (
      newScenarioChoice === 'replaceCurrent' &&
      hasCurrentFlow &&
      !(await requestConfirmation({
        title: 'תסריט חדש',
        message:
          'יצירת תסריט חדש תנקה את העבודה הנוכחית. אם לא ייצאת YAML, העבודה תאבד.',
        confirmLabel: 'פתח תסריט חדש',
        variant: 'danger',
      }))
    ) {
      return
    }

    setNodes([])
    setEdges([])
    setScenarioMetadata({ ...initialScenarioMetadata })
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setValidationReport(null)
    setIsValidationPanelOpen(false)
    setIsYamlExportPanelOpen(false)
    setIsYamlImportPanelOpen(false)
    setYamlCopyMessage('')
    setIsDraftExport(false)
    setPendingConnectionPopover(null)
    setYamlImportErrors([])
    setYamlImportFileName('')
    setYamlImportText('')
    setYamlImportMode('replace')
    setShouldConnectAppendedFlow(false)
    setAppendSourceHandle('')
    setAppendLayoutMode('auto')
    setAppMessage('נוצר תסריט חדש. יש לייצא YAML כדי לשמור את העבודה.')
    setEdgeStyle(DEFAULT_EDGE_STYLE)
    setEditorViewport(initialViewport)
    setScenarioTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.id === activeScenarioTabId
          ? {
              ...tab,
              name: 'תסריט חדש',
            }
          : tab,
      ),
    )
    applyEditorCountersForNodes([])

    void reactFlowInstanceRef.current?.setViewport(initialViewport, { duration: 250 })
  }, [
    activeScenarioTabId,
    applyEditorCountersForNodes,
    createScenarioTab,
    edges.length,
    loadScenarioTab,
    nodes.length,
    requestConfirmation,
    requestDialogChoice,
    scenarioTabs,
    setEdges,
    setNodes,
    syncActiveTabInList,
  ])

  const openYamlExportPanelWithoutValidation = useCallback((exportAsDraft = false) => {
    setYamlCopyMessage('')
    setIsDraftExport(exportAsDraft)
    setValidationReport(null)
    setIsValidationPanelOpen(false)
    setIsYamlExportPanelOpen(true)
  }, [])

  const openYamlExportPanel = useCallback(() => {
    setIsDraftExport(false)
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
    openYamlExportPanelWithoutValidation(false)
  }, [openYamlExportPanelWithoutValidation])

  const continueYamlExportAsDraft = useCallback(() => {
    openYamlExportPanelWithoutValidation(true)
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
      if (node.id !== selectedNodeId) {
        setExpandedAddStepsForNodeId(null)
      }
      setSelectedNodeId(node.id)
    },
    [selectedNodeId],
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

  const updateSelectedNodeType = useCallback(
    (nodeType: DecisionNodeType) => {
      if (selectedNodeId === null || !selectedNodeData) {
        return
      }

      const conditionRuleId = `condition-rule-${nextConditionRuleNumber.current}`

      if (nodeType === 'condition') {
        nextConditionRuleNumber.current += 1
      }

      const defaultData = createNodeData(nodeType, conditionRuleId)
      const nextData: DecisionNodeData = {
        ...selectedNodeData,
        nodeType,
        options: supportsOptions(nodeType) ? selectedNodeData.options : [],
        parameterUpdate:
          nodeType === 'parameterUpdate'
            ? selectedNodeData.parameterUpdate
            : defaultData.parameterUpdate,
        action: nodeType === 'action' ? selectedNodeData.action : defaultData.action,
        tool: nodeType === 'tool' ? selectedNodeData.tool : defaultData.tool,
        condition:
          nodeType === 'condition'
            ? {
                logic: selectedNodeData.condition.logic,
                rules:
                  selectedNodeData.condition.rules.length > 0
                    ? selectedNodeData.condition.rules
                    : defaultData.condition.rules,
              }
            : defaultData.condition,
      }
      const allowedSourceHandles = new Set(getAllowedOutgoingHandles(nextData))

      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === selectedNodeId
            ? {
            ...node,
            data: nextData,
          }
            : node,
        ),
      )
      setEdges((currentEdges) =>
        currentEdges.filter(
          (edge) =>
            edge.source !== selectedNodeId ||
            allowedSourceHandles.has(edge.sourceHandle ?? DIRECT_SOURCE_HANDLE_ID),
        ),
      )
    },
    [selectedNodeData, selectedNodeId, setEdges, setNodes],
  )

  const addSelectedNodeOption = useCallback(() => {
    if (selectedNodeId === null) {
      return
    }

    addOptionToNode(selectedNodeId)
  }, [addOptionToNode, selectedNodeId])

  const updateSelectedNodeOption = useCallback(
    (optionId: string, label: string) => {
      if (selectedNodeId !== null) {
        updateNodeOption(selectedNodeId, optionId, label)
      }
    },
    [selectedNodeId, updateNodeOption],
  )

  const deleteSelectedNodeOption = useCallback(
    (optionId: string) => {
      if (selectedNodeId !== null) {
        deleteNodeOption(selectedNodeId, optionId)
      }
    },
    [deleteNodeOption, selectedNodeId],
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

  const updateStandaloneParameterUpdate = useCallback(
    (parameterUpdatePatch: Partial<StandaloneParameterUpdate>) => {
      updateSelectedNodeDataBy((nodeData) => ({
        ...nodeData,
        parameterUpdate: {
          ...nodeData.parameterUpdate,
          ...parameterUpdatePatch,
        },
      }))
    },
    [updateSelectedNodeDataBy],
  )

  const updateStandaloneAction = useCallback(
    (actionPatch: Partial<StandaloneAction>) => {
      updateSelectedNodeDataBy((nodeData) => ({
        ...nodeData,
        action: {
          ...nodeData.action,
          ...actionPatch,
        },
      }))
    },
    [updateSelectedNodeDataBy],
  )

  const updateStandaloneTool = useCallback(
    (toolPatch: Partial<StandaloneTool>) => {
      updateSelectedNodeDataBy((nodeData) => ({
        ...nodeData,
        tool: {
          ...nodeData.tool,
          ...toolPatch,
        },
      }))
    },
    [updateSelectedNodeDataBy],
  )

  const updateConditionLogic = useCallback(
    (logic: ConditionLogic) => {
      updateSelectedNodeDataBy((nodeData) => ({
        ...nodeData,
        condition: {
          ...nodeData.condition,
          logic,
        },
      }))
    },
    [updateSelectedNodeDataBy],
  )

  const addConditionRule = useCallback(() => {
    const newRule = createEmptyConditionRule(
      `condition-rule-${nextConditionRuleNumber.current}`,
    )

    nextConditionRuleNumber.current += 1
    updateSelectedNodeDataBy((nodeData) => ({
      ...nodeData,
      condition: {
        ...nodeData.condition,
        rules: [...nodeData.condition.rules, newRule],
      },
    }))
  }, [updateSelectedNodeDataBy])

  const updateConditionRule = useCallback(
    (ruleId: string, rulePatch: Partial<DecisionConditionRule>) => {
      updateSelectedNodeDataBy((nodeData) => ({
        ...nodeData,
        condition: {
          ...nodeData.condition,
          rules: nodeData.condition.rules.map((rule) =>
            rule.id === ruleId ? { ...rule, ...rulePatch } : rule,
          ),
        },
      }))
    },
    [updateSelectedNodeDataBy],
  )

  const deleteConditionRule = useCallback(
    (ruleId: string) => {
      updateSelectedNodeDataBy((nodeData) => ({
        ...nodeData,
        condition: {
          ...nodeData.condition,
          rules: nodeData.condition.rules.filter((rule) => rule.id !== ruleId),
        },
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

        const preferredConnection = getConnectionWithPreferredHandles(
          connection,
          nodes,
        )
        const newEdge = createDecisionEdge(preferredConnection, sourceData)

        return addEdge(newEdge, currentEdges)
      })
    },
    [nodes, scenarioMetadata.entryNodeId, setEdges],
  )

  const handleEdgeClick = useCallback<EdgeMouseHandler<DecisionEdge>>((_event, edge) => {
    setSelectedEdgeId(edge.id)
  }, [])

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNode) {
      return
    }

    void deleteNodeById(selectedNode.id)
  }, [deleteNodeById, selectedNode])

  const clearNodeSelection = useCallback(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.selected ? { ...node, selected: false } : node,
      ),
    )
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
  }, [setNodes])

  const deleteSelectedNodes = useCallback(async () => {
    if (selectedNodeIds.length === 0) {
      return
    }

    const shouldDelete = await requestConfirmation({
      title: 'מחיקת שלבים',
      message: 'למחוק את השלבים שנבחרו? כל החיבורים אליהם ומהם יימחקו.',
      confirmLabel: 'מחק שלבים',
      variant: 'danger',
    })

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
  }, [
    requestConfirmation,
    scenarioMetadata.entryNodeId,
    selectedNodeIds,
    setEdges,
    setNodes,
  ])

  const copySelectedSteps = useCallback(() => {
    if (selectedActionNodeIds.length === 0) {
      setAppMessage('יש לבחור שלבים להעתקה.')

      return
    }

    const selectedNodeIdSet = new Set(selectedActionNodeIds)
    const clipboardNodes = nodes
      .filter((node) => selectedNodeIdSet.has(node.id))
      .map((node) => ({
        ...node,
        data: cloneNodeDataPreservingIds(normalizeNodeData(node.data)),
        selected: false,
      }))
    const clipboardEdges = getInternalSubgraphEdges(edges, selectedNodeIdSet).map(
      (edge) => ({
        ...edge,
        animated: false,
        data: {},
        selected: false,
      }),
    )

    setFlowClipboard({
      edges: clipboardEdges,
      entryNodeId: selectedNodeIdSet.has(scenarioMetadata.entryNodeId)
        ? scenarioMetadata.entryNodeId
        : '',
      nodes: clipboardNodes,
    })
    setAppMessage('השלבים הועתקו')
  }, [edges, nodes, scenarioMetadata.entryNodeId, selectedActionNodeIds])

  const pasteClipboardSteps = useCallback(() => {
    if (!flowClipboard || flowClipboard.nodes.length === 0) {
      setAppMessage('אין שלבים להדבקה.')

      return
    }

    const pasteOffset = (nextPasteOffsetNumber.current % 6) * 28
    const visibleCenter = getVisibleCanvasCenterPosition()
    const clonedSubgraph = cloneSubgraphWithNewIds({
      basePosition: {
        x: visibleCenter.x - nodeLayoutWidth / 2,
        y: visibleCenter.y - nodeLayoutHeight / 2,
      },
      layoutMode: 'viewport',
      pasteOffset: { x: pasteOffset, y: pasteOffset },
      reservedNodeIds: nodes.map((node) => node.id),
      sourceEdges: flowClipboard.edges,
      sourceEntryNodeId: flowClipboard.entryNodeId,
      sourceNodeIds: flowClipboard.nodes.map((node) => node.id),
      sourceNodes: flowClipboard.nodes,
    })
    const nextNodes = [
      ...nodes.map((node) => ({ ...node, selected: false })),
      ...clonedSubgraph.nodes,
    ]
    const pastedEntryNodeId =
      clonedSubgraph.entryNodeId ||
      (nodes.length === 0 && clonedSubgraph.nodes.length === 1
        ? clonedSubgraph.nodes[0].id
        : '')
    const nextEntryNodeId =
      scenarioMetadata.entryNodeId ||
      (nodes.length === 0 ? pastedEntryNodeId : '')
    const nextEdges = normalizeEdgesForNodes(
      [...edges, ...clonedSubgraph.edges],
      nextNodes,
      nextEntryNodeId,
    )

    setNodes(nextNodes)
    setEdges(nextEdges)
    setSelectedNodeId(clonedSubgraph.nodes[0]?.id ?? null)
    setSelectedEdgeId(null)

    if (!scenarioMetadata.entryNodeId && nextEntryNodeId) {
      setScenarioMetadata((currentMetadata) => ({
        ...currentMetadata,
        entryNodeId: nextEntryNodeId,
      }))
    }

    nextPasteOffsetNumber.current += 1
    applyEditorCountersForNodes(nextNodes)
    setAppMessage('השלבים הודבקו')
  }, [
    applyEditorCountersForNodes,
    edges,
    flowClipboard,
    getVisibleCanvasCenterPosition,
    nodes,
    scenarioMetadata.entryNodeId,
    setEdges,
    setNodes,
  ])

  const splitSelectedStepsToNewTab = useCallback(async () => {
    if (selectedActionNodeIds.length === 0) {
      setAppMessage('יש לבחור שלבים לפיצול')

      return
    }

    const shouldSplit = await requestConfirmation({
      title: 'פיצול תסריט',
      message:
        'יווצר תסריט חדש בכרטיסייה חדשה מהשלבים שנבחרו. התסריט המקורי לא יימחק.',
      confirmLabel: 'פצל לתסריט חדש',
      variant: 'primary',
    })

    if (!shouldSplit) {
      return
    }

    const clonedSubgraph = cloneSubgraphWithNewIds({
      layoutMode: 'auto',
      reservedNodeIds: [],
      sourceEdges: edges,
      sourceEntryNodeId: scenarioMetadata.entryNodeId,
      sourceNodeIds: selectedActionNodeIds,
      sourceNodes: nodes,
    })
    const splitTab = {
      ...createScenarioTab('פיצול מתסריט'),
      edgeStyle,
      edges: clonedSubgraph.edges,
      editorViewport: initialViewport,
      nodes: clonedSubgraph.nodes,
      scenarioMetadata: {
        ...initialScenarioMetadata,
        entryNodeId: clonedSubgraph.entryNodeId,
        scenarioDescription: `פוצל מתוך ${activeScenarioTab?.name ?? 'תסריט'}`,
      },
      selectedNodeId: clonedSubgraph.nodes[0]?.id ?? null,
    }
    const syncedTabs = syncActiveTabInList(scenarioTabs)

    setScenarioTabs([...syncedTabs, splitTab])
    loadScenarioTab(splitTab)
    setAppMessage('נפתחה כרטיסיית פיצול חדשה.')

    window.requestAnimationFrame(() => {
      void reactFlowInstanceRef.current?.fitView({
        duration: 250,
        padding: 0.18,
      })
    })
  }, [
    activeScenarioTab?.name,
    createScenarioTab,
    edgeStyle,
    edges,
    loadScenarioTab,
    nodes,
    requestConfirmation,
    scenarioMetadata.entryNodeId,
    scenarioTabs,
    selectedActionNodeIds,
    syncActiveTabInList,
  ])

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
        const parameterUpdates = nodeData.parameterUpdates.map((parameterUpdate) => {
          const parameterUpdateId = `parameter-${nextParameterUpdateNumber.current}`
          nextParameterUpdateNumber.current += 1

          return {
            ...parameterUpdate,
            id: parameterUpdateId,
          }
        })
        const actions = nodeData.actions.map((action) => {
          const actionId = `action-${nextActionNumber.current}`
          nextActionNumber.current += 1

          return {
            ...action,
            id: actionId,
          }
        })
        const tools = nodeData.tools.map((tool) => {
          const toolId = `tool-${nextToolNumber.current}`
          nextToolNumber.current += 1

          return {
            ...tool,
            id: toolId,
          }
        })
        const conditionRules = nodeData.condition.rules.map((rule) => {
          const ruleId = `condition-rule-${nextConditionRuleNumber.current}`
          nextConditionRuleNumber.current += 1

          return {
            ...rule,
            id: ruleId,
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
            parameterUpdates,
            actions,
            tools,
            parameterUpdate: { ...nodeData.parameterUpdate },
            action: { ...nodeData.action },
            tool: { ...nodeData.tool },
            condition: {
              logic: nodeData.condition.logic,
              rules: conditionRules,
            },
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
        : isConditionSourceHandle(sourceHandle)
          ? sourceHandle
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
          getConnectionWithPreferredHandles(
            {
              source: copiedSourceId,
              sourceHandle: copiedSourceHandle,
              target: copiedTargetId,
              targetHandle: edge.targetHandle ?? null,
            },
            duplicatedNodes,
          ),
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
      void deleteSelectedNode()
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deleteSelectedNode, selectedNode])

  useEffect(() => {
    const handleClipboardKeyDown = (event: KeyboardEvent) => {
      if (
        isEditableElement(event.target) ||
        (!event.metaKey && !event.ctrlKey)
      ) {
        return
      }

      const normalizedKey = event.key.toLowerCase()

      if (normalizedKey === 'c' && selectedActionNodeIds.length > 0) {
        event.preventDefault()
        copySelectedSteps()
      }

      if (normalizedKey === 'v' && flowClipboard) {
        event.preventDefault()
        pasteClipboardSteps()
      }
    }

    window.addEventListener('keydown', handleClipboardKeyDown)

    return () => window.removeEventListener('keydown', handleClipboardKeyDown)
  }, [
    copySelectedSteps,
    flowClipboard,
    pasteClipboardSteps,
    selectedActionNodeIds.length,
  ])

  const createConnectedNodeFromPopover = useCallback(
    (nodeType: DecisionNodeType) => {
      if (!pendingConnectionPopover) {
        return
      }

      shouldIgnoreNextPaneClickRef.current = false

      if (
        !canCreateOutgoingConnection(
          pendingConnectionPopover.sourceId,
          pendingConnectionPopover.sourceHandle,
          nodes,
          edges,
        )
      ) {
        setPendingConnectionPopover(null)

        return
      }

      const id = getNextStepId(nodes.map((node) => node.id))
      const newNode: DecisionNode = {
        id,
        type: 'decision',
        position: pendingConnectionPopover.nodePosition,
        selected: true,
        data: createNodeData(
          nodeType,
          `condition-rule-${nextConditionRuleNumber.current}`,
        ),
      }
      if (nodeType === 'condition') {
        nextConditionRuleNumber.current += 1
      }
      const nextNodes = [
        ...nodes.map((node) =>
          node.selected ? { ...node, selected: false } : node,
        ),
        newNode,
      ]
      const sourceData = getNodeDataById(nodes, pendingConnectionPopover.sourceId)
      const connection: Connection = {
        source: pendingConnectionPopover.sourceId,
        sourceHandle: pendingConnectionPopover.sourceHandle,
        target: id,
        targetHandle: null,
      }

      if (
        !sourceData ||
        !isDecisionConnectionValid(
          connection,
          nextNodes,
          edges,
          scenarioMetadata.entryNodeId,
        )
      ) {
        setPendingConnectionPopover(null)

        return
      }

      const preferredConnection = getConnectionWithPreferredHandles(
        connection,
        nextNodes,
      )

      setNodes(nextNodes)
      setEdges(addEdge(createDecisionEdge(preferredConnection, sourceData), edges))
      if (!scenarioMetadata.entryNodeId && nodes.length === 0) {
        setScenarioMetadata((currentMetadata) => ({
          ...currentMetadata,
          entryNodeId: id,
        }))
      }
      setSelectedNodeId(id)
      setSelectedEdgeId(null)
      setPendingConnectionPopover(null)
    },
    [
      edges,
      nodes,
      pendingConnectionPopover,
      scenarioMetadata.entryNodeId,
      setEdges,
      setNodes,
    ],
  )

  const addNode = useCallback(
    (nodeType: DecisionNodeType) => {
      const basePosition = getVisibleCanvasCenterPosition()
      const conditionRuleId = `condition-rule-${nextConditionRuleNumber.current}`

      if (nodeType === 'condition') {
        nextConditionRuleNumber.current += 1
      }

      const id = getNextStepId(nodes.map((node) => node.id))
      const offset = (nodes.length % 5) * 24
      const newNode: DecisionNode = {
        id,
        type: 'decision',
        position: {
          x: basePosition.x + offset,
          y: basePosition.y + offset,
        },
        data: createNodeData(nodeType, conditionRuleId),
      }

      setNodes((currentNodes) => [...currentNodes, newNode])
      if (!scenarioMetadata.entryNodeId && nodes.length === 0) {
        setScenarioMetadata((currentMetadata) => ({
          ...currentMetadata,
          entryNodeId: id,
        }))
      }
      setPendingConnectionPopover(null)
    },
    [getVisibleCanvasCenterPosition, nodes, scenarioMetadata.entryNodeId, setNodes],
  )

  const handleConnectStart = useCallback<OnConnectStart>((_event, params) => {
    if (params.handleType !== 'source' || !params.nodeId) {
      connectionStartRef.current = null

      return
    }

    connectionStartRef.current = {
      sourceId: params.nodeId,
      sourceHandle: params.handleId ?? DIRECT_SOURCE_HANDLE_ID,
    }
    setPendingConnectionPopover(null)
  }, [])

  const handleConnectEnd = useCallback<OnConnectEnd>(
    (event, connectionState) => {
      const connectionStart = connectionStartRef.current

      connectionStartRef.current = null

      if (
        !connectionStart ||
        connectionState.toNode !== null ||
        connectionState.toHandle !== null
      ) {
        return
      }

      if (
        !canCreateOutgoingConnection(
          connectionStart.sourceId,
          connectionStart.sourceHandle,
          nodes,
          edges,
        )
      ) {
        return
      }

      const clientPosition = getClientPositionFromEvent(event)

      if (!clientPosition) {
        return
      }

      shouldIgnoreNextPaneClickRef.current = true
      setSelectedEdgeId(null)
      setPendingConnectionPopover({
        ...connectionStart,
        ...getCanvasPlacementFromClientPosition(clientPosition),
      })
    },
    [edges, getCanvasPlacementFromClientPosition, nodes],
  )

  const focusStartStep = useCallback(() => {
    if (nodes.length === 0) {
      setAppMessage('אין שלבים בתסריט')

      return
    }

    const entryNode = scenarioMetadata.entryNodeId
      ? nodes.find((node) => node.id === scenarioMetadata.entryNodeId)
      : null
    const fallbackNode = getFirstScenarioNode(nodes)
    const targetNode = entryNode ?? fallbackNode

    if (!targetNode) {
      setAppMessage('אין שלבים בתסריט')

      return
    }

    const nodeWidth =
      typeof targetNode.width === 'number' ? targetNode.width : nodeLayoutWidth
    const nodeHeight =
      typeof targetNode.height === 'number' ? targetNode.height : nodeLayoutHeight

    void reactFlowInstanceRef.current?.setCenter(
      targetNode.position.x + nodeWidth / 2,
      targetNode.position.y + nodeHeight / 2,
      {
        duration: 350,
        zoom: 0.95,
      },
    )

    if (!entryNode) {
      setAppMessage('לא הוגדר שלב התחלתי, עברנו לשלב הראשון בתסריט')
    }
  }, [nodes, scenarioMetadata.entryNodeId])

  const selectTreeFromNode = useCallback(async () => {
    if (selectedActionNodeIds.length !== 1) {
      setAppMessage('יש לבחור שלב אחד כדי לבחור עץ')

      return
    }

    const sourceNodeId = selectedActionNodeIds[0]
    const sourceNode = nodes.find((node) => node.id === sourceNodeId)

    if (!sourceNode) {
      return
    }

    const sourceData = normalizeNodeData(sourceNode.data)
    let sourceHandles: string[] = []
    let shouldWarnNoConnectedContinuation = false

    if (sourceData.nodeType === 'condition') {
      const treeChoice = await requestDialogChoice({
        title: 'בחירת עץ',
        message: 'מאיזה מסלול להתחיל את בחירת העץ?',
        actions: [
          {
            label: 'כל המסלולים',
            value: 'tree-all-condition',
            variant: 'primary',
          },
          {
            label: 'מתקיים',
            value: CONDITION_THEN_HANDLE_ID,
            variant: 'secondary',
          },
          {
            label: 'לא מתקיים',
            value: CONDITION_ELSE_HANDLE_ID,
            variant: 'secondary',
          },
          {
            label: 'ביטול',
            value: 'cancel',
            variant: 'secondary',
          },
        ],
      })

      if (treeChoice === 'cancel') {
        return
      }

      sourceHandles =
        treeChoice === 'tree-all-condition'
          ? [CONDITION_THEN_HANDLE_ID, CONDITION_ELSE_HANDLE_ID]
          : [treeChoice]
      shouldWarnNoConnectedContinuation = treeChoice !== 'tree-all-condition'
    } else if (sourceData.options.length > 0) {
      const treeChoice = await requestDialogChoice({
        title: 'בחירת עץ',
        message: 'מאיזו אפשרות להתחיל את בחירת העץ?',
        actions: [
          {
            label: 'כל האפשרויות',
            value: 'tree-all-options',
            variant: 'primary',
          },
          ...sourceData.options.map((option) => ({
            label: option.label.trim() || 'אפשרות ללא טקסט',
            value: option.id,
            variant: 'secondary' as const,
          })),
          {
            label: 'ביטול',
            value: 'cancel',
            variant: 'secondary',
          },
        ],
      })

      if (treeChoice === 'cancel') {
        return
      }

      sourceHandles =
        treeChoice === 'tree-all-options'
          ? sourceData.options.map((option) => option.id)
          : [treeChoice]
      shouldWarnNoConnectedContinuation = treeChoice !== 'tree-all-options'
    } else if (!isTerminalNodeType(sourceData.nodeType)) {
      sourceHandles = [DIRECT_SOURCE_HANDLE_ID]
      shouldWarnNoConnectedContinuation = true
    }

    const reachableNodeIds = getReachableTreeNodeIds(
      nodes,
      edges,
      sourceNodeId,
      sourceHandles,
    )

    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        selected: reachableNodeIds.has(node.id),
      })),
    )
    setSelectedNodeId(sourceNodeId)
    setSelectedEdgeId(null)
    setAppMessage(
      shouldWarnNoConnectedContinuation && reachableNodeIds.size === 1
        ? 'לא נמצא המשך מחובר לאפשרות שנבחרה'
        : `נבחרו ${reachableNodeIds.size} שלבים בעץ`,
    )
  }, [
    edges,
    nodes,
    requestDialogChoice,
    selectedActionNodeIds,
    setNodes,
  ])

  const arrangeCurrentNodes = useCallback(() => {
    if (nodes.length === 0) {
      setAppMessage('אין כרטיסיות לסידור.')

      return
    }

    const layoutPositions = createAutoLayoutPositions(
      nodes.map((node) => ({ id: node.id })),
      edges.map((edge) => ({ source: edge.source, target: edge.target })),
    )

    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        layoutPositions[node.id]
          ? {
              ...node,
              position: layoutPositions[node.id],
            }
          : node,
      ),
    )
    setAppMessage('הכרטיסיות סודרו מחדש')

    window.requestAnimationFrame(() => {
      void reactFlowInstanceRef.current?.fitView({
        duration: 250,
        padding: 0.18,
      })
    })
  }, [edges, nodes, setNodes])

  return (
    <main className="app-shell" dir="rtl">
      <header className="top-toolbar">
        {!isAutosaveNoticeDismissed ? (
          <DismissibleNotice
            className="top-toolbar__autosave-notice"
            onDismiss={() => setIsAutosaveNoticeDismissed(true)}
          >
            אין שמירה אוטומטית — יש לייצא YAML כדי לשמור את העבודה
          </DismissibleNotice>
        ) : null}
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
        <button
          type="button"
          className="top-toolbar__button"
          onClick={arrangeCurrentNodes}
        >
          סדר כרטיסיות
        </button>
        <button
          type="button"
          className="top-toolbar__button"
          onClick={focusStartStep}
        >
          לשלב ההתחלתי
        </button>
        <button
          type="button"
          className="top-toolbar__button"
          disabled={selectedActionNodeIds.length !== 1}
          onClick={selectTreeFromNode}
        >
          בחר עץ
        </button>
        <button
          type="button"
          className="top-toolbar__button"
          disabled={!flowClipboard}
          onClick={pasteClipboardSteps}
        >
          הדבק
        </button>
        <button
          type="button"
          className="top-toolbar__button"
          disabled={selectedActionNodeIds.length === 0}
          onClick={copySelectedSteps}
        >
          העתק
        </button>
        <button
          type="button"
          className="top-toolbar__button"
          disabled={selectedActionNodeIds.length === 0}
          onClick={splitSelectedStepsToNewTab}
        >
          פצל לתסריט חדש
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

        <label className="edge-style-toggle">
          <span>סגנון קווים</span>
          <select
            value={edgeStyle}
            dir="rtl"
            onChange={(event) => setEdgeStyle(event.currentTarget.value as EdgeStyle)}
          >
            {(Object.keys(edgeStyleLabels) as EdgeStyle[]).map((styleKey) => (
              <option key={styleKey} value={styleKey}>
                {edgeStyleLabels[styleKey]}
              </option>
            ))}
          </select>
        </label>
      </header>

      <nav className="scenario-tabs" aria-label="כרטיסיות תסריט">
        {scenarioTabs.map((tab) => {
          const isActiveTab = tab.id === activeScenarioTabId
          const tabHasContent = isActiveTab
            ? nodes.length > 0 || edges.length > 0
            : hasScenarioTabContent(tab)

          return (
            <div
              key={tab.id}
              className={[
                'scenario-tabs__item',
                isActiveTab ? 'scenario-tabs__item--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <button
                type="button"
                className="scenario-tabs__tab-button"
                aria-current={isActiveTab ? 'page' : undefined}
                onClick={() => switchScenarioTab(tab.id)}
              >
                <span>{tab.name}</span>
                {tabHasContent ? (
                  <span
                    className="scenario-tabs__content-dot"
                    aria-hidden="true"
                  />
                ) : null}
              </button>
              <button
                type="button"
                className="scenario-tabs__close-button"
                aria-label={`סגור ${tab.name}`}
                title="סגור כרטיסייה"
                onClick={() => {
                  void closeScenarioTab(tab.id)
                }}
              >
                ×
              </button>
            </div>
          )
        })}
      </nav>

      <div className="workspace-shell">
        <aside className="sidebar" aria-label="סרגל הוספת צמתים">
        <div className="sidebar__header">
          <p className="sidebar__eyebrow">עורך עץ החלטות</p>
          <h1>בונה זרימה</h1>
        </div>

        <section
          className={[
            'sidebar__add-steps',
            isAddStepSectionExpanded ? 'sidebar__add-steps--expanded' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label="הוספת שלבים"
        >
          {selectedNodeId !== null ? (
            <button
              type="button"
              className="sidebar__add-steps-toggle"
              aria-expanded={isAddStepSectionExpanded}
              onClick={() =>
                setExpandedAddStepsForNodeId((currentNodeId) =>
                  currentNodeId === selectedNodeId ? null : selectedNodeId,
                )
              }
            >
              <span>הוספת שלב</span>
              <span aria-hidden="true">{isAddStepSectionExpanded ? '−' : '+'}</span>
            </button>
          ) : null}

          {isAddStepSectionExpanded ? (
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
          ) : null}
        </section>

        {appMessage ? (
          <DismissibleNotice
            className="app-message"
            onDismiss={() => setAppMessage('')}
          >
            {appMessage}
          </DismissibleNotice>
        ) : null}

        <section className="properties-panel" aria-label="פרטי השלב הנבחר">
          <h2>פרטי שלב</h2>

          {selectedNode && selectedNodeData ? (
            <div className="properties-panel__form" dir="rtl">
              <section className="properties-panel__section" aria-label="פרטי שלב">
                <h3>פרטי שלב</h3>
                <div className="properties-panel__section-body">
                  <label className="properties-panel__field">
                    <span>מזהה שלב</span>
                    <input
                      type="text"
                      value={selectedNode.id}
                      dir="rtl"
                      className="properties-panel__control properties-panel__control--code"
                      onChange={(event) =>
                        updateSelectedNodeId(event.currentTarget.value)
                      }
                    />
                  </label>

                  <label className="properties-panel__field">
                    <span>סוג שלב</span>
                    <select
                      value={selectedNodeData.nodeType}
                      dir="rtl"
                      className="properties-panel__control"
                      onChange={(event) =>
                        updateSelectedNodeType(
                          event.currentTarget.value as DecisionNodeType,
                        )
                      }
                    >
                      {sidebarActions.map((action) => (
                        <option key={action.nodeType} value={action.nodeType}>
                          {typeLabels[action.nodeType]}
                        </option>
                      ))}
                      {selectedNodeData.nodeType === 'note' ? (
                        <option value="note" disabled>
                          {typeLabels.note}
                        </option>
                      ) : null}
                    </select>
                  </label>

                  {shouldShowScriptFieldInSidePanel(selectedNodeData.nodeType) ? (
                    <label className="properties-panel__field">
                      <span>{getScriptFieldLabel(selectedNodeData.nodeType)}</span>
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
                  ) : null}
                </div>
              </section>

              {supportsOptions(selectedNodeData.nodeType) ? (
                <section
                  className="properties-panel__section"
                  aria-label="אפשרויות תשובה"
                >
                  <div className="properties-panel__section-header">
                    <h3>אפשרויות תשובה</h3>
                    <button
                      type="button"
                      className="collection-editor__add-button"
                      onClick={addSelectedNodeOption}
                    >
                      הוסף אפשרות
                    </button>
                  </div>

                  <div className="collection-editor__list properties-panel__section-body">
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

              {selectedNodeData.nodeType === 'parameterUpdate' ? (
                <section className="properties-panel__section" aria-label="עדכון פרמטר">
                  <h3>עדכון פרמטר</h3>
                  <div className="properties-panel__section-body">
                    <label className="properties-panel__field">
                      <span>שם פרמטר</span>
                      <input
                        type="text"
                        value={selectedNodeData.parameterUpdate.name}
                        dir="rtl"
                        className="properties-panel__control"
                        onChange={(event) =>
                          updateStandaloneParameterUpdate({
                            name: event.currentTarget.value,
                          })
                        }
                      />
                    </label>

                    <label className="properties-panel__field">
                      <span>ערך פרמטר</span>
                      <input
                        type="text"
                        value={selectedNodeData.parameterUpdate.value}
                        dir="rtl"
                        className="properties-panel__control"
                        onChange={(event) =>
                          updateStandaloneParameterUpdate({
                            value: event.currentTarget.value,
                          })
                        }
                      />
                    </label>
                  </div>
                </section>
              ) : null}

              {selectedNodeData.nodeType === 'action' ? (
                <section className="properties-panel__section" aria-label="יציאה ל-ACTION">
                  <h3>יציאה ל-ACTION</h3>
                  <div className="properties-panel__section-body">
                    <label className="properties-panel__field">
                      <span>שם ACTION</span>
                      <input
                        type="text"
                        value={selectedNodeData.action.name}
                        dir="rtl"
                        className="properties-panel__control"
                        onChange={(event) =>
                          updateStandaloneAction({ name: event.currentTarget.value })
                        }
                      />
                    </label>

                    <p className="properties-panel__hint">
                      הסוכן מבצע את ה-ACTION מאחורי הקלעים ומסיים את זרימת התסריט.
                    </p>
                  </div>
                </section>
              ) : null}

              {selectedNodeData.nodeType === 'tool' ? (
                <section className="properties-panel__section" aria-label="יציאה לכלי">
                  <h3>יציאה לכלי</h3>
                  <div className="properties-panel__section-body">
                    <label className="properties-panel__field">
                      <span>שם כלי</span>
                      <input
                        type="text"
                        value={selectedNodeData.tool.name}
                        dir="rtl"
                        className="properties-panel__control"
                        onChange={(event) =>
                          updateStandaloneTool({ name: event.currentTarget.value })
                        }
                      />
                    </label>
                  </div>
                </section>
              ) : null}

              {selectedNodeData.nodeType === 'condition' ? (
                <section className="properties-panel__section" aria-label="תנאי IF/THEN">
                  <div className="properties-panel__section-header">
                    <h3>תנאי IF/THEN</h3>
                    <button
                      type="button"
                      className="collection-editor__add-button"
                      onClick={addConditionRule}
                    >
                      הוסף כלל
                    </button>
                  </div>

                  <div className="properties-panel__section-body">
                    <label className="properties-panel__field">
                      <span>לוגיקה</span>
                      <select
                        value={selectedNodeData.condition.logic}
                        dir="rtl"
                        className="properties-panel__control"
                        onChange={(event) =>
                          updateConditionLogic(
                            event.currentTarget.value as ConditionLogic,
                          )
                        }
                      >
                        {(['all', 'any'] as const).map((logic) => (
                          <option key={logic} value={logic}>
                            {conditionLogicLabels[logic]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="collection-editor__list">
                      {selectedNodeData.condition.rules.map((rule, ruleIndex) => (
                        <div key={rule.id} className="collection-editor__row">
                          <div className="collection-editor__fields">
                            <label className="collection-editor__field">
                              <span>{`כלל ${ruleIndex + 1}: שם פרמטר`}</span>
                              <input
                                type="text"
                                value={rule.parameterName}
                                dir="rtl"
                                className="properties-panel__control"
                                onChange={(event) =>
                                  updateConditionRule(rule.id, {
                                    parameterName: event.currentTarget.value,
                                  })
                                }
                              />
                            </label>

                            <label className="collection-editor__field">
                              <span>אופרטור</span>
                              <select
                                value={rule.operator}
                                dir="rtl"
                                className="properties-panel__control"
                                onChange={(event) =>
                                  updateConditionRule(rule.id, {
                                    operator: event.currentTarget
                                      .value as ConditionOperator,
                                  })
                                }
                              >
                                {conditionOperators.map((operator) => (
                                  <option key={operator} value={operator}>
                                    {conditionOperatorLabels[operator]}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="collection-editor__field">
                              <span>ערך</span>
                              <input
                                type="text"
                                value={rule.value}
                                dir="rtl"
                                disabled={!conditionOperatorRequiresValue(rule.operator)}
                                className="properties-panel__control"
                                placeholder={
                                  conditionOperatorRequiresValue(rule.operator)
                                    ? ''
                                    : 'אין צורך בערך'
                                }
                                onChange={(event) =>
                                  updateConditionRule(rule.id, {
                                    value: event.currentTarget.value,
                                  })
                                }
                              />
                            </label>
                          </div>

                          <button
                            type="button"
                            className="collection-editor__delete-button"
                            onClick={() => deleteConditionRule(rule.id)}
                          >
                            מחק
                          </button>
                        </div>
                      ))}

                      {selectedNodeData.condition.rules.length === 0 ? (
                        <p className="collection-editor__empty">אין כללי תנאי עדיין</p>
                      ) : null}
                    </div>

                  </div>
                </section>
              ) : null}

              {!isInternalNodeType(selectedNodeData.nodeType) ? (
                <>
              <section className="properties-panel__section" aria-label="תמונות">
                <div className="properties-panel__section-header">
                  <h3>תמונות</h3>
                  <button
                    type="button"
                    className="collection-editor__add-button"
                    onClick={addSelectedNodeImage}
                  >
                    הוסף תמונה
                  </button>
                </div>

                <div className="collection-editor__list properties-panel__section-body">
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

              <section className="properties-panel__section" aria-label="קישורי מידע">
                <div className="properties-panel__section-header">
                  <h3>קישורי מידע</h3>
                  <button
                    type="button"
                    className="collection-editor__add-button"
                    onClick={addSelectedNodeLink}
                  >
                    הוסף קישור
                  </button>
                </div>

                <div className="collection-editor__list properties-panel__section-body">
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
                </>
              ) : null}

              <section className="properties-panel__section" aria-label="פעולות שלב">
                <h3>פעולות שלב</h3>
                <button
                  type="button"
                  className="delete-step-button"
                  onClick={deleteSelectedNode}
                >
                  מחק שלב
                </button>
              </section>
            </div>
          ) : (
            <p className="properties-panel__empty">אין שלב נבחר</p>
          )}
        </section>
        </aside>

        <section
          ref={canvasPanelRef}
          className="canvas-panel"
          aria-label="קנבס עץ ההחלטות"
        >
        <ReactFlow<DecisionNode, DecisionEdge>
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          onConnectStart={handleConnectStart}
          onConnectEnd={handleConnectEnd}
          onInit={(reactFlowInstance) => {
            reactFlowInstanceRef.current = reactFlowInstance
            setEditorViewport(reactFlowInstance.getViewport())
          }}
          onMove={(_, viewport) => setEditorViewport(viewport)}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onPaneClick={() => {
            if (shouldIgnoreNextPaneClickRef.current) {
              shouldIgnoreNextPaneClickRef.current = false

              return
            }

            setSelectedNodeId(null)
            setSelectedEdgeId(null)
            setPendingConnectionPopover(null)
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
          <MiniMap
            className="flow-minimap"
            position="bottom-right"
            pannable
            zoomable
            maskColor="rgba(15, 23, 42, 0.12)"
            nodeColor={(node) => {
              const nodeData = normalizeNodeData(node.data)

              if (node.id === scenarioMetadata.entryNodeId) {
                return '#facc15'
              }

              return isInternalNodeType(nodeData.nodeType) ? '#0f766e' : '#2563eb'
            }}
          />
          <Controls position="bottom-left" />
        </ReactFlow>

        {pendingConnectionPopover ? (
          <div
            className="connection-create-popover"
            dir="rtl"
            style={{
              right: 'auto',
              top: pendingConnectionPopover.popoverPosition.y,
              left: pendingConnectionPopover.popoverPosition.x,
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <strong>צור שלב מחובר</strong>
            <div className="connection-create-popover__actions">
              {sidebarActions.map((action) => (
                <button
                  key={action.nodeType}
                  type="button"
                  onClick={() => createConnectedNodeFromPopover(action.nodeType)}
                >
                  {typeLabels[action.nodeType]}
                </button>
              ))}
              <button
                type="button"
                className="connection-create-popover__cancel"
                onClick={() => {
                  shouldIgnoreNextPaneClickRef.current = false
                  setPendingConnectionPopover(null)
                }}
              >
                ביטול
              </button>
            </div>
          </div>
        ) : null}

        {selectedNodeCount > 0 ? (
          <div className="bulk-actions-toolbar" dir="rtl" aria-label="פעולות על בחירה">
            <strong>{`${selectedNodeCount} ${
              selectedNodeCount === 1 ? 'שלב נבחר' : 'שלבים נבחרו'
            }`}</strong>
            <button type="button" onClick={duplicateSelectedNodes}>
              שכפל נבחרים
            </button>
            <button type="button" onClick={copySelectedSteps}>
              העתק
            </button>
            <button type="button" onClick={splitSelectedStepsToNewTab}>
              פצל לתסריט חדש
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
                <span>שם פריט במאגר הידע במערכת הצ'אט</span>
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
                <span>שם הפריט במאגר המידע</span>
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
                <span>קישור לפריט במאגר המידע</span>
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
              <fieldset className="yaml-import-panel__mode-group">
                <legend>אופן ייבוא</legend>
                <label>
                  <input
                    type="radio"
                    name="yaml-import-mode"
                    value="replace"
                    checked={yamlImportMode === 'replace'}
                    onChange={() => {
                      setYamlImportMode('replace')
                      setShouldConnectAppendedFlow(false)
                      setAppendLayoutMode('auto')
                    }}
                  />
                  <span>ייבוא תסריט חדש במקום הנוכחי</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="yaml-import-mode"
                    value="append"
                    checked={yamlImportMode === 'append'}
                    onChange={() => setYamlImportMode('append')}
                  />
                  <span>הוספת YAML לתסריט הנוכחי</span>
                </label>
              </fieldset>

              {yamlImportMode === 'append' ? (
                <section className="yaml-import-panel__append-options">
                  <fieldset className="yaml-import-panel__mode-group">
                    <legend>סידור הכרטיסיות מהקובץ המיובא</legend>
                    <label>
                      <input
                        type="radio"
                        name="append-layout-mode"
                        value="auto"
                        checked={appendLayoutMode === 'auto'}
                        onChange={() => setAppendLayoutMode('auto')}
                      />
                      <span>לסדר אוטומטית באזור פנוי</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="append-layout-mode"
                        value="preserve"
                        checked={appendLayoutMode === 'preserve'}
                        onChange={() => setAppendLayoutMode('preserve')}
                      />
                      <span>להשתמש במיקומים מהקובץ</span>
                    </label>
                  </fieldset>

                  <label className="yaml-import-panel__checkbox-field">
                    <input
                      type="checkbox"
                      checked={shouldApplyAppendConnection}
                      disabled={appendSourceOptions.length === 0}
                      onChange={(event) =>
                        setShouldConnectAppendedFlow(event.currentTarget.checked)
                      }
                    />
                    <span>חבר את התסריט המיובא לנקודה שנבחרה</span>
                  </label>

                  {appendSourceOptions.length > 0 ? (
                    <label className="yaml-import-panel__field">
                      <span>{appendSourceSelectLabel}</span>
                      <select
                        value={activeAppendSourceHandle}
                        dir="rtl"
                        onChange={(event) =>
                          setAppendSourceHandle(event.currentTarget.value)
                        }
                      >
                        {appendSourceOptions.map((sourceOption) => (
                          <option key={sourceOption.value} value={sourceOption.value}>
                            {`${selectedNode?.id ?? ''} - ${sourceOption.label}${
                              sourceOption.currentTargetId
                                ? ` (מחובר אל ${sourceOption.currentTargetId})`
                                : ''
                            }`}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : selectedAppendSourceMode === 'terminal' ? (
                    <p className="yaml-import-panel__hint">
                      השלב שנבחר מסיים את התסריט ולא ניתן לחבר ממנו תסריט מיובא.
                    </p>
                  ) : (
                    <p className="yaml-import-panel__hint">
                      אין כרגע נקודת חיבור פנויה שנבחרה. ה-YAML יתווסף כזרימה נפרדת וניתן לחבר אותו ידנית.
                    </p>
                  )}
                </section>
              ) : null}

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
                {yamlImportMode === 'append'
                  ? 'הוסף YAML לתסריט'
                  : 'ייבא YAML'}
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
              {hasValidationErrors ? (
                <button type="button" onClick={continueYamlExportAsDraft}>
                  ייצא כטיוטה למרות השגיאות
                </button>
              ) : null}
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

      {confirmDialog ? (
        <ConfirmDialog
          dialog={confirmDialog}
          onCancel={() => closeConfirmDialog('cancel')}
          onSelect={closeConfirmDialog}
        />
      ) : null}
    </main>
  )
}

export default App
