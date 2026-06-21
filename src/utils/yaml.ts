import type { Viewport } from '@xyflow/react'
import dagre from 'dagre'
import { parse, stringify } from 'yaml'
import {
  DEFAULT_EDGE_STYLE,
  DIRECT_SOURCE_HANDLE_ID,
  nodeLayoutHeight,
  nodeLayoutWidth,
} from '../constants/flow'
import type {
  DecisionAction,
  DecisionEdge,
  DecisionImage,
  DecisionLink,
  DecisionNode,
  DecisionParameterUpdate,
  DecisionTool,
  EdgeStyle,
  ImportedFlow,
  ImportedStep,
  ImportedStepOption,
  ScenarioMetadata,
  YamlExport,
  YamlExportOption,
  YamlExportStep,
} from '../types/flow'
import {
  createDecisionEdge,
  getConnectionWithPreferredHandles,
  getNextStepIds,
  getOutgoingEdgeForHandle,
  getPreviousStepIds,
  getStringValue,
  isDecisionNodeType,
  isRecord,
  normalizeNodeData,
} from './flowHelpers'

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

const createAutoLayoutPositions = (
  steps: ImportedStep[],
  edges: Array<Pick<DecisionEdge, 'source' | 'target'>>,
) => {
  const graph = new dagre.graphlib.Graph()

  graph.setGraph({
    marginx: 80,
    marginy: 80,
    nodesep: 80,
    rankdir: 'LR',
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
              : 80 + fallbackColumn * 280,
          y:
            typeof layoutNode?.y === 'number'
              ? layoutNode.y - nodeLayoutHeight / 2
              : 80 + fallbackRow * 180,
        },
      ]
    }),
  )
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
    hasEditorSection: true,
    positions,
    viewport: getViewportFromUnknown(editorValue.viewport),
  }
}

// אחראי על המרת YAML חיצוני למודל החזותי של React Flow.
export const parseYamlImportText = (yamlText: string) => {
  const errors: string[] = []

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

    if (!isDecisionNodeType(stepType)) {
      errors.push(
        `בשלב ${stepId || stepIndex + 1}, type חייב להיות אחד מסוגי השלבים הנתמכים.`,
      )
    }

    if (typeof script !== 'string') {
      errors.push(`בשלב ${stepId || stepIndex + 1}, חסר script תקין.`)
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

    const options: ImportedStepOption[] = []

    if (stepValue.options !== undefined) {
      if (!Array.isArray(stepValue.options)) {
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

    if (stepId && isDecisionNodeType(stepType) && typeof script === 'string') {
      importedSteps.push({
        id: stepId,
        actions,
        images,
        links,
        next: getStringValue(stepValue.next),
        nodeType: stepType,
        options,
        parameterUpdates,
        script,
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
    if (step.nodeType === 'end') {
      return
    }

    if (step.options.length > 0) {
      step.options.forEach((option, optionIndex) => {
        if (option.next && !stepIds.has(option.next)) {
          errors.push(
            `בשלב ${step.id}, אפשרות ${optionIndex + 1} מצביעה לשלב שלא קיים: ${option.next}.`,
          )
        }
      })

      return
    }

    if (step.next && !stepIds.has(step.next)) {
      errors.push(`בשלב ${step.id}, next מצביע לשלב שלא קיים: ${step.next}.`)
    }
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
  const edgeDrafts = importedSteps.flatMap((step) => {
    if (step.nodeType === 'end') {
      return []
    }

    if (step.options.length > 0) {
      return step.options.flatMap((option) =>
        option.next ? [{ source: step.id, target: option.next }] : [],
      )
    }

    return step.next ? [{ source: step.id, target: step.next }] : []
  })
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
    if (step.nodeType === 'end') {
      return []
    }

    const sourceData = importedNodeDataById.get(step.id)

    if (!sourceData) {
      return []
    }

    if (step.options.length > 0) {
      return step.options.flatMap((option, optionIndex) => {
        if (!option.next) {
          return []
        }

        return [
          createDecisionEdge(
            getConnectionWithPreferredHandles(
              {
                source: step.id,
                sourceHandle: `option-${optionIndex + 1}`,
                target: option.next,
                targetHandle: null,
              },
              nodes,
            ),
            sourceData,
          ),
        ]
      })
    }

    if (!step.next) {
      return []
    }

    return [
      createDecisionEdge(
        getConnectionWithPreferredHandles(
          {
            source: step.id,
            sourceHandle: DIRECT_SOURCE_HANDLE_ID,
            target: step.next,
            targetHandle: null,
          },
          nodes,
        ),
        sourceData,
      ),
    ]
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

  return {
    errors: [],
    flow: {
      edges,
      nextActionNumber: maxActionCount + 1,
      nextImageNumber: maxImageCount + 1,
      nextLinkNumber: maxLinkCount + 1,
      nextOptionNumber: maxOptionCount + 1,
      nextParameterUpdateNumber: maxParameterUpdateCount + 1,
      nextToolNumber: maxToolCount + 1,
      nodes,
      edgeStyle: importedEditorLayout.edgeStyle,
      scenarioMetadata,
      shouldFitView: !importedEditorLayout.hasEditorSection,
      viewport: importedEditorLayout.viewport,
    } satisfies ImportedFlow,
  }
}

export const buildYamlExport = (
  scenarioMetadata: ScenarioMetadata,
  nodes: DecisionNode[],
  edges: DecisionEdge[],
  viewport: Viewport,
  edgeStyle: EdgeStyle,
  includeDraftSection = false,
): YamlExport => {
  const exportEdges = scenarioMetadata.entryNodeId
    ? edges.filter((edge) => edge.target !== scenarioMetadata.entryNodeId)
    : edges

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
        script: nodeData.script,
        navigation: {
          previousStepIds: getPreviousStepIds(node.id, exportEdges),
          nextStepIds: getNextStepIds(node.id, exportEdges),
        },
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

export const createYamlExportText = (
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

export const getYamlDownloadFileName = (scenarioMetadata: ScenarioMetadata) => {
  const baseFileName = sanitizeYamlFileName(
    scenarioMetadata.searchoItemName || scenarioMetadata.glassixKnowledgeItemName,
  )

  return `${baseFileName || 'decision-flow'}.yaml`
}
