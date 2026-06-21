import { useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps, useUpdateNodeInternals } from '@xyflow/react'
import { DIRECT_SOURCE_HANDLE_ID, targetHandleConfigs, typeLabels } from '../../constants/flow'
import type { DecisionNode, DecisionOption } from '../../types/flow'
import { normalizeNodeData, supportsOptions } from '../../utils/flowHelpers'

export function DecisionTreeNode({ id, data, selected }: NodeProps<DecisionNode>) {
  const updateNodeInternals = useUpdateNodeInternals()
  const nodeData = normalizeNodeData(data)
  const scriptText = nodeData.script.trim()
  const [isEditingScript, setIsEditingScript] = useState(false)
  const [scriptDraft, setScriptDraft] = useState(nodeData.script)
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null)
  const [optionDraft, setOptionDraft] = useState('')
  const scriptEditorRef = useRef<HTMLTextAreaElement | null>(null)
  const optionEditorRef = useRef<HTMLInputElement | null>(null)
  const shouldSaveScriptOnBlurRef = useRef(true)
  const shouldSaveOptionOnBlurRef = useRef(true)
  const canHaveOutgoingHandles = supportsOptions(nodeData.nodeType)
  const hasOptionHandles = canHaveOutgoingHandles && nodeData.options.length > 0
  const hasRegularSourceHandle = canHaveOutgoingHandles && nodeData.options.length === 0
  const directSourcePosition =
    nodeData.directSourcePosition === 'bottom' ? Position.Bottom : Position.Left
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
