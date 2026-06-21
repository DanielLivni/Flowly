import { Position, type Viewport } from '@xyflow/react'
import type {
  CanvasMode,
  DecisionNodeType,
  EdgeStyle,
  ScenarioMetadata,
  SidebarAction,
  TargetHandleId,
} from '../types/flow'

export const typeLabels: Record<DecisionNodeType, string> = {
  question: 'שאלה',
  choice: 'בחירה',
  instruction: 'הנחיה',
  note: 'הערה',
  end: 'סיום',
}

export const canvasModeLabels: Record<CanvasMode, string> = {
  pan: 'מצב הזזה',
  select: 'מצב סימון',
}

export const canvasModeHelperText: Record<CanvasMode, string> = {
  pan: 'גרור את הרקע כדי לזוז במפה',
  select: 'גרור על הרקע כדי לסמן כמה שלבים',
}

export const edgeStyleLabels: Record<EdgeStyle, string> = {
  orthogonal: 'קווים זוויתיים',
  curved: 'קווים מעוקלים',
}

export const sidebarActions: SidebarAction[] = [
  { nodeType: 'question', label: 'הוסף שאלה' },
  { nodeType: 'choice', label: 'הוסף בחירה' },
  { nodeType: 'instruction', label: 'הוסף הנחיה' },
  { nodeType: 'note', label: 'הוסף הערה' },
  { nodeType: 'end', label: 'הוסף סיום' },
]

export const decisionNodeTypes = new Set<DecisionNodeType>(
  sidebarActions.map((action) => action.nodeType),
)

export const initialScenarioMetadata: ScenarioMetadata = {
  scenarioDescription: '',
  glassixKnowledgeItemName: '',
  searchoItemName: '',
  searchoItemUrl: '',
  entryNodeId: '',
}

export const DIRECT_SOURCE_HANDLE_ID = 'out'
export const DIRECT_EDGE_LABEL = 'המשך'
export const DEFAULT_EDGE_STYLE: EdgeStyle = 'orthogonal'
export const TARGET_HANDLE_TOP: TargetHandleId = 'target-top'
export const TARGET_HANDLE_RIGHT: TargetHandleId = 'target-right'
export const TARGET_HANDLE_BOTTOM: TargetHandleId = 'target-bottom'
export const TARGET_HANDLE_LEFT: TargetHandleId = 'target-left'

export const targetHandleConfigs: Array<{
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

export const initialViewport: Viewport = { x: 40, y: 40, zoom: 0.95 }
export const nodeLayoutWidth = 218
export const nodeLayoutHeight = 140
