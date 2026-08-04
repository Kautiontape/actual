import { Fragment, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import {
  SvgCheveronDown,
  SvgCheveronRight,
} from '@actual-app/components/icons/v1';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { SavedQueryEntity } from '@actual-app/core/types/models';

import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import type { Modal as ModalType } from '#modals/modalsSlice';

type SavedQueriesModalProps = Extract<
  ModalType,
  { name: 'saved-queries-open' }
>['options'];

type TreeNode = {
  name: string;
  path: string;
  folders: TreeNode[];
  queries: SavedQueryEntity[];
};

// Build a nested folder tree from the flat, path-based `folder` values
// (e.g. "Spending/2024"). Root queries live on the top-level node.
function buildTree(queries: SavedQueryEntity[]): TreeNode {
  const root: TreeNode = { name: '', path: '', folders: [], queries: [] };
  for (const query of queries) {
    const segments = (query.folder ?? '').split('/').filter(Boolean);
    let node = root;
    let path = '';
    for (const segment of segments) {
      path = path ? `${path}/${segment}` : segment;
      let child = node.folders.find(folder => folder.name === segment);
      if (!child) {
        child = { name: segment, path, folders: [], queries: [] };
        node.folders.push(child);
      }
      node = child;
    }
    node.queries.push(query);
  }

  const cmp = (a: string, b: string) =>
    a.localeCompare(b, undefined, { ignorePunctuation: true });
  const sortNode = (node: TreeNode) => {
    node.folders.sort((a, b) => cmp(a.name, b.name));
    node.queries.sort((a, b) => cmp(a.name, b.name));
    node.folders.forEach(sortNode);
  };
  sortNode(root);
  return root;
}

export function SavedQueriesModal({
  queries,
  onSelect,
  currentId,
}: SavedQueriesModalProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const tree = buildTree(queries);

  function toggle(path: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function renderNode(node: TreeNode, depth: number, close: () => void) {
    return (
      <>
        {node.folders.map(folder => {
          const isCollapsed = collapsed.has(folder.path);
          const Chevron = isCollapsed ? SvgCheveronRight : SvgCheveronDown;
          return (
            <Fragment key={`folder:${folder.path}`}>
              <Button
                variant="bare"
                onPress={() => toggle(folder.path)}
                style={{
                  justifyContent: 'flex-start',
                  width: '100%',
                  paddingLeft: 12 + depth * 16,
                  paddingTop: 6,
                  paddingBottom: 6,
                }}
              >
                <Chevron
                  width={14}
                  height={14}
                  style={{ marginRight: 4, flexShrink: 0 }}
                />
                <Text style={{ fontWeight: 600 }}>{folder.name}</Text>
              </Button>
              {!isCollapsed && renderNode(folder, depth + 1, close)}
            </Fragment>
          );
        })}
        {node.queries.map(query => (
          <Button
            key={`query:${query.id}`}
            variant="bare"
            onPress={() => {
              onSelect(query);
              close();
            }}
            style={{
              justifyContent: 'flex-start',
              width: '100%',
              paddingLeft: 12 + depth * 16 + 18,
              paddingTop: 6,
              paddingBottom: 6,
              color: query.id === currentId ? theme.pageTextLink : undefined,
              fontWeight: query.id === currentId ? 600 : undefined,
            }}
          >
            <Text>{query.name}</Text>
          </Button>
        ))}
      </>
    );
  }

  return (
    <Modal name="saved-queries-open">
      {({ state }) => (
        <>
          <ModalHeader
            title={t('Open query')}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View style={{ minWidth: 360, maxHeight: 420, overflow: 'auto' }}>
            {queries.length === 0 ? (
              <Text style={{ color: theme.pageTextSubdued, padding: 12 }}>
                <Trans>No saved queries yet.</Trans>
              </Text>
            ) : (
              renderNode(tree, 0, () => state.close())
            )}
          </View>
        </>
      )}
    </Modal>
  );
}
