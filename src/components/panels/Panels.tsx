import { useState } from 'react'
import { typeLabels } from '../../constants/flow'
import type { DecisionNode, ScenarioMetadata, ValidationReport } from '../../types/flow'
import { normalizeNodeData } from '../../utils/flowHelpers'

type ScenarioPanelProps = {
  scenarioMetadata: ScenarioMetadata
  nodes: DecisionNode[]
  onClose: () => void
  onEntryNodeChange: (nodeId: string) => void
  onScenarioMetadataChange: (metadataPatch: Partial<ScenarioMetadata>) => void
}

type YamlImportPanelProps = {
  yamlImportText: string
  yamlImportErrors: string[]
  yamlImportFileName: string
  onYamlImportTextChange: (yamlText: string) => void
  onYamlImportErrorsClear: () => void
  onYamlFileLoad: (file: File | undefined) => void
  onImportYaml: () => void
  onClose: () => void
}

type ValidationPanelProps = {
  validationReport: ValidationReport
  hasValidationErrors: boolean
  hasValidationWarnings: boolean
  onFocusValidationStep: (stepId: string) => void
  onContinueYamlExportAfterWarnings: () => void
  onContinueYamlExportAsDraft: () => void
  onClose: () => void
}

type YamlExportPanelProps = {
  generatedYamlText: string
  yamlCopyMessage: string
  onCopyGeneratedYaml: () => void
  onDownloadGeneratedYaml: () => void
  onClose: () => void
}

function EntryNodeSelect({
  value,
  nodes,
  onEntryNodeChange,
}: {
  value: string
  nodes: DecisionNode[]
  onEntryNodeChange: (nodeId: string) => void
}) {
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

export function ScenarioPanel({
  scenarioMetadata,
  nodes,
  onClose,
  onEntryNodeChange,
  onScenarioMetadataChange,
}: ScenarioPanelProps) {
  return (
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
            onClick={onClose}
          >
            סגור
          </button>
        </div>

        <div className="scenario-panel__form">
          <section className="scenario-panel__field scenario-panel__field--wide">
            <EntryNodeSelect
              value={scenarioMetadata.entryNodeId}
              nodes={nodes}
              onEntryNodeChange={onEntryNodeChange}
            />
          </section>

          <label className="scenario-panel__field scenario-panel__field--wide">
            <span>תיאור כללי של התסריט ומה הוא בא לפתור</span>
            <textarea
              value={scenarioMetadata.scenarioDescription}
              dir="rtl"
              rows={4}
              onChange={(event) =>
                onScenarioMetadataChange({
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
                onScenarioMetadataChange({
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
                onScenarioMetadataChange({
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
                onScenarioMetadataChange({
                  searchoItemUrl: event.currentTarget.value,
                })
              }
            />
          </label>
        </div>
      </section>
    </div>
  )
}

export function YamlImportPanel({
  yamlImportText,
  yamlImportErrors,
  yamlImportFileName,
  onYamlImportTextChange,
  onYamlImportErrorsClear,
  onYamlFileLoad,
  onImportYaml,
  onClose,
}: YamlImportPanelProps) {
  return (
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
            onClick={onClose}
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
                onYamlImportTextChange(event.currentTarget.value)
                onYamlImportErrorsClear()
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
                onYamlFileLoad(event.currentTarget.files?.[0])
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
          <button type="button" onClick={onImportYaml}>
            ייבא YAML
          </button>
          <button type="button" onClick={onClose}>
            סגור
          </button>
        </div>
      </section>
    </div>
  )
}

export function ValidationPanel({
  validationReport,
  hasValidationErrors,
  hasValidationWarnings,
  onFocusValidationStep,
  onContinueYamlExportAfterWarnings,
  onContinueYamlExportAsDraft,
  onClose,
}: ValidationPanelProps) {
  return (
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
                        onClick={() => onFocusValidationStep(message.stepId ?? '')}
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
                        onClick={() => onFocusValidationStep(message.stepId ?? '')}
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
            <button type="button" onClick={onContinueYamlExportAsDraft}>
              ייצא כטיוטה למרות השגיאות
            </button>
          ) : null}
          {!hasValidationErrors && hasValidationWarnings ? (
            <button type="button" onClick={onContinueYamlExportAfterWarnings}>
              ייצא בכל זאת
            </button>
          ) : null}
          <button type="button" onClick={onClose}>
            חזור לעריכה
          </button>
        </div>
      </section>
    </div>
  )
}

export function YamlExportPanel({
  generatedYamlText,
  yamlCopyMessage,
  onCopyGeneratedYaml,
  onDownloadGeneratedYaml,
  onClose,
}: YamlExportPanelProps) {
  return (
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
          <button type="button" onClick={onCopyGeneratedYaml}>
            העתקה
          </button>
          <button type="button" onClick={onDownloadGeneratedYaml}>
            הורדת קובץ YAML
          </button>
          <button type="button" onClick={onClose}>
            סגור
          </button>
        </div>
      </section>
    </div>
  )
}
