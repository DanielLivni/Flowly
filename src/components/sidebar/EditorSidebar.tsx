import { DIRECT_SOURCE_HANDLE_ID, sidebarActions, typeLabels } from '../../constants/flow'
import type {
  DecisionAction,
  DecisionImage,
  DecisionLink,
  DecisionNode,
  DecisionNodeData,
  DecisionNodeType,
  DecisionParameterUpdate,
  DecisionTool,
} from '../../types/flow'
import { supportsOptions } from '../../utils/flowHelpers'

type EditorSidebarProps = {
  appMessage: string
  selectedNode: DecisionNode | null
  selectedNodeData: DecisionNodeData | null
  targetDatalistId: string
  targetCandidateNodeIds: string[]
  onAddNode: (nodeType: DecisionNodeType) => void
  onUpdateSelectedNodeId: (id: string) => void
  onUpdateSelectedNodeData: (dataPatch: Partial<DecisionNodeData>) => void
  onAddSelectedNodeOption: () => void
  onUpdateSelectedNodeOption: (optionId: string, label: string) => void
  onDeleteSelectedNodeOption: (optionId: string) => void
  onSetOutgoingTarget: (
    sourceId: string,
    sourceHandle: string,
    targetId: string,
  ) => void
  getSelectedNodeTargetForHandle: (sourceHandle: string) => string
  onAddSelectedNodeImage: () => void
  onUpdateSelectedNodeImage: (
    imageId: string,
    imagePatch: Partial<DecisionImage>,
  ) => void
  onDeleteSelectedNodeImage: (imageId: string) => void
  onAddSelectedNodeLink: () => void
  onUpdateSelectedNodeLink: (linkId: string, linkPatch: Partial<DecisionLink>) => void
  onDeleteSelectedNodeLink: (linkId: string) => void
  onAddSelectedNodeParameterUpdate: () => void
  onUpdateSelectedNodeParameterUpdate: (
    parameterUpdateId: string,
    parameterUpdatePatch: Partial<DecisionParameterUpdate>,
  ) => void
  onDeleteSelectedNodeParameterUpdate: (parameterUpdateId: string) => void
  onAddSelectedNodeAction: () => void
  onUpdateSelectedNodeAction: (
    actionId: string,
    actionPatch: Partial<DecisionAction>,
  ) => void
  onDeleteSelectedNodeAction: (actionId: string) => void
  onAddSelectedNodeTool: () => void
  onUpdateSelectedNodeTool: (toolId: string, toolPatch: Partial<DecisionTool>) => void
  onDeleteSelectedNodeTool: (toolId: string) => void
  onDeleteSelectedNode: () => void
}

function StepTargetInput({
  label,
  value,
  datalistId,
  candidateNodeIds,
  onTargetChange,
}: {
  label: string
  value: string
  datalistId: string
  candidateNodeIds: string[]
  onTargetChange: (targetId: string) => void
}) {
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

export function EditorSidebar({
  appMessage,
  selectedNode,
  selectedNodeData,
  targetDatalistId,
  targetCandidateNodeIds,
  onAddNode,
  onUpdateSelectedNodeId,
  onUpdateSelectedNodeData,
  onAddSelectedNodeOption,
  onUpdateSelectedNodeOption,
  onDeleteSelectedNodeOption,
  onSetOutgoingTarget,
  getSelectedNodeTargetForHandle,
  onAddSelectedNodeImage,
  onUpdateSelectedNodeImage,
  onDeleteSelectedNodeImage,
  onAddSelectedNodeLink,
  onUpdateSelectedNodeLink,
  onDeleteSelectedNodeLink,
  onAddSelectedNodeParameterUpdate,
  onUpdateSelectedNodeParameterUpdate,
  onDeleteSelectedNodeParameterUpdate,
  onAddSelectedNodeAction,
  onUpdateSelectedNodeAction,
  onDeleteSelectedNodeAction,
  onAddSelectedNodeTool,
  onUpdateSelectedNodeTool,
  onDeleteSelectedNodeTool,
  onDeleteSelectedNode,
}: EditorSidebarProps) {
  return (
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
            onClick={() => onAddNode(action.nodeType)}
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
                      onUpdateSelectedNodeId(event.currentTarget.value)
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
                      onUpdateSelectedNodeData({
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
                      onUpdateSelectedNodeData({ script: event.currentTarget.value })
                    }
                  />
                </label>
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
                    onClick={onAddSelectedNodeOption}
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
                              onUpdateSelectedNodeOption(
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
                            onSetOutgoingTarget(selectedNode.id, option.id, targetId)
                          }
                        />
                      </div>
                      <button
                        type="button"
                        className="collection-editor__delete-button"
                        onClick={() => onDeleteSelectedNodeOption(option.id)}
                      >
                        מחק
                      </button>
                    </div>
                  ))}

                  {selectedNodeData.options.length === 0 ? (
                    <p className="collection-editor__empty">אין אפשרויות עדיין</p>
                  ) : null}

                  {selectedNodeData.options.length === 0 ? (
                    <section className="target-editor" aria-label="שלב הבא">
                      <h4>שלב הבא</h4>
                      <StepTargetInput
                        label="שלב הבא"
                        value={getSelectedNodeTargetForHandle(DIRECT_SOURCE_HANDLE_ID)}
                        datalistId={targetDatalistId}
                        candidateNodeIds={targetCandidateNodeIds}
                        onTargetChange={(targetId) =>
                          onSetOutgoingTarget(
                            selectedNode.id,
                            DIRECT_SOURCE_HANDLE_ID,
                            targetId,
                          )
                        }
                      />
                    </section>
                  ) : null}
                </div>
              </section>
            ) : null}

            <section
              className="properties-panel__section"
              aria-label="עדכון פרמטרים"
            >
              <div className="properties-panel__section-header">
                <h3>עדכון פרמטרים</h3>
                <button
                  type="button"
                  className="collection-editor__add-button"
                  onClick={onAddSelectedNodeParameterUpdate}
                >
                  הוסף פרמטר
                </button>
              </div>

              <div className="collection-editor__list properties-panel__section-body">
                {selectedNodeData.parameterUpdates.map(
                  (parameterUpdate, parameterUpdateIndex) => (
                    <div key={parameterUpdate.id} className="collection-editor__row">
                      <div className="collection-editor__fields">
                        <label className="collection-editor__field">
                          <span>{`פרמטר ${parameterUpdateIndex + 1}: שם פרמטר`}</span>
                          <input
                            type="text"
                            value={parameterUpdate.name}
                            dir="rtl"
                            className="properties-panel__control"
                            onChange={(event) =>
                              onUpdateSelectedNodeParameterUpdate(parameterUpdate.id, {
                                name: event.currentTarget.value,
                              })
                            }
                          />
                        </label>

                        <label className="collection-editor__field">
                          <span>ערך פרמטר</span>
                          <input
                            type="text"
                            value={parameterUpdate.value}
                            dir="rtl"
                            className="properties-panel__control"
                            onChange={(event) =>
                              onUpdateSelectedNodeParameterUpdate(parameterUpdate.id, {
                                value: event.currentTarget.value,
                              })
                            }
                          />
                        </label>
                      </div>

                      <button
                        type="button"
                        className="collection-editor__delete-button"
                        onClick={() =>
                          onDeleteSelectedNodeParameterUpdate(parameterUpdate.id)
                        }
                      >
                        מחק
                      </button>
                    </div>
                  ),
                )}

                {selectedNodeData.parameterUpdates.length === 0 ? (
                  <p className="collection-editor__empty">אין עדכוני פרמטרים עדיין</p>
                ) : null}
              </div>
            </section>

            <section
              className="properties-panel__section"
              aria-label="יציאה ל-ACTION"
            >
              <div className="properties-panel__section-header">
                <h3>יציאה ל-ACTION</h3>
                <button
                  type="button"
                  className="collection-editor__add-button"
                  onClick={onAddSelectedNodeAction}
                >
                  הוסף ACTION
                </button>
              </div>

              <div className="collection-editor__list properties-panel__section-body">
                {selectedNodeData.actions.map((action, actionIndex) => (
                  <div key={action.id} className="collection-editor__row">
                    <div className="collection-editor__fields">
                      <label className="collection-editor__field">
                        <span>{`ACTION ${actionIndex + 1}: שם פעולה`}</span>
                        <input
                          type="text"
                          value={action.name}
                          dir="rtl"
                          className="properties-panel__control"
                          onChange={(event) =>
                            onUpdateSelectedNodeAction(action.id, {
                              name: event.currentTarget.value,
                            })
                          }
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      className="collection-editor__delete-button"
                      onClick={() => onDeleteSelectedNodeAction(action.id)}
                    >
                      מחק
                    </button>
                  </div>
                ))}

                {selectedNodeData.actions.length === 0 ? (
                  <p className="collection-editor__empty">אין פעולות עדיין</p>
                ) : null}
              </div>
            </section>

            <section className="properties-panel__section" aria-label="יציאה לכלי">
              <div className="properties-panel__section-header">
                <h3>יציאה לכלי</h3>
                <button
                  type="button"
                  className="collection-editor__add-button"
                  onClick={onAddSelectedNodeTool}
                >
                  הוסף כלי
                </button>
              </div>

              <div className="collection-editor__list properties-panel__section-body">
                {selectedNodeData.tools.map((tool, toolIndex) => (
                  <div key={tool.id} className="collection-editor__row">
                    <div className="collection-editor__fields">
                      <label className="collection-editor__field">
                        <span>{`כלי ${toolIndex + 1}: שם כלי`}</span>
                        <input
                          type="text"
                          value={tool.name}
                          dir="rtl"
                          className="properties-panel__control"
                          onChange={(event) =>
                            onUpdateSelectedNodeTool(tool.id, {
                              name: event.currentTarget.value,
                            })
                          }
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      className="collection-editor__delete-button"
                      onClick={() => onDeleteSelectedNodeTool(tool.id)}
                    >
                      מחק
                    </button>
                  </div>
                ))}

                {selectedNodeData.tools.length === 0 ? (
                  <p className="collection-editor__empty">אין כלים עדיין</p>
                ) : null}
              </div>
            </section>

            <section className="properties-panel__section" aria-label="תמונות">
              <div className="properties-panel__section-header">
                <h3>תמונות</h3>
                <button
                  type="button"
                  className="collection-editor__add-button"
                  onClick={onAddSelectedNodeImage}
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
                            onUpdateSelectedNodeImage(image.id, {
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
                            onUpdateSelectedNodeImage(image.id, {
                              title: event.currentTarget.value,
                            })
                          }
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      className="collection-editor__delete-button"
                      onClick={() => onDeleteSelectedNodeImage(image.id)}
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
                  onClick={onAddSelectedNodeLink}
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
                            onUpdateSelectedNodeLink(link.id, {
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
                            onUpdateSelectedNodeLink(link.id, {
                              itemId: event.currentTarget.value,
                            })
                          }
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      className="collection-editor__delete-button"
                      onClick={() => onDeleteSelectedNodeLink(link.id)}
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

            <section className="properties-panel__section" aria-label="פעולות שלב">
              <h3>פעולות שלב</h3>
              <button
                type="button"
                className="delete-step-button"
                onClick={onDeleteSelectedNode}
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
  )
}
