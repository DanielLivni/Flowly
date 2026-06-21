import { DIRECT_SOURCE_HANDLE_ID } from '../constants/flow'
import type {
  DecisionEdge,
  DecisionNode,
  ScenarioMetadata,
  ValidationMessage,
  ValidationReport,
} from '../types/flow'
import { getOutgoingEdgeForHandle, normalizeNodeData } from './flowHelpers'

// בדיקות לפני ייצוא: מוודאות שהתסריט קריא ורציף לפני שהסוכן מקבל אותו.
export const validateFlowForYamlExport = (
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
