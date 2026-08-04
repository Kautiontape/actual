import { useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import {
  SvgArrowThinRight,
  SvgCopy,
  SvgDotsHorizontalTriple,
  SvgFolder,
  SvgPencilWrite,
  SvgTrash,
} from '@actual-app/components/icons/v1';
import { Input } from '@actual-app/components/input';
import { Menu } from '@actual-app/components/menu';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import {
  groupByFolder,
  normalizeFolder,
} from '@actual-app/core/shared/savedQueries';
import type { SavedQueryEntity } from '@actual-app/core/types/models';

import { MobilePageHeader, Page, PageHeader } from '#components/Page';
import { useContextMenu } from '#hooks/useContextMenu';
import { useNavigate } from '#hooks/useNavigate';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

import { useSavedQueries } from './savedQueries';
import {
  useCreateSavedQueryMutation,
  useDeleteSavedQueryMutation,
  useMoveSavedQueryFolderMutation,
  useUpdateSavedQueryMutation,
} from './savedQueryMutations';

type SavedQueryRowProps = {
  query: SavedQueryEntity;
  isFirst: boolean;
  onOpen: (query: SavedQueryEntity) => void;
  onRename: (query: SavedQueryEntity, name: string, folder: string) => void;
  onDuplicate: (query: SavedQueryEntity) => void;
  onDelete: (query: SavedQueryEntity) => void;
};

function SavedQueryRow({
  query,
  isFirst,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: SavedQueryRowProps) {
  const { t } = useTranslation();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(query.name);
  const [editFolder, setEditFolder] = useState(query.folder);

  const rowRef = useRef(null);

  function startEdit() {
    setEditName(query.name);
    setEditFolder(query.folder);
    setEditing(true);
  }

  const { handleContextMenu } = useContextMenu({
    triggerRef: rowRef,
    items: [
      {
        name: 'rename',
        text: t('Rename / Move…'),
        icon: SvgPencilWrite,
        onClick: startEdit,
      },
      {
        name: 'duplicate',
        text: t('Duplicate'),
        icon: SvgCopy,
        onClick: () => onDuplicate(query),
      },
      Menu.line,
      {
        name: 'delete',
        text: t('Delete'),
        icon: SvgTrash,
        onClick: () => onDelete(query),
      },
    ],
  });

  function commitEdit() {
    onRename(query, editName, editFolder);
    setEditing(false);
  }

  if (editing) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          borderTop: isFirst ? undefined : `1px solid ${theme.tableBorder}`,
        }}
      >
        <SvgPencilWrite
          width={13}
          height={13}
          style={{ color: theme.pageTextSubdued, flexShrink: 0 }}
        />
        <Input
          value={editName}
          onChangeValue={setEditName}
          onEnter={commitEdit}
          onEscape={() => setEditing(false)}
          placeholder={t('Name')}
          style={{ flex: 2 }}
          aria-label={t('Query name')}
        />
        <Input
          value={editFolder}
          onChangeValue={setEditFolder}
          onEnter={commitEdit}
          onEscape={() => setEditing(false)}
          placeholder={t('Folder (optional)')}
          style={{ flex: 1 }}
          aria-label={t('Folder')}
        />
        <Button variant="primary" onPress={commitEdit}>
          <Trans>Save</Trans>
        </Button>
        <Button variant="bare" onPress={() => setEditing(false)}>
          <Trans>Cancel</Trans>
        </Button>
      </View>
    );
  }

  return (
    <View
      ref={rowRef}
      style={{
        borderTop: isFirst ? undefined : `1px solid ${theme.tableBorder}`,
        '& .hover-visible': {
          opacity: 0,
          transition: 'opacity .15s',
        },
        '&:hover .hover-visible': {
          opacity: 1,
        },
        '&:hover': {
          backgroundColor: theme.tableRowBackgroundHover,
        },
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Button
          variant="bare"
          onPress={() => onOpen(query)}
          style={{
            flex: 1,
            minWidth: 0,
            justifyContent: 'flex-start',
            padding: '10px 12px',
            borderRadius: 0,
          }}
          aria-label={t('Open {{name}}', { name: query.name })}
        >
          <Text
            style={{
              flex: 1,
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textAlign: 'left',
            }}
          >
            {query.name}
          </Text>
          <SvgArrowThinRight
            className="hover-visible"
            width={11}
            height={11}
            style={{ color: theme.pageTextSubdued, marginLeft: 8 }}
          />
        </Button>

        <View
          className="hover-visible"
          style={{ paddingRight: 6, flexShrink: 0 }}
        >
          <Button
            variant="bare"
            aria-label={t('Actions for {{name}}', { name: query.name })}
            onPress={handleContextMenu}
            style={{ padding: 6 }}
          >
            <SvgDotsHorizontalTriple width={15} height={15} />
          </Button>
        </View>
      </View>
    </View>
  );
}

type SavedQueryFolderHeaderProps = {
  folder: string;
  count: number;
  onRenameFolder: (folder: string) => void;
};

function SavedQueryFolderHeader({
  folder,
  count,
  onRenameFolder,
}: SavedQueryFolderHeaderProps) {
  const { t } = useTranslation();

  const triggerRef = useRef(null);

  const isRoot = folder === '';

  const { handleContextMenu } = useContextMenu({
    triggerRef,
    enabled: !isRoot,
    items: [
      {
        name: 'rename-folder',
        text: t('Rename folder…'),
        icon: SvgPencilWrite,
        onClick: () => onRenameFolder(folder),
      },
    ],
  });

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: '4px 4px 8px 2px',
        '& .hover-visible': {
          opacity: 0,
          transition: 'opacity .15s',
        },
        '&:hover .hover-visible': {
          opacity: 1,
        },
      }}
    >
      <SvgFolder
        width={14}
        height={14}
        style={{ color: theme.pageTextSubdued, flexShrink: 0 }}
      />
      <Text
        style={{
          fontWeight: 600,
          color: isRoot ? theme.pageTextSubdued : theme.pageText,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {isRoot ? t('Ungrouped') : folder}
      </Text>
      <Text
        style={{
          fontSize: 12,
          color: theme.pageTextSubdued,
          backgroundColor: theme.tableRowBackgroundHover,
          borderRadius: 4,
          padding: '1px 6px',
          flexShrink: 0,
        }}
      >
        {count}
      </Text>

      {!isRoot && (
        <View className="hover-visible">
          <Button
            ref={triggerRef}
            variant="bare"
            aria-label={t('Folder actions for {{folder}}', { folder })}
            onPress={handleContextMenu}
            style={{ padding: 4 }}
          >
            <SvgDotsHorizontalTriple width={14} height={14} />
          </Button>
        </View>
      )}
    </View>
  );
}

export function SavedQueriesManager() {
  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { data: queries = [] } = useSavedQueries();

  const updateMutation = useUpdateSavedQueryMutation();
  const deleteMutation = useDeleteSavedQueryMutation();
  const createMutation = useCreateSavedQueryMutation();
  const moveFolderMutation = useMoveSavedQueryFolderMutation();

  function onOpen(query: SavedQueryEntity) {
    void navigate(`/query?open=${query.id}`);
  }

  function onRename(query: SavedQueryEntity, name: string, folder: string) {
    updateMutation.mutate({
      query: {
        ...query,
        name: name.trim() || query.name,
        folder: normalizeFolder(folder),
      },
    });
  }

  function onDuplicate(query: SavedQueryEntity) {
    createMutation.mutate({
      name: t('{{name}} copy', { name: query.name }),
      folder: query.folder,
      query: query.query,
    });
  }

  function onDelete(query: SavedQueryEntity) {
    dispatch(
      pushModal({
        modal: {
          name: 'confirm-delete',
          options: {
            message: t(
              'Are you sure you want to delete the saved query "{{name}}"?',
              { name: query.name },
            ),
            onConfirm: () => deleteMutation.mutate({ id: query.id }),
          },
        },
      }),
    );
  }

  function onRenameFolder(folder: string) {
    const next = window.prompt(t('Rename folder'), folder);
    if (next != null && normalizeFolder(next) !== folder) {
      moveFolderMutation.mutate({ from: folder, to: next });
    }
  }

  const groups = groupByFolder(queries);

  return (
    <Page
      header={
        isNarrowWidth ? (
          <MobilePageHeader title={t('Saved Queries')} />
        ) : (
          <PageHeader title={t('Saved Queries')} />
        )
      }
    >
      <View style={{ padding: 15, gap: 24, maxWidth: 800, width: '100%' }}>
        {groups.length === 0 ? (
          <View
            style={{
              alignItems: 'center',
              gap: 8,
              padding: '48px 15px',
              color: theme.pageTextSubdued,
            }}
          >
            <SvgFolder
              width={28}
              height={28}
              style={{ color: theme.pageTextSubdued, opacity: 0.6 }}
            />
            <Text style={{ fontWeight: 600, color: theme.pageText }}>
              <Trans>No saved queries yet</Trans>
            </Text>
            <Text style={{ textAlign: 'center', maxWidth: 360 }}>
              <Trans>
                Create one from the Query console with "Save as new" to see it
                here.
              </Trans>
            </Text>
          </View>
        ) : (
          groups.map(group => (
            <View key={group.folder || '__root__'}>
              <SavedQueryFolderHeader
                folder={group.folder}
                count={group.queries.length}
                onRenameFolder={onRenameFolder}
              />
              <View
                style={{
                  border: `1px solid ${theme.tableBorder}`,
                  borderRadius: 6,
                  overflow: 'hidden',
                  backgroundColor: theme.tableBackground,
                }}
              >
                {group.queries.map((query, index) => (
                  <SavedQueryRow
                    key={query.id}
                    query={query}
                    isFirst={index === 0}
                    onOpen={onOpen}
                    onRename={onRename}
                    onDuplicate={onDuplicate}
                    onDelete={onDelete}
                  />
                ))}
              </View>
            </View>
          ))
        )}
      </View>
    </Page>
  );
}
