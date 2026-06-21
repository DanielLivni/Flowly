import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react'
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  SelectionMode,
  type Connection,
  type EdgeMouseHandler,
  type EdgeTypes,
  type IsValidConnection,
  type NodeMouseHandler,
  type NodeProps,
  type NodeTypes,
  type OnConnectEnd,
  type OnConnectStart,
  type ReactFlowInstance,
  type Viewport,
  type XYPosition,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  BulkActionsToolbar,
  ConnectionCreatePopover,
} from './components/canvas/CanvasOverlays'
import { DeletableDecisionEdge } from './components/edges/DeletableDecisionEdge'
import { DecisionTreeNode } from './components/nodes/DecisionTreeNode'
import {
  ScenarioPanel,
  ValidationPanel,
  YamlExportPanel,
  YamlImportPanel,
} from './components/panels/Panels'
import { EditorSidebar } from './components/sidebar/EditorSidebar'
import { TopToolbar } from './components/toolbar/TopToolbar'
import {
  DEFAULT_EDGE_STYLE,
  DIRECT_SOURCE_HANDLE_ID,
  initialScenarioMetadata,
  initialViewport,
  nodeLayoutHeight,
  nodeLayoutWidth,
  typeLabels,
} from './constants/flow'
import type {
  CanvasMode,
  DecisionAction,
  DecisionEdge,
  DecisionImage,
  DecisionLink,
  DecisionNode,
  DecisionNodeData,
  DecisionNodeType,
  DecisionOption,
  DecisionParameterUpdate,
  DecisionTool,
  EdgeStyle,
  ImportedFlow,
  PendingConnectionPopover,
  ScenarioMetadata,
  ValidationReport,
} from './types/flow'
import {
  canCreateOutgoingConnection,
  clampNumber,
  createDecisionEdge,
  createNodeData,
  getClientPositionFromEvent,
  getConnectionWithPreferredHandles,
  getDirectSourcePositionForNode,
  getNodeDataById,
  getNextStepId,
  getOptionEdgeLabel,
  getOutgoingEdgeForHandle,
  isDecisionConnectionValid,
  isDirectSourceHandle,
  isEditableElement,
  normalizeEdgesForNodes,
  normalizeNodeData,
  supportsOptions,
} from './utils/flowHelpers'
import { validateFlowForYamlExport } from './utils/validation'
import {
  createYamlExportText,
  getYamlDownloadFileName,
  parseYamlImportText,
} from './utils/yaml'
import './App.css'

const nodeTypes: NodeTypes = {
  decision: DecisionTreeNode as ComponentType<NodeProps>,
}

const edgeTypes: EdgeTypes = {
  deletable: DeletableDecisionEdge as EdgeTypes[string],
}

function App() {
  const reactFlowInstanceRef = useRef<ReactFlowInstance<DecisionNode, DecisionEdge> | null>(
    null,
  )
  const canvasPanelRef = useRef<HTMLElement | null>(null)
  const connectionStartRef = useRef<{
    sourceHandle: string
    sourceId: string
  } | null>(null)
  const shouldIgnoreNextPaneClickRef = useRef(false)
  const nextOptionNumber = useRef(1)
  const nextImageNumber = useRef(1)
  const nextLinkNumber = useRef(1)
  const nextParameterUpdateNumber = useRef(1)
  const nextActionNumber = useRef(1)
  const nextToolNumber = useRef(1)

  // מצב העורך נשמר בזיכרון בלבד. אין שמירת דפדפן בכוונה.
  const [scenarioMetadata, setScenarioMetadata] = useState<ScenarioMetadata>(
    initialScenarioMetadata,
  )
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('pan')
  const [edgeStyle, setEdgeStyle] = useState<EdgeStyle>(DEFAULT_EDGE_STYLE)
  const [editorViewport, setEditorViewport] = useState<Viewport>(initialViewport)
  const [isScenarioPanelOpen, setIsScenarioPanelOpen] = useState(false)
  const [isYamlImportPanelOpen, setIsYamlImportPanelOpen] = useState(false)
  const [isYamlExportPanelOpen, setIsYamlExportPanelOpen] = useState(false)
  const [isValidationPanelOpen, setIsValidationPanelOpen] = useState(false)
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(
    null,
  )
  const [yamlImportText, setYamlImportText] = useState('')
  const [yamlImportErrors, setYamlImportErrors] = useState<string[]>([])
  const [yamlImportFileName, setYamlImportFileName] = useState('')
  const [yamlCopyMessage, setYamlCopyMessage] = useState('')
  const [isDraftExport, setIsDraftExport] = useState(false)
  const [appMessage, setAppMessage] = useState('')
  const [pendingConnectionPopover, setPendingConnectionPopover] =
    useState<PendingConnectionPopover | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<DecisionNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<DecisionEdge>([])

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  )
  const selectedNodeData = useMemo(
    () => (selectedNode ? normalizeNodeData(selectedNode.data) : null),
    [selectedNode],
  )
  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  )
  const activeSelectedEdgeId = selectedEdge?.id ?? null
  const selectedNodeIds = useMemo(
    () => nodes.filter((node) => node.selected).map((node) => node.id),
    [nodes],
  )
  const selectedNodeCount = selectedNodeIds.length
  const targetCandidateNodes = useMemo(
    () =>
      nodes.filter(
        (node) =>
          node.id !== selectedNodeId && node.id !== scenarioMetadata.entryNodeId,
      ),
    [nodes, scenarioMetadata.entryNodeId, selectedNodeId],
  )
  const targetCandidateNodeIds = useMemo(
    () => targetCandidateNodes.map((node) => node.id),
    [targetCandidateNodes],
  )
  const isSelectionMode = canvasMode === 'select'
  const targetDatalistId = 'step-target-options'

  // אחראי על המרת התרשים הוויזואלי למבנה YAML שהסוכן יכול לקרוא.
  const generatedYamlText = useMemo(
    () =>
      createYamlExportText(
        scenarioMetadata,
        nodes,
        edges,
        editorViewport,
        edgeStyle,
        isDraftExport,
      ),
    [edgeStyle, edges, editorViewport, isDraftExport, nodes, scenarioMetadata],
  )
  const hasValidationErrors = Boolean(validationReport?.errors.length)
  const hasValidationWarnings = Boolean(validationReport?.warnings.length)

  const getCanvasPlacementFromClientPosition = useCallback(
    (clientPosition: XYPosition) => {
      const canvasBounds = canvasPanelRef.current?.getBoundingClientRect()
      const placementMargin = 36
      const clampedClientPosition = canvasBounds
        ? {
            x: clampNumber(
              clientPosition.x,
              canvasBounds.left + placementMargin,
              canvasBounds.right - placementMargin,
            ),
            y: clampNumber(
              clientPosition.y,
              canvasBounds.top + placementMargin,
              canvasBounds.bottom - placementMargin,
            ),
          }
        : clientPosition
      const flowPosition =
        reactFlowInstanceRef.current?.screenToFlowPosition(clampedClientPosition) ??
        (canvasBounds
          ? {
              x:
                (clampedClientPosition.x - canvasBounds.left - editorViewport.x) /
                editorViewport.zoom,
              y:
                (clampedClientPosition.y - canvasBounds.top - editorViewport.y) /
                editorViewport.zoom,
            }
          : {
              x: (clampedClientPosition.x - editorViewport.x) / editorViewport.zoom,
              y: (clampedClientPosition.y - editorViewport.y) / editorViewport.zoom,
            })

      return {
        nodePosition: {
          x: flowPosition.x - nodeLayoutWidth / 2,
          y: flowPosition.y - nodeLayoutHeight / 2,
        },
        popoverPosition: canvasBounds
          ? {
              x: clampNumber(
                clampedClientPosition.x - canvasBounds.left,
                126,
                canvasBounds.width - 126,
              ),
              y: clampNumber(
                clampedClientPosition.y - canvasBounds.top,
                16,
                canvasBounds.height - 230,
              ),
            }
          : clampedClientPosition,
      }
    },
    [editorViewport],
  )

  const getVisibleCanvasCenterPosition = useCallback(() => {
    const canvasBounds = canvasPanelRef.current?.getBoundingClientRect()

    return getCanvasPlacementFromClientPosition(
      canvasBounds
        ? {
            x: canvasBounds.left + canvasBounds.width / 2,
            y: canvasBounds.top + canvasBounds.height / 2,
          }
        : {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          },
    ).nodePosition
  }, [getCanvasPlacementFromClientPosition])

  const deleteEdgeById = useCallback(
    (edgeId: string) => {
      setEdges((currentEdges) => currentEdges.filter((edge) => edge.id !== edgeId))
      setSelectedEdgeId((currentSelectedEdgeId) =>
        currentSelectedEdgeId === edgeId ? null : currentSelectedEdgeId,
      )
    },
    [setEdges],
  )

  const toggleNodeMultiSelection = useCallback(
    (nodeId: string, isSelected: boolean) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId ? { ...node, selected: isSelected } : node,
        ),
      )
    },
    [setNodes],
  )

  const updateNodeScript = useCallback(
    (nodeId: string, script: string) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...normalizeNodeData(node.data),
                  script,
                },
              }
            : node,
        ),
      )
    },
    [setNodes],
  )

  const updateNodeOption = useCallback(
    (nodeId: string, optionId: string, label: string) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...normalizeNodeData(node.data),
                  options: normalizeNodeData(node.data).options.map((option) =>
                    option.id === optionId ? { ...option, label } : option,
                  ),
                },
              }
            : node,
        ),
      )
      setEdges((currentEdges) =>
        currentEdges.map((edge) =>
          edge.source === nodeId && edge.sourceHandle === optionId
            ? { ...edge, label: getOptionEdgeLabel(label) }
            : edge,
        ),
      )
    },
    [setEdges, setNodes],
  )

  const deleteNodeOption = useCallback(
    (nodeId: string, optionId: string) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...normalizeNodeData(node.data),
                  options: normalizeNodeData(node.data).options.filter(
                    (option) => option.id !== optionId,
                  ),
                },
              }
            : node,
        ),
      )
      setEdges((currentEdges) =>
        currentEdges.filter(
          (edge) => !(edge.source === nodeId && edge.sourceHandle === optionId),
        ),
      )
      setSelectedNodeId(nodeId)
      setSelectedEdgeId(null)
    },
    [setEdges, setNodes],
  )

  const addOptionToNode = useCallback(
    (nodeId: string) => {
      const newOption: DecisionOption = {
        id: `option-${nextOptionNumber.current}`,
        label: '',
      }

      nextOptionNumber.current += 1
      setSelectedNodeId(nodeId)
      setSelectedEdgeId(null)
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== nodeId) {
            return node
          }

          const nodeData = normalizeNodeData(node.data)

          if (!supportsOptions(nodeData.nodeType)) {
            return node
          }

          return {
            ...node,
            selected: true,
            data: {
              ...nodeData,
              options: [...nodeData.options, newOption],
            },
          }
        }),
      )
      setEdges((currentEdges) =>
        currentEdges.filter(
          (edge) =>
            edge.source !== nodeId || !isDirectSourceHandle(edge.sourceHandle),
        ),
      )
    },
    [setEdges, setNodes],
  )

  const deleteNodeById = useCallback(
    (nodeId: string) => {
      const shouldDelete = window.confirm(
        'למחוק את השלב הזה? כל החיבורים אליו וממנו יימחקו.',
      )

      if (!shouldDelete) {
        return
      }

      setNodes((currentNodes) =>
        currentNodes.filter((node) => node.id !== nodeId),
      )
      setEdges((currentEdges) =>
        currentEdges.filter(
          (edge) => edge.source !== nodeId && edge.target !== nodeId,
        ),
      )
      setSelectedNodeId((currentSelectedNodeId) =>
        currentSelectedNodeId === nodeId ? null : currentSelectedNodeId,
      )
      setSelectedEdgeId(null)

      if (scenarioMetadata.entryNodeId === nodeId) {
        setScenarioMetadata((currentMetadata) => ({
          ...currentMetadata,
          entryNodeId: '',
        }))
        setAppMessage('שלב הפתיחה נמחק. יש לבחור שלב פתיחה חדש.')
      }
    },
    [scenarioMetadata.entryNodeId, setEdges, setNodes],
  )

  // מוסיף לצמתים את callbacks והדגשות התצוגה בלי לזהם את מודל ה-YAML.
  const displayNodes = useMemo<DecisionNode[]>(
    () =>
      nodes.map((node) => {
        const nodeData = normalizeNodeData(node.data)
        const commonNodeData = {
          ...nodeData,
          directSourcePosition: getDirectSourcePositionForNode(node, nodes, edges),
          isEntryNode: node.id === scenarioMetadata.entryNodeId,
          isMultiSelected: Boolean(node.selected),
          onAddOption: addOptionToNode,
          onDeleteNode: deleteNodeById,
          onDeleteOption: deleteNodeOption,
          onOptionLabelChange: updateNodeOption,
          onScriptChange: updateNodeScript,
          onToggleMultiSelect: toggleNodeMultiSelection,
        }

        if (!selectedEdge) {
          return {
            ...node,
            data: commonNodeData,
          }
        }

        const edgeHighlightRole =
          selectedEdge.source === node.id
            ? 'source'
            : selectedEdge.target === node.id
              ? 'target'
              : undefined
        const highlightedOptionId =
          selectedEdge.source === node.id &&
          !isDirectSourceHandle(selectedEdge.sourceHandle)
            ? selectedEdge.sourceHandle
            : null

        return {
          ...node,
          data: {
            ...commonNodeData,
            edgeHighlightRole,
            highlightedOptionId,
          },
        }
      }),
    [
      addOptionToNode,
      deleteNodeById,
      deleteNodeOption,
      edges,
      nodes,
      scenarioMetadata.entryNodeId,
      selectedEdge,
      toggleNodeMultiSelection,
      updateNodeOption,
      updateNodeScript,
    ],
  )
  const displayEdges = useMemo<DecisionEdge[]>(
    () =>
      edges.map((edge) => {
        const isSelected = edge.id === activeSelectedEdgeId

        return {
          ...edge,
          selected: isSelected,
          animated: isSelected,
          className: isSelected
            ? 'decision-edge decision-edge--selected'
            : 'decision-edge',
          style: {
            stroke: isSelected ? '#1d4ed8' : '#64748b',
            strokeWidth: isSelected ? 4 : 2,
          },
          labelStyle: {
            fill: isSelected ? '#1d4ed8' : '#334155',
            fontWeight: isSelected ? 800 : 700,
          },
          labelBgStyle: {
            fill: isSelected ? '#eff6ff' : '#ffffff',
            stroke: isSelected ? '#93c5fd' : '#dbe3ef',
          },
          labelBgPadding: [8, 4],
          labelBgBorderRadius: 6,
          type: 'deletable',
          data: {
            ...(edge.data ?? {}),
            edgeStyle,
            onDelete: deleteEdgeById,
          },
        }
      }),
    [activeSelectedEdgeId, deleteEdgeById, edgeStyle, edges],
  )

  useEffect(() => {
    setEdges((currentEdges) =>
      normalizeEdgesForNodes(currentEdges, nodes, scenarioMetadata.entryNodeId),
    )
  }, [nodes, scenarioMetadata.entryNodeId, setEdges])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (nodes.length === 0) {
        return
      }

      event.preventDefault()
      event.returnValue = 'אם לא ייצאת YAML, העבודה תאבד.'
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [nodes.length])

  useEffect(() => {
    if (!pendingConnectionPopover) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('.connection-create-popover')
      ) {
        return
      }

      shouldIgnoreNextPaneClickRef.current = false
      setPendingConnectionPopover(null)
    }

    window.addEventListener('pointerdown', handlePointerDown)

    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [pendingConnectionPopover])

  const updateScenarioMetadata = useCallback(
    (metadataPatch: Partial<ScenarioMetadata>) => {
      setScenarioMetadata((currentMetadata) => ({
        ...currentMetadata,
        ...metadataPatch,
      }))
    },
    [],
  )

  const openYamlImportPanel = useCallback(() => {
    setYamlImportText('')
    setYamlImportErrors([])
    setYamlImportFileName('')
    setIsYamlImportPanelOpen(true)
  }, [])

  const applyImportedFlow = useCallback(
    (importedFlow: ImportedFlow) => {
      setNodes(importedFlow.nodes)
      setEdges(importedFlow.edges)
      setEdgeStyle(importedFlow.edgeStyle)
      setScenarioMetadata(importedFlow.scenarioMetadata)
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setValidationReport(null)
      setIsValidationPanelOpen(false)
      setIsYamlExportPanelOpen(false)
      setIsYamlImportPanelOpen(false)
      setYamlImportText('')
      setYamlImportErrors([])
      setYamlImportFileName('')
      setYamlCopyMessage('')
      setIsDraftExport(false)
      setPendingConnectionPopover(null)
      setAppMessage('התסריט יובא בהצלחה')

      nextOptionNumber.current = importedFlow.nextOptionNumber
      nextImageNumber.current = importedFlow.nextImageNumber
      nextLinkNumber.current = importedFlow.nextLinkNumber
      nextParameterUpdateNumber.current = importedFlow.nextParameterUpdateNumber
      nextActionNumber.current = importedFlow.nextActionNumber
      nextToolNumber.current = importedFlow.nextToolNumber

      window.requestAnimationFrame(() => {
        if (importedFlow.viewport) {
          setEditorViewport(importedFlow.viewport)
          void reactFlowInstanceRef.current?.setViewport(importedFlow.viewport, {
            duration: 0,
          })

          return
        }

        if (importedFlow.shouldFitView) {
          void reactFlowInstanceRef.current?.fitView({
            duration: 250,
            padding: 0.18,
          })
        }
      })
    },
    [setEdges, setNodes],
  )

  const importYamlText = useCallback(() => {
    const importResult = parseYamlImportText(yamlImportText)

    if (!importResult.flow) {
      setYamlImportErrors(importResult.errors)

      return
    }

    if (
      nodes.length > 0 &&
      !window.confirm('ייבוא הקובץ יחליף את התסריט הנוכחי. להמשיך?')
    ) {
      return
    }

    applyImportedFlow(importResult.flow)
  }, [applyImportedFlow, nodes.length, yamlImportText])

  const loadYamlImportFile = useCallback(
    async (file: File | undefined) => {
      if (!file) {
        return
      }

      try {
        const fileText = await file.text()

        setYamlImportText(fileText)
        setYamlImportFileName(file.name)
        setYamlImportErrors([])
      } catch {
        setYamlImportErrors(['לא ניתן לקרוא את הקובץ שנבחר.'])
      }
    },
    [],
  )

  const createNewScenario = useCallback(() => {
    const hasCurrentFlow = nodes.length > 0 || edges.length > 0

    if (
      hasCurrentFlow &&
      !window.confirm(
        'יצירת תסריט חדש תנקה את התסריט הנוכחי מהמסך. אם לא ייצאת YAML, העבודה תאבד. להמשיך?',
      )
    ) {
      return
    }

    setNodes([])
    setEdges([])
    setScenarioMetadata(initialScenarioMetadata)
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setValidationReport(null)
    setIsValidationPanelOpen(false)
    setIsYamlExportPanelOpen(false)
    setIsYamlImportPanelOpen(false)
    setYamlCopyMessage('')
    setIsDraftExport(false)
    setPendingConnectionPopover(null)
    setYamlImportErrors([])
    setYamlImportFileName('')
    setYamlImportText('')
    setAppMessage('נוצר תסריט חדש. יש לייצא YAML כדי לשמור את העבודה.')
    setEdgeStyle(DEFAULT_EDGE_STYLE)
    setEditorViewport(initialViewport)

    nextOptionNumber.current = 1
    nextImageNumber.current = 1
    nextLinkNumber.current = 1
    nextParameterUpdateNumber.current = 1
    nextActionNumber.current = 1
    nextToolNumber.current = 1

    void reactFlowInstanceRef.current?.setViewport(initialViewport, { duration: 250 })
  }, [edges.length, nodes.length, setEdges, setNodes])

  const openYamlExportPanelWithoutValidation = useCallback((exportAsDraft = false) => {
    setYamlCopyMessage('')
    setIsDraftExport(exportAsDraft)
    setValidationReport(null)
    setIsValidationPanelOpen(false)
    setIsYamlExportPanelOpen(true)
  }, [])

  const openYamlExportPanel = useCallback(() => {
    setIsDraftExport(false)
    const nextValidationReport = validateFlowForYamlExport(
      scenarioMetadata,
      nodes,
      edges,
    )
    const hasValidationMessages =
      nextValidationReport.errors.length > 0 ||
      nextValidationReport.warnings.length > 0

    if (hasValidationMessages) {
      setValidationReport(nextValidationReport)
      setIsYamlExportPanelOpen(false)
      setIsValidationPanelOpen(true)

      return
    }

    openYamlExportPanelWithoutValidation()
  }, [edges, nodes, openYamlExportPanelWithoutValidation, scenarioMetadata])

  const continueYamlExportAfterWarnings = useCallback(() => {
    openYamlExportPanelWithoutValidation(false)
  }, [openYamlExportPanelWithoutValidation])

  const continueYamlExportAsDraft = useCallback(() => {
    openYamlExportPanelWithoutValidation(true)
  }, [openYamlExportPanelWithoutValidation])

  const focusValidationStep = useCallback(
    (stepId: string) => {
      const node = nodes.find((currentNode) => currentNode.id === stepId)

      if (!node) {
        return
      }

      setSelectedNodeId(stepId)
      setSelectedEdgeId(null)
      setNodes((currentNodes) =>
        currentNodes.map((currentNode) => ({
          ...currentNode,
          selected: currentNode.id === stepId,
        })),
      )

      const nodeWidth = typeof node.width === 'number' ? node.width : 218
      const nodeHeight = typeof node.height === 'number' ? node.height : 140
      const viewport = reactFlowInstanceRef.current?.getViewport() ?? editorViewport

      void reactFlowInstanceRef.current?.setCenter(
        node.position.x + nodeWidth / 2,
        node.position.y + nodeHeight / 2,
        { zoom: viewport.zoom, duration: 350 },
      )
      setIsValidationPanelOpen(false)
    },
    [editorViewport, nodes, setNodes],
  )

  const copyGeneratedYaml = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generatedYamlText)
      setYamlCopyMessage('ה-YAML הועתק ללוח.')
    } catch {
      setYamlCopyMessage('לא ניתן להעתיק אוטומטית. אפשר לסמן ולהעתיק מהתצוגה.')
    }
  }, [generatedYamlText])

  const downloadGeneratedYaml = useCallback(() => {
    const blob = new Blob([generatedYamlText], {
      type: 'text/yaml;charset=utf-8',
    })
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = objectUrl
    link.download = getYamlDownloadFileName(scenarioMetadata)
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
  }, [generatedYamlText, scenarioMetadata])

  const updateEntryNodeId = useCallback((entryNodeId: string) => {
    setScenarioMetadata((currentMetadata) => ({
      ...currentMetadata,
      entryNodeId,
    }))
    setEdges((currentEdges) =>
      entryNodeId
        ? currentEdges.filter((edge) => edge.target !== entryNodeId)
        : currentEdges,
    )
    setAppMessage(
      entryNodeId
        ? 'שלב הפתיחה עודכן. חיבורים נכנסים לשלב זה הוסרו.'
        : 'יש לבחור שלב פתיחה חדש.',
    )
    setSelectedEdgeId(null)
  }, [setEdges])

  const handleNodeClick = useCallback<NodeMouseHandler<DecisionNode>>(
    (_event, node) => {
      setSelectedNodeId(node.id)
    },
    [],
  )

  const updateSelectedNodeId = useCallback(
    (id: string) => {
      if (selectedNodeId === null) {
        return
      }

      const previousId = selectedNodeId

      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === previousId ? { ...node, id } : node,
        ),
      )
      setEdges((currentEdges) =>
        currentEdges.map((edge) => ({
          ...edge,
          source: edge.source === previousId ? id : edge.source,
          target: edge.target === previousId ? id : edge.target,
        })),
      )
      setScenarioMetadata((currentMetadata) => ({
        ...currentMetadata,
        entryNodeId:
          currentMetadata.entryNodeId === previousId ? id : currentMetadata.entryNodeId,
      }))
      setSelectedNodeId(id)
    },
    [selectedNodeId, setEdges, setNodes],
  )

  const updateSelectedNodeDataBy = useCallback(
    (getNextData: (nodeData: DecisionNodeData) => DecisionNodeData) => {
      if (selectedNodeId === null) {
        return
      }

      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === selectedNodeId
            ? { ...node, data: getNextData(normalizeNodeData(node.data)) }
            : node,
        ),
      )
    },
    [selectedNodeId, setNodes],
  )

  const updateSelectedNodeData = useCallback(
    (dataPatch: Partial<DecisionNodeData>) => {
      updateSelectedNodeDataBy((nodeData) => ({ ...nodeData, ...dataPatch }))

      if (selectedNodeId !== null && dataPatch.nodeType === 'end') {
        setEdges((currentEdges) =>
          currentEdges.filter((edge) => edge.source !== selectedNodeId),
        )
      }
    },
    [selectedNodeId, setEdges, updateSelectedNodeDataBy],
  )

  const addSelectedNodeOption = useCallback(() => {
    if (selectedNodeId === null) {
      return
    }

    addOptionToNode(selectedNodeId)
  }, [addOptionToNode, selectedNodeId])

  const updateSelectedNodeOption = useCallback(
    (optionId: string, label: string) => {
      if (selectedNodeId !== null) {
        updateNodeOption(selectedNodeId, optionId, label)
      }
    },
    [selectedNodeId, updateNodeOption],
  )

  const deleteSelectedNodeOption = useCallback(
    (optionId: string) => {
      if (selectedNodeId !== null) {
        deleteNodeOption(selectedNodeId, optionId)
      }
    },
    [deleteNodeOption, selectedNodeId],
  )

  const addSelectedNodeImage = useCallback(() => {
    if (selectedNodeId === null) {
      return
    }

    const newImage: DecisionImage = {
      id: `image-${nextImageNumber.current}`,
      key: '',
      title: '',
    }
    nextImageNumber.current += 1

    updateSelectedNodeDataBy((nodeData) => ({
      ...nodeData,
      images: [...nodeData.images, newImage],
    }))
  }, [selectedNodeId, updateSelectedNodeDataBy])

  const updateSelectedNodeImage = useCallback(
    (imageId: string, imagePatch: Partial<DecisionImage>) => {
      updateSelectedNodeDataBy((nodeData) => ({
        ...nodeData,
        images: nodeData.images.map((image) =>
          image.id === imageId ? { ...image, ...imagePatch } : image,
        ),
      }))
    },
    [updateSelectedNodeDataBy],
  )

  const deleteSelectedNodeImage = useCallback(
    (imageId: string) => {
      updateSelectedNodeDataBy((nodeData) => ({
        ...nodeData,
        images: nodeData.images.filter((image) => image.id !== imageId),
      }))
    },
    [updateSelectedNodeDataBy],
  )

  const addSelectedNodeLink = useCallback(() => {
    if (selectedNodeId === null) {
      return
    }

    const newLink: DecisionLink = {
      id: `link-${nextLinkNumber.current}`,
      label: '',
      itemId: '',
    }
    nextLinkNumber.current += 1

    updateSelectedNodeDataBy((nodeData) => ({
      ...nodeData,
      links: [...nodeData.links, newLink],
    }))
  }, [selectedNodeId, updateSelectedNodeDataBy])

  const updateSelectedNodeLink = useCallback(
    (linkId: string, linkPatch: Partial<DecisionLink>) => {
      updateSelectedNodeDataBy((nodeData) => ({
        ...nodeData,
        links: nodeData.links.map((link) =>
          link.id === linkId ? { ...link, ...linkPatch } : link,
        ),
      }))
    },
    [updateSelectedNodeDataBy],
  )

  const deleteSelectedNodeLink = useCallback(
    (linkId: string) => {
      updateSelectedNodeDataBy((nodeData) => ({
        ...nodeData,
        links: nodeData.links.filter((link) => link.id !== linkId),
      }))
    },
    [updateSelectedNodeDataBy],
  )

  const addSelectedNodeParameterUpdate = useCallback(() => {
    if (selectedNodeId === null) {
      return
    }

    const newParameterUpdate: DecisionParameterUpdate = {
      id: `parameter-${nextParameterUpdateNumber.current}`,
      name: '',
      value: '',
    }
    nextParameterUpdateNumber.current += 1

    updateSelectedNodeDataBy((nodeData) => ({
      ...nodeData,
      parameterUpdates: [...nodeData.parameterUpdates, newParameterUpdate],
    }))
  }, [selectedNodeId, updateSelectedNodeDataBy])

  const updateSelectedNodeParameterUpdate = useCallback(
    (
      parameterUpdateId: string,
      parameterUpdatePatch: Partial<DecisionParameterUpdate>,
    ) => {
      updateSelectedNodeDataBy((nodeData) => ({
        ...nodeData,
        parameterUpdates: nodeData.parameterUpdates.map((parameterUpdate) =>
          parameterUpdate.id === parameterUpdateId
            ? { ...parameterUpdate, ...parameterUpdatePatch }
            : parameterUpdate,
        ),
      }))
    },
    [updateSelectedNodeDataBy],
  )

  const deleteSelectedNodeParameterUpdate = useCallback(
    (parameterUpdateId: string) => {
      updateSelectedNodeDataBy((nodeData) => ({
        ...nodeData,
        parameterUpdates: nodeData.parameterUpdates.filter(
          (parameterUpdate) => parameterUpdate.id !== parameterUpdateId,
        ),
      }))
    },
    [updateSelectedNodeDataBy],
  )

  const addSelectedNodeAction = useCallback(() => {
    if (selectedNodeId === null) {
      return
    }

    const newAction: DecisionAction = {
      id: `action-${nextActionNumber.current}`,
      name: '',
    }
    nextActionNumber.current += 1

    updateSelectedNodeDataBy((nodeData) => ({
      ...nodeData,
      actions: [...nodeData.actions, newAction],
    }))
  }, [selectedNodeId, updateSelectedNodeDataBy])

  const updateSelectedNodeAction = useCallback(
    (actionId: string, actionPatch: Partial<DecisionAction>) => {
      updateSelectedNodeDataBy((nodeData) => ({
        ...nodeData,
        actions: nodeData.actions.map((action) =>
          action.id === actionId ? { ...action, ...actionPatch } : action,
        ),
      }))
    },
    [updateSelectedNodeDataBy],
  )

  const deleteSelectedNodeAction = useCallback(
    (actionId: string) => {
      updateSelectedNodeDataBy((nodeData) => ({
        ...nodeData,
        actions: nodeData.actions.filter((action) => action.id !== actionId),
      }))
    },
    [updateSelectedNodeDataBy],
  )

  const addSelectedNodeTool = useCallback(() => {
    if (selectedNodeId === null) {
      return
    }

    const newTool: DecisionTool = {
      id: `tool-${nextToolNumber.current}`,
      name: '',
    }
    nextToolNumber.current += 1

    updateSelectedNodeDataBy((nodeData) => ({
      ...nodeData,
      tools: [...nodeData.tools, newTool],
    }))
  }, [selectedNodeId, updateSelectedNodeDataBy])

  const updateSelectedNodeTool = useCallback(
    (toolId: string, toolPatch: Partial<DecisionTool>) => {
      updateSelectedNodeDataBy((nodeData) => ({
        ...nodeData,
        tools: nodeData.tools.map((tool) =>
          tool.id === toolId ? { ...tool, ...toolPatch } : tool,
        ),
      }))
    },
    [updateSelectedNodeDataBy],
  )

  const deleteSelectedNodeTool = useCallback(
    (toolId: string) => {
      updateSelectedNodeDataBy((nodeData) => ({
        ...nodeData,
        tools: nodeData.tools.filter((tool) => tool.id !== toolId),
      }))
    },
    [updateSelectedNodeDataBy],
  )

  const isValidConnection = useCallback<IsValidConnection>(
    (connection) =>
      isDecisionConnectionValid(
        {
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle ?? null,
          targetHandle: connection.targetHandle ?? null,
        },
        nodes,
        edges,
        scenarioMetadata.entryNodeId,
      ),
    [edges, nodes, scenarioMetadata.entryNodeId],
  )

  const handleConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) => {
        if (
          !isDecisionConnectionValid(
            connection,
            nodes,
            currentEdges,
            scenarioMetadata.entryNodeId,
          )
        ) {
          return currentEdges
        }

        const sourceData = getNodeDataById(nodes, connection.source)

        if (!sourceData) {
          return currentEdges
        }

        const preferredConnection = getConnectionWithPreferredHandles(
          connection,
          nodes,
        )
        const newEdge = createDecisionEdge(preferredConnection, sourceData)

        return addEdge(newEdge, currentEdges)
      })
    },
    [nodes, scenarioMetadata.entryNodeId, setEdges],
  )

  const setOutgoingTarget = useCallback(
    (sourceId: string, sourceHandle: string, targetId: string) => {
      const trimmedTargetId = targetId.trim()

      setEdges((currentEdges) => {
        const edgesWithoutHandle = currentEdges.filter(
          (edge) =>
            edge.source !== sourceId ||
            (edge.sourceHandle ?? DIRECT_SOURCE_HANDLE_ID) !== sourceHandle,
        )

        if (!trimmedTargetId) {
          return edgesWithoutHandle
        }

        const connection: Connection = {
          source: sourceId,
          sourceHandle,
          target: trimmedTargetId,
          targetHandle: null,
        }

        if (
          !isDecisionConnectionValid(
            connection,
            nodes,
            edgesWithoutHandle,
            scenarioMetadata.entryNodeId,
          )
        ) {
          return currentEdges
        }

        const sourceData = getNodeDataById(nodes, sourceId)

        if (!sourceData) {
          return currentEdges
        }

        const preferredConnection = getConnectionWithPreferredHandles(
          connection,
          nodes,
        )

        return addEdge(
          createDecisionEdge(preferredConnection, sourceData),
          edgesWithoutHandle,
        )
      })
    },
    [nodes, scenarioMetadata.entryNodeId, setEdges],
  )

  const handleEdgeClick = useCallback<EdgeMouseHandler<DecisionEdge>>((_event, edge) => {
    setSelectedEdgeId(edge.id)
  }, [])

  const getSelectedNodeTargetForHandle = useCallback(
    (sourceHandle: string) =>
      selectedNode
        ? (getOutgoingEdgeForHandle(edges, selectedNode.id, sourceHandle)?.target ?? '')
        : '',
    [edges, selectedNode],
  )

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNode) {
      return
    }

    deleteNodeById(selectedNode.id)
  }, [deleteNodeById, selectedNode])

  const clearNodeSelection = useCallback(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.selected ? { ...node, selected: false } : node,
      ),
    )
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
  }, [setNodes])

  const deleteSelectedNodes = useCallback(() => {
    if (selectedNodeIds.length === 0) {
      return
    }

    const shouldDelete = window.confirm(
      'למחוק את השלבים שנבחרו? כל החיבורים אליהם ומהם יימחקו.',
    )

    if (!shouldDelete) {
      return
    }

    const deletedNodeIds = new Set(selectedNodeIds)

    setNodes((currentNodes) =>
      currentNodes.filter((node) => !deletedNodeIds.has(node.id)),
    )
    setEdges((currentEdges) =>
      currentEdges.filter(
        (edge) => !deletedNodeIds.has(edge.source) && !deletedNodeIds.has(edge.target),
      ),
    )
    setSelectedNodeId(null)
    setSelectedEdgeId(null)

    if (scenarioMetadata.entryNodeId && deletedNodeIds.has(scenarioMetadata.entryNodeId)) {
      setScenarioMetadata((currentMetadata) => ({
        ...currentMetadata,
        entryNodeId: '',
      }))
      setAppMessage('שלב הפתיחה נמחק. יש לבחור שלב פתיחה חדש.')
    }
  }, [scenarioMetadata.entryNodeId, selectedNodeIds, setEdges, setNodes])

  const duplicateSelectedNodes = useCallback(() => {
    if (selectedNodeIds.length === 0) {
      return
    }

    const selectedNodeIdSet = new Set(selectedNodeIds)
    const reservedNodeIds = new Set(nodes.map((node) => node.id))
    const nodeIdMap = new Map<string, string>()
    const optionIdMaps = new Map<string, Map<string, string>>()

    const duplicatedNodes: DecisionNode[] = nodes
      .filter((node) => selectedNodeIdSet.has(node.id))
      .map((node) => {
        const nodeData = normalizeNodeData(node.data)
        const nextNodeId = getNextStepId(reservedNodeIds)
        const optionIdMap = new Map<string, string>()
        const options = nodeData.options.map((option) => {
          const optionId = `option-${nextOptionNumber.current}`
          nextOptionNumber.current += 1
          optionIdMap.set(option.id, optionId)

          return {
            ...option,
            id: optionId,
          }
        })
        const images = nodeData.images.map((image) => {
          const imageId = `image-${nextImageNumber.current}`
          nextImageNumber.current += 1

          return {
            ...image,
            id: imageId,
          }
        })
        const links = nodeData.links.map((link) => {
          const linkId = `link-${nextLinkNumber.current}`
          nextLinkNumber.current += 1

          return {
            ...link,
            id: linkId,
          }
        })
        const parameterUpdates = nodeData.parameterUpdates.map((parameterUpdate) => {
          const parameterUpdateId = `parameter-${nextParameterUpdateNumber.current}`
          nextParameterUpdateNumber.current += 1

          return {
            ...parameterUpdate,
            id: parameterUpdateId,
          }
        })
        const actions = nodeData.actions.map((action) => {
          const actionId = `action-${nextActionNumber.current}`
          nextActionNumber.current += 1

          return {
            ...action,
            id: actionId,
          }
        })
        const tools = nodeData.tools.map((tool) => {
          const toolId = `tool-${nextToolNumber.current}`
          nextToolNumber.current += 1

          return {
            ...tool,
            id: toolId,
          }
        })

        nodeIdMap.set(node.id, nextNodeId)
        reservedNodeIds.add(nextNodeId)
        optionIdMaps.set(node.id, optionIdMap)

        return {
          ...node,
          id: nextNodeId,
          selected: true,
          position: {
            x: node.position.x + 280,
            y: node.position.y + 180,
          },
          data: {
            nodeType: nodeData.nodeType,
            script: nodeData.script,
            options,
            images,
            links,
            parameterUpdates,
            actions,
            tools,
          },
        }
      })

    const duplicatedDataById = new Map(
      duplicatedNodes.map((node) => [node.id, normalizeNodeData(node.data)]),
    )
    const duplicatedEdges = edges.flatMap((edge) => {
      const copiedSourceId = nodeIdMap.get(edge.source)
      const copiedTargetId = nodeIdMap.get(edge.target)

      if (!copiedSourceId || !copiedTargetId) {
        return []
      }

      const sourceHandle = edge.sourceHandle ?? DIRECT_SOURCE_HANDLE_ID
      const copiedSourceHandle = isDirectSourceHandle(sourceHandle)
        ? DIRECT_SOURCE_HANDLE_ID
        : optionIdMaps.get(edge.source)?.get(sourceHandle)

      if (!copiedSourceHandle) {
        return []
      }

      const copiedSourceData = duplicatedDataById.get(copiedSourceId)

      if (!copiedSourceData) {
        return []
      }

      return [
        createDecisionEdge(
          getConnectionWithPreferredHandles(
            {
              source: copiedSourceId,
              sourceHandle: copiedSourceHandle,
              target: copiedTargetId,
              targetHandle: edge.targetHandle ?? null,
            },
            duplicatedNodes,
          ),
          copiedSourceData,
        ),
      ]
    })

    setNodes((currentNodes) => [
      ...currentNodes.map((node) =>
        node.selected ? { ...node, selected: false } : node,
      ),
      ...duplicatedNodes,
    ])
    setEdges((currentEdges) => [...currentEdges, ...duplicatedEdges])
    setSelectedNodeId(duplicatedNodes[0]?.id ?? null)
    setSelectedEdgeId(null)
  }, [edges, nodes, selectedNodeIds, setEdges, setNodes])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !selectedNode ||
        isEditableElement(event.target) ||
        (event.key !== 'Delete' && event.key !== 'Backspace')
      ) {
        return
      }

      event.preventDefault()
      deleteSelectedNode()
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deleteSelectedNode, selectedNode])

  const createConnectedNodeFromPopover = useCallback(
    (nodeType: DecisionNodeType) => {
      if (!pendingConnectionPopover) {
        return
      }

      shouldIgnoreNextPaneClickRef.current = false

      if (
        !canCreateOutgoingConnection(
          pendingConnectionPopover.sourceId,
          pendingConnectionPopover.sourceHandle,
          nodes,
          edges,
        )
      ) {
        setPendingConnectionPopover(null)

        return
      }

      const id = getNextStepId(nodes.map((node) => node.id))
      const newNode: DecisionNode = {
        id,
        type: 'decision',
        position: pendingConnectionPopover.nodePosition,
        selected: true,
        data: createNodeData(nodeType),
      }
      const nextNodes = [
        ...nodes.map((node) =>
          node.selected ? { ...node, selected: false } : node,
        ),
        newNode,
      ]
      const sourceData = getNodeDataById(nodes, pendingConnectionPopover.sourceId)
      const connection: Connection = {
        source: pendingConnectionPopover.sourceId,
        sourceHandle: pendingConnectionPopover.sourceHandle,
        target: id,
        targetHandle: null,
      }

      if (
        !sourceData ||
        !isDecisionConnectionValid(
          connection,
          nextNodes,
          edges,
          scenarioMetadata.entryNodeId,
        )
      ) {
        setPendingConnectionPopover(null)

        return
      }

      const preferredConnection = getConnectionWithPreferredHandles(
        connection,
        nextNodes,
      )

      setNodes(nextNodes)
      setEdges(addEdge(createDecisionEdge(preferredConnection, sourceData), edges))
      setSelectedNodeId(id)
      setSelectedEdgeId(null)
      setPendingConnectionPopover(null)
    },
    [
      edges,
      nodes,
      pendingConnectionPopover,
      scenarioMetadata.entryNodeId,
      setEdges,
      setNodes,
    ],
  )

  const addNode = useCallback(
    (nodeType: DecisionNodeType) => {
      const basePosition = getVisibleCanvasCenterPosition()

      setNodes((currentNodes) => {
        const id = getNextStepId(currentNodes.map((node) => node.id))
        const offset = (currentNodes.length % 5) * 24

        const newNode: DecisionNode = {
          id,
          type: 'decision',
          position: {
            x: basePosition.x + offset,
            y: basePosition.y + offset,
          },
          data: createNodeData(nodeType),
        }

        return [...currentNodes, newNode]
      })
      setPendingConnectionPopover(null)
    },
    [getVisibleCanvasCenterPosition, setNodes],
  )

  const handleConnectStart = useCallback<OnConnectStart>((_event, params) => {
    if (params.handleType !== 'source' || !params.nodeId) {
      connectionStartRef.current = null

      return
    }

    connectionStartRef.current = {
      sourceId: params.nodeId,
      sourceHandle: params.handleId ?? DIRECT_SOURCE_HANDLE_ID,
    }
    setPendingConnectionPopover(null)
  }, [])

  const handleConnectEnd = useCallback<OnConnectEnd>(
    (event, connectionState) => {
      const connectionStart = connectionStartRef.current

      connectionStartRef.current = null

      if (
        !connectionStart ||
        connectionState.toNode !== null ||
        connectionState.toHandle !== null
      ) {
        return
      }

      if (
        !canCreateOutgoingConnection(
          connectionStart.sourceId,
          connectionStart.sourceHandle,
          nodes,
          edges,
        )
      ) {
        return
      }

      const clientPosition = getClientPositionFromEvent(event)

      if (!clientPosition) {
        return
      }

      shouldIgnoreNextPaneClickRef.current = true
      setSelectedEdgeId(null)
      setPendingConnectionPopover({
        ...connectionStart,
        ...getCanvasPlacementFromClientPosition(clientPosition),
      })
    },
    [edges, getCanvasPlacementFromClientPosition, nodes],
  )

  return (
    <main className="app-shell" dir="rtl">
      <TopToolbar
        canvasMode={canvasMode}
        edgeStyle={edgeStyle}
        onCanvasModeChange={setCanvasMode}
        onCreateNewScenario={createNewScenario}
        onOpenScenarioPanel={() => setIsScenarioPanelOpen(true)}
        onOpenYamlImportPanel={openYamlImportPanel}
        onOpenYamlExportPanel={openYamlExportPanel}
        onEdgeStyleChange={setEdgeStyle}
      />

      <div className="workspace-shell">
        <datalist id={targetDatalistId}>
          {targetCandidateNodes.map((node) => (
            <option key={node.id} value={node.id}>
              {`${node.id} - ${typeLabels[normalizeNodeData(node.data).nodeType]}`}
            </option>
          ))}
        </datalist>

        <EditorSidebar
          appMessage={appMessage}
          selectedNode={selectedNode}
          selectedNodeData={selectedNodeData}
          targetDatalistId={targetDatalistId}
          targetCandidateNodeIds={targetCandidateNodeIds}
          onAddNode={addNode}
          onUpdateSelectedNodeId={updateSelectedNodeId}
          onUpdateSelectedNodeData={updateSelectedNodeData}
          onAddSelectedNodeOption={addSelectedNodeOption}
          onUpdateSelectedNodeOption={updateSelectedNodeOption}
          onDeleteSelectedNodeOption={deleteSelectedNodeOption}
          onSetOutgoingTarget={setOutgoingTarget}
          getSelectedNodeTargetForHandle={getSelectedNodeTargetForHandle}
          onAddSelectedNodeImage={addSelectedNodeImage}
          onUpdateSelectedNodeImage={updateSelectedNodeImage}
          onDeleteSelectedNodeImage={deleteSelectedNodeImage}
          onAddSelectedNodeLink={addSelectedNodeLink}
          onUpdateSelectedNodeLink={updateSelectedNodeLink}
          onDeleteSelectedNodeLink={deleteSelectedNodeLink}
          onAddSelectedNodeParameterUpdate={addSelectedNodeParameterUpdate}
          onUpdateSelectedNodeParameterUpdate={updateSelectedNodeParameterUpdate}
          onDeleteSelectedNodeParameterUpdate={deleteSelectedNodeParameterUpdate}
          onAddSelectedNodeAction={addSelectedNodeAction}
          onUpdateSelectedNodeAction={updateSelectedNodeAction}
          onDeleteSelectedNodeAction={deleteSelectedNodeAction}
          onAddSelectedNodeTool={addSelectedNodeTool}
          onUpdateSelectedNodeTool={updateSelectedNodeTool}
          onDeleteSelectedNodeTool={deleteSelectedNodeTool}
          onDeleteSelectedNode={deleteSelectedNode}
        />

        <section
          ref={canvasPanelRef}
          className="canvas-panel"
          aria-label="קנבס עץ ההחלטות"
        >
          <ReactFlow<DecisionNode, DecisionEdge>
            nodes={displayNodes}
            edges={displayEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onConnectStart={handleConnectStart}
            onConnectEnd={handleConnectEnd}
            onInit={(reactFlowInstance) => {
              reactFlowInstanceRef.current = reactFlowInstance
              setEditorViewport(reactFlowInstance.getViewport())
            }}
            onMove={(_, viewport) => setEditorViewport(viewport)}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onPaneClick={() => {
              if (shouldIgnoreNextPaneClickRef.current) {
                shouldIgnoreNextPaneClickRef.current = false

                return
              }

              setSelectedNodeId(null)
              setSelectedEdgeId(null)
              setPendingConnectionPopover(null)
            }}
            isValidConnection={isValidConnection}
            edgesReconnectable={false}
            deleteKeyCode={null}
            selectionKeyCode={null}
            selectionOnDrag={isSelectionMode}
            selectionMode={SelectionMode.Partial}
            panActivationKeyCode={null}
            panOnDrag={!isSelectionMode}
            defaultViewport={initialViewport}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#c7d2fe" gap={28} variant={BackgroundVariant.Dots} />
            <Controls position="bottom-left" />
          </ReactFlow>

          {pendingConnectionPopover ? (
            <ConnectionCreatePopover
              pendingConnectionPopover={pendingConnectionPopover}
              onCreateConnectedNode={createConnectedNodeFromPopover}
              onCancel={() => {
                shouldIgnoreNextPaneClickRef.current = false
                setPendingConnectionPopover(null)
              }}
            />
          ) : null}

          <BulkActionsToolbar
            selectedNodeCount={selectedNodeCount}
            onDuplicateSelectedNodes={duplicateSelectedNodes}
            onDeleteSelectedNodes={deleteSelectedNodes}
            onClearNodeSelection={clearNodeSelection}
          />
        </section>
      </div>

      {isScenarioPanelOpen ? (
        <ScenarioPanel
          scenarioMetadata={scenarioMetadata}
          nodes={nodes}
          onClose={() => setIsScenarioPanelOpen(false)}
          onEntryNodeChange={updateEntryNodeId}
          onScenarioMetadataChange={updateScenarioMetadata}
        />
      ) : null}

      {isYamlImportPanelOpen ? (
        <YamlImportPanel
          yamlImportText={yamlImportText}
          yamlImportErrors={yamlImportErrors}
          yamlImportFileName={yamlImportFileName}
          onYamlImportTextChange={setYamlImportText}
          onYamlImportErrorsClear={() => setYamlImportErrors([])}
          onYamlFileLoad={(file) => {
            void loadYamlImportFile(file)
          }}
          onImportYaml={importYamlText}
          onClose={() => setIsYamlImportPanelOpen(false)}
        />
      ) : null}

      {isValidationPanelOpen && validationReport ? (
        <ValidationPanel
          validationReport={validationReport}
          hasValidationErrors={hasValidationErrors}
          hasValidationWarnings={hasValidationWarnings}
          onFocusValidationStep={focusValidationStep}
          onContinueYamlExportAfterWarnings={continueYamlExportAfterWarnings}
          onContinueYamlExportAsDraft={continueYamlExportAsDraft}
          onClose={() => setIsValidationPanelOpen(false)}
        />
      ) : null}

      {isYamlExportPanelOpen ? (
        <YamlExportPanel
          generatedYamlText={generatedYamlText}
          yamlCopyMessage={yamlCopyMessage}
          onCopyGeneratedYaml={() => {
            void copyGeneratedYaml()
          }}
          onDownloadGeneratedYaml={downloadGeneratedYaml}
          onClose={() => setIsYamlExportPanelOpen(false)}
        />
      ) : null}
    </main>
  )
}

export default App
