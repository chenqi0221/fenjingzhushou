import type { NodeTypes } from '@xyflow/react';

import { GroupNode } from './GroupNode';
import { ImageEditNode } from './ImageEditNode';
import { ImageNode } from './ImageNode';
import { SmartStoryboardNode } from './SmartStoryboardNode';
import { ScriptMasterNode } from './ScriptMasterNode';
import { StoryboardGenNode } from './StoryboardGenNode';
import { StoryboardNode } from './StoryboardNode';
import { TextAnnotationNode } from './TextAnnotationNode';
import { UploadNode } from './UploadNode';

export const nodeTypes: NodeTypes = {
  exportImageNode: ImageNode,
  groupNode: GroupNode,
  imageNode: ImageEditNode,
  smartStoryboardNode: SmartStoryboardNode,
  scriptMasterNode: ScriptMasterNode,
  storyboardGenNode: StoryboardGenNode,
  storyboardNode: StoryboardNode,
  textAnnotationNode: TextAnnotationNode,
  uploadNode: UploadNode,
};

export { GroupNode, ImageEditNode, ImageNode, SmartStoryboardNode, ScriptMasterNode, StoryboardGenNode, StoryboardNode, TextAnnotationNode, UploadNode };
