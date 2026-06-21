import {
  canvasModeHelperText,
  canvasModeLabels,
  edgeStyleLabels,
} from '../../constants/flow'
import type { CanvasMode, EdgeStyle } from '../../types/flow'

type TopToolbarProps = {
  canvasMode: CanvasMode
  edgeStyle: EdgeStyle
  onCanvasModeChange: (mode: CanvasMode) => void
  onCreateNewScenario: () => void
  onOpenScenarioPanel: () => void
  onOpenYamlImportPanel: () => void
  onOpenYamlExportPanel: () => void
  onEdgeStyleChange: (edgeStyle: EdgeStyle) => void
}

export function TopToolbar({
  canvasMode,
  edgeStyle,
  onCanvasModeChange,
  onCreateNewScenario,
  onOpenScenarioPanel,
  onOpenYamlImportPanel,
  onOpenYamlExportPanel,
  onEdgeStyleChange,
}: TopToolbarProps) {
  return (
    <header className="top-toolbar">
      <p className="top-toolbar__autosave-notice">
        אין שמירה אוטומטית — יש לייצא YAML כדי לשמור את העבודה
      </p>
      <button
        type="button"
        className="top-toolbar__button"
        onClick={onCreateNewScenario}
      >
        תסריט חדש
      </button>
      <button
        type="button"
        className="top-toolbar__button"
        onClick={onOpenScenarioPanel}
      >
        פרטי תסריט
      </button>
      <button
        type="button"
        className="top-toolbar__button"
        onClick={onOpenYamlImportPanel}
      >
        ייבוא YAML
      </button>
      <button
        type="button"
        className="top-toolbar__button"
        onClick={onOpenYamlExportPanel}
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
            onClick={() => onCanvasModeChange(mode)}
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
          onChange={(event) => onEdgeStyleChange(event.currentTarget.value as EdgeStyle)}
        >
          {(Object.keys(edgeStyleLabels) as EdgeStyle[]).map((styleKey) => (
            <option key={styleKey} value={styleKey}>
              {edgeStyleLabels[styleKey]}
            </option>
          ))}
        </select>
      </label>
    </header>
  )
}
