import type { Edge, Node, Viewport, XYPosition } from '@xyflow/react'

export type DecisionNodeType = 'question' | 'choice' | 'instruction' | 'note' | 'end'

export type CanvasMode = 'pan' | 'select'

export type EdgeStyle = 'orthogonal' | 'curved'

export type DirectSourcePosition = 'left' | 'bottom'

export type TargetHandleId =
  | 'target-top'
  | 'target-right'
  | 'target-bottom'
  | 'target-left'

export type DecisionOption = {
  id: string
  label: string
}

export type DecisionImage = {
  id: string
  key: string
  title: string
}

export type DecisionLink = {
  id: string
  label: string
  itemId: string
}

export type DecisionParameterUpdate = {
  id: string
  name: string
  value: string
}

export type DecisionAction = {
  id: string
  name: string
}

export type DecisionTool = {
  id: string
  name: string
}

export type DecisionNodeData = {
  nodeType: DecisionNodeType
  script: string
  options: DecisionOption[]
  images: DecisionImage[]
  links: DecisionLink[]
  parameterUpdates: DecisionParameterUpdate[]
  actions: DecisionAction[]
  tools: DecisionTool[]
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
  onToggleMultiSelect?: (nodeId: string, isSelected: boolean) => void
}

export type LegacyDecisionNodeData = Partial<
  Omit<DecisionNodeData, 'actions' | 'options' | 'parameterUpdates' | 'tools'>
> & {
  nodeType?: DecisionNodeType
  imageKey?: string
  options?: Array<DecisionOption | string>
  parameterUpdates?: Array<Partial<DecisionParameterUpdate>>
  actions?: Array<Partial<DecisionAction>>
  tools?: Array<Partial<DecisionTool>>
}

export type DecisionNode = Node<DecisionNodeData, 'decision'>

export type DecisionEdgeData = {
  edgeStyle?: EdgeStyle
  onDelete?: (edgeId: string) => void
}

export type DecisionEdge = Edge<DecisionEdgeData, 'deletable'>

export type SidebarAction = {
  nodeType: DecisionNodeType
  label: string
}

export type ScenarioMetadata = {
  scenarioDescription: string
  glassixKnowledgeItemName: string
  searchoItemName: string
  searchoItemUrl: string
  entryNodeId: string
}

// מבנה ה-YAML הוא החוזה מול הסוכן. שינוי כאן דורש תאימות לאחור.
export type YamlExport = {
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

export type YamlExportStep = {
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
  options?: YamlExportOption[]
  next?: string
  navigation: {
    previousStepIds: string[]
    nextStepIds: string[]
  }
}

export type YamlExportOption = {
  label: string
  next?: string
}

export type ValidationMessage = {
  id: string
  text: string
  stepId?: string
}

export type ValidationReport = {
  errors: ValidationMessage[]
  warnings: ValidationMessage[]
}

export type ImportedStepOption = {
  label: string
  next: string
}

export type ImportedStep = {
  id: string
  nodeType: DecisionNodeType
  script: string
  images: Array<Omit<DecisionImage, 'id'>>
  links: Array<Omit<DecisionLink, 'id'>>
  parameterUpdates: Array<Omit<DecisionParameterUpdate, 'id'>>
  actions: Array<Omit<DecisionAction, 'id'>>
  tools: Array<Omit<DecisionTool, 'id'>>
  options: ImportedStepOption[]
  next: string
}

export type ImportedFlow = {
  edges: DecisionEdge[]
  nextActionNumber: number
  nextImageNumber: number
  nextLinkNumber: number
  nextOptionNumber: number
  nextParameterUpdateNumber: number
  nextToolNumber: number
  nodes: DecisionNode[]
  edgeStyle: EdgeStyle
  scenarioMetadata: ScenarioMetadata
  shouldFitView: boolean
  viewport?: Viewport
}

export type PendingConnectionPopover = {
  sourceId: string
  sourceHandle: string
  nodePosition: XYPosition
  popoverPosition: XYPosition
}
