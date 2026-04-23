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
      .map((edge) => edge.source)
      .sort(); // 按节点 ID 排序，确保顺序稳定

    for (const sourceId of sourceNodeIds) {
      const sourceNode = nodeById.get(sourceId);
      const images = this.extractImages(sourceNode, nodeById, edges);
      allImages.push(...images);
    }

    // 去重但保持顺序
    const seen = new Set<string>();
    return allImages.filter((image) => {
      if (seen.has(image)) {
        return false;
      }
      seen.add(image);
      return true;
    });
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
