import { sidebarActions, typeLabels } from '../../constants/flow'
import type { DecisionNodeType, PendingConnectionPopover } from '../../types/flow'

type ConnectionCreatePopoverProps = {
  pendingConnectionPopover: PendingConnectionPopover
  onCreateConnectedNode: (nodeType: DecisionNodeType) => void
  onCancel: () => void
}

type BulkActionsToolbarProps = {
  selectedNodeCount: number
  onDuplicateSelectedNodes: () => void
  onDeleteSelectedNodes: () => void
  onClearNodeSelection: () => void
}

export function ConnectionCreatePopover({
  pendingConnectionPopover,
  onCreateConnectedNode,
  onCancel,
}: ConnectionCreatePopoverProps) {
  return (
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
            onClick={() => onCreateConnectedNode(action.nodeType)}
          >
            {typeLabels[action.nodeType]}
          </button>
        ))}
        <button
          type="button"
          className="connection-create-popover__cancel"
          onClick={onCancel}
        >
          ביטול
        </button>
      </div>
    </div>
  )
}

export function BulkActionsToolbar({
  selectedNodeCount,
  onDuplicateSelectedNodes,
  onDeleteSelectedNodes,
  onClearNodeSelection,
}: BulkActionsToolbarProps) {
  if (selectedNodeCount === 0) {
    return null
  }

  return (
    <div className="bulk-actions-toolbar" dir="rtl" aria-label="פעולות על בחירה">
      <strong>{`${selectedNodeCount} ${
        selectedNodeCount === 1 ? 'שלב נבחר' : 'שלבים נבחרו'
      }`}</strong>
      <button type="button" onClick={onDuplicateSelectedNodes}>
        שכפל נבחרים
      </button>
      <button
        type="button"
        className="bulk-actions-toolbar__danger"
        onClick={onDeleteSelectedNodes}
      >
        מחק נבחרים
      </button>
      <button type="button" onClick={onClearNodeSelection}>
        נקה בחירה
      </button>
    </div>
  )
}
