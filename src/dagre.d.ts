declare module 'dagre' {
  type DagreNode = {
    height: number
    width: number
    x: number
    y: number
  }

  class Graph {
    setDefaultEdgeLabel(getLabel: () => Record<string, never>): this
    setEdge(source: string, target: string): this
    setGraph(label: Record<string, unknown>): this
    setNode(id: string, label: { height: number; width: number }): this
    node(id: string): DagreNode | undefined
  }

  const dagre: {
    graphlib: {
      Graph: typeof Graph
    }
    layout(graph: Graph): void
  }

  export default dagre
}
