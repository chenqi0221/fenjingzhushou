import {
  isExportImageNode,
  isImageEditNode,
  isSmartStoryboardNode,
  isScriptMasterNode,
  isUploadNode,
  isStoryboardSplitNode,
  type CanvasEdge,
  type CanvasNode,
} from '../domain/canvasNodes';
import type { GraphImageResolver } from './ports';

export class DefaultGraphImageResolver implements GraphImageResolver {
  collectInputImages(nodeId: string, nodes: CanvasNode[], edges: CanvasEdge[]): string[] {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const allImages: string[] = [];

    const sourceNodeIds = edges
      .filter((edge) => edge.target === nodeId)
      .map((edge) => edge.source);

    for (const sourceId of sourceNodeIds) {
      const sourceNode = nodeById.get(sourceId);
      const images = this.extractImages(sourceNode, nodeById, edges);
      allImages.push(...images);
    }

    return [...new Set(allImages)];
  }

  private extractImages(
    node: CanvasNode | undefined,
    nodeById: Map<string, CanvasNode>,
    edges: CanvasEdge[]
  ): string[] {
    if (!node) {
      return [];
    }

    if (isUploadNode(node) || isImageEditNode(node) || isExportImageNode(node)) {
      return node.data.imageUrl ? [node.data.imageUrl] : [];
    }

    if (isStoryboardSplitNode(node)) {
      const images = node.data.frames
        .map((frame) => frame.imageUrl)
        .filter((url): url is string => url !== null && url !== undefined);
      return images;
    }

    if (isSmartStoryboardNode(node) || isScriptMasterNode(node)) {
      const upstreamImages = this.collectInputImages(node.id, Array.from(nodeById.values()), edges);
      return upstreamImages;
    }

    return [];
  }
}
