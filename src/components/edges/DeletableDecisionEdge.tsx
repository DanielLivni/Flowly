import { useState } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react'
import type { DecisionEdge } from '../../types/flow'

export function DeletableDecisionEdge({
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
