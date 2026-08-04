import { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { Button } from '@actual-app/components/button';
import {
  SvgAdd,
  SvgBookmark,
  SvgDotsHorizontalTriple,
  SvgFileDouble,
  SvgFolderOutline,
  SvgPencilWrite,
  SvgSaveDisk,
  SvgTrash,
} from '@actual-app/components/icons/v1';
import { Input } from '@actual-app/components/input';
import { Menu } from '@actual-app/components/menu';
import { Popover } from '@actual-app/components/popover';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { normalizeFolder } from '@actual-app/core/shared/savedQueries';
import type { SavedQueryEntity } from '@actual-app/core/types/models';

import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

import { useSavedQueries } from './savedQueries';
import {
  useCreateSavedQueryMutation,
  useDeleteSavedQueryMutation,
  useUpdateSavedQueryMutation,
} from './savedQueryMutations';

type SavedQueriesBarProps = {
  text: string;
  onLoadText: (text: string) => void;
};

export function SavedQueriesBar({ text, onLoadText }: SavedQueriesBarProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { data: queries = [] } = useSavedQueries();

  const [openQuery, setOpenQuery] = useState<SavedQueryEntity | null>(null);
  // Baseline text used to compute the dirty flag. Initialized to the mount-time
  // editor text so a freshly-opened console is not considered "modified".
  const [savedText, setSavedText] = useState(text);
  const dirty = openQuery
    ? text !== savedText
    : text.trim() !== '' && text !== savedText;

  const nameTriggerRef = useRef(null);
  const overflowTriggerRef = useRef(null);
  const guardTriggerRef = useRef(null);

  const [overflowOpen, setOverflowOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [nameMode, setNameMode] = useState<'save-as' | 'rename'>('save-as');
  const [discardOpen, setDiscardOpen] = useState(false);

  const [nameValue, setNameValue] = useState('');
  const [folderValue, setFolderValue] = useState('');
  const [err, setErr] = useState('');
  const [pending, setPending] = useState<{ run: () => void } | null>(null);

  const createMutation = useCreateSavedQueryMutation();
  const updateMutation = useUpdateSavedQueryMutation();
  const deleteMutation = useDeleteSavedQueryMutation();

  const [searchParams, setSearchParams] = useSearchParams();

  // Load a query requested via ?open=<id> (deep link from the manager view).
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId) {
      return;
    }
    const found = queries.find(query => query.id === openId);
    if (found) {
      setOpenQuery(found);
      setSavedText(found.query);
      onLoadText(found.query);
      const next = new URLSearchParams(searchParams);
      next.delete('open');
      setSearchParams(next, { replace: true });
    }
  }, [queries, searchParams, onLoadText, setSearchParams]);

  function loadQuery(query: SavedQueryEntity) {
    setOpenQuery(query);
    setSavedText(query.query);
    onLoadText(query.query);
  }

  // "New query" starts from a blank editor. A blank buffer is not dirty until
  // the user types (see the untitled branch of `dirty`).
  function newQuery() {
    setOpenQuery(null);
    setSavedText('');
    onLoadText('');
  }

  function runPending() {
    const action = pending;
    setPending(null);
    if (action) {
      action.run();
    }
  }

  // If the editor has unsaved edits, confirm before replacing them.
  function guard(action: () => void) {
    if (dirty) {
      setPending({ run: action });
      setDiscardOpen(true);
    } else {
      action();
    }
  }

  function startSaveAs() {
    setNameMode('save-as');
    setNameValue(openQuery ? openQuery.name : '');
    setFolderValue(openQuery ? openQuery.folder : '');
    setErr('');
    setNameOpen(true);
  }

  function startRename() {
    if (!openQuery) {
      return;
    }
    setNameMode('rename');
    setNameValue(openQuery.name);
    setFolderValue(openQuery.folder);
    setErr('');
    setNameOpen(true);
  }

  function saveInPlace() {
    if (!openQuery) {
      startSaveAs();
      return;
    }
    updateMutation.mutate(
      { query: { ...openQuery, query: text } },
      {
        onSuccess: () => setSavedText(text),
        onError: error => setErr(error.message),
      },
    );
  }

  function submitName() {
    const name = nameValue.trim();
    const folder = normalizeFolder(folderValue);
    if (!name) {
      setErr(t('Please enter a name'));
      return;
    }

    if (nameMode === 'save-as') {
      createMutation.mutate(
        { name, folder, query: text },
        {
          onSuccess: id => {
            setOpenQuery({ id, name, folder, query: text });
            setSavedText(text);
            setNameOpen(false);
          },
          onError: error => setErr(error.message),
        },
      );
    } else if (openQuery) {
      updateMutation.mutate(
        { query: { ...openQuery, name, folder } },
        {
          onSuccess: () => {
            setOpenQuery({ ...openQuery, name, folder });
            setNameOpen(false);
          },
          onError: error => setErr(error.message),
        },
      );
    }
  }

  function openQueryPicker() {
    dispatch(
      pushModal({
        modal: {
          name: 'saved-queries-open',
          options: {
            queries,
            currentId: openQuery?.id ?? null,
            onSelect: query => guard(() => loadQuery(query)),
          },
        },
      }),
    );
  }

  function confirmDelete() {
    if (!openQuery) {
      return;
    }
    const query = openQuery;
    dispatch(
      pushModal({
        modal: {
          name: 'confirm-delete',
          options: {
            message: t(
              'Are you sure you want to delete the saved query "{{name}}"?',
              { name: query.name },
            ),
            onConfirm: () =>
              deleteMutation.mutate(
                { id: query.id },
                {
                  onSuccess: () => {
                    setOpenQuery(null);
                    setSavedText(text);
                  },
                },
              ),
          },
        },
      }),
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      {/* Current query label */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
          marginRight: 'auto',
        }}
      >
        {openQuery ? (
          <SvgBookmark
            width={12}
            height={12}
            style={{ color: theme.pageTextSubdued, flexShrink: 0 }}
          />
        ) : (
          <SvgFileDouble
            width={12}
            height={12}
            style={{ color: theme.pageTextSubdued, flexShrink: 0 }}
          />
        )}
        <Text
          style={{
            fontWeight: 600,
            maxWidth: 220,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {openQuery ? openQuery.name : <Trans>Unsaved query</Trans>}
        </Text>
        {dirty && (
          <Text
            style={{
              color: theme.pageTextSubdued,
              fontStyle: 'italic',
              flexShrink: 0,
            }}
          >
            <Trans>(modified)</Trans>
          </Text>
        )}
      </View>

      {/* Toolbar actions */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Button
          ref={guardTriggerRef}
          variant="primary"
          isDisabled={!dirty}
          onPress={saveInPlace}
        >
          <SvgSaveDisk width={11} height={11} style={{ marginRight: 5 }} />
          <Trans>Save</Trans>
        </Button>

        <Button variant="normal" onPress={() => guard(newQuery)}>
          <SvgAdd width={10} height={10} style={{ marginRight: 5 }} />
          <Trans>New</Trans>
        </Button>

        <Button variant="normal" onPress={() => guard(openQueryPicker)}>
          <SvgFolderOutline width={12} height={12} style={{ marginRight: 5 }} />
          <Trans>Open…</Trans>
        </Button>

        <Button ref={nameTriggerRef} variant="normal" onPress={startSaveAs}>
          <Trans>Save as new…</Trans>
        </Button>

        {/* Rename / Delete are only meaningful for an already-saved query */}
        {openQuery && (
          <>
            <Button
              ref={overflowTriggerRef}
              variant="bare"
              aria-label={t('More actions')}
              onPress={() => setOverflowOpen(true)}
              style={{ padding: 6 }}
            >
              <SvgDotsHorizontalTriple width={15} height={15} />
            </Button>
            <Popover
              triggerRef={overflowTriggerRef}
              isOpen={overflowOpen}
              onOpenChange={() => setOverflowOpen(false)}
              placement="bottom end"
              style={{ width: 180, margin: 1 }}
              isNonModal
            >
              <Menu
                items={[
                  {
                    name: 'rename',
                    text: t('Rename…'),
                    icon: SvgPencilWrite,
                  },
                  Menu.line,
                  { name: 'delete', text: t('Delete'), icon: SvgTrash },
                ]}
                onMenuSelect={name => {
                  setOverflowOpen(false);
                  switch (name) {
                    case 'rename':
                      startRename();
                      break;
                    case 'delete':
                      confirmDelete();
                      break;
                    default:
                      throw new Error(
                        `Unrecognized menu option: ${String(name)}`,
                      );
                  }
                }}
              />
            </Popover>
          </>
        )}
      </View>

      {/* Name + folder popover (Save-as / Rename) */}
      <Popover
        triggerRef={nameMode === 'rename' ? overflowTriggerRef : nameTriggerRef}
        isOpen={nameOpen}
        onOpenChange={() => setNameOpen(false)}
        placement="bottom end"
        style={{ width: 320, padding: 15 }}
      >
        <View style={{ gap: 10 }}>
          <Text style={{ fontWeight: 600 }}>
            {nameMode === 'save-as' ? (
              <Trans>Save query as</Trans>
            ) : (
              <Trans>Rename query</Trans>
            )}
          </Text>
          <Input
            placeholder={t('Name')}
            value={nameValue}
            onChangeValue={setNameValue}
            onEnter={submitName}
          />
          <Input
            placeholder={t('Folder (optional, e.g. Spending/2024)')}
            value={folderValue}
            onChangeValue={setFolderValue}
            onEnter={submitName}
          />
          {err && <Text style={{ color: theme.errorText }}>{err}</Text>}
          <View
            style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}
          >
            <Button onPress={() => setNameOpen(false)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button variant="primary" onPress={submitName}>
              <Trans>Save</Trans>
            </Button>
          </View>
        </View>
      </Popover>

      {/* Unsaved-changes guard */}
      <Popover
        triggerRef={guardTriggerRef}
        isOpen={discardOpen}
        onOpenChange={() => {
          setDiscardOpen(false);
          setPending(null);
        }}
        placement="bottom end"
        style={{ width: 300, padding: 15 }}
      >
        <View style={{ gap: 10 }}>
          <Text>
            <Trans>You have unsaved changes. What would you like to do?</Trans>
          </Text>
          <View
            style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}
          >
            <Button
              onPress={() => {
                setDiscardOpen(false);
                setPending(null);
              }}
            >
              <Trans>Cancel</Trans>
            </Button>
            <Button
              onPress={() => {
                setDiscardOpen(false);
                runPending();
              }}
            >
              <Trans>Discard</Trans>
            </Button>
            <Button
              variant="primary"
              isDisabled={!openQuery}
              onPress={() => {
                if (!openQuery) {
                  return;
                }
                updateMutation.mutate(
                  { query: { ...openQuery, query: text } },
                  {
                    onSuccess: () => {
                      setSavedText(text);
                      setDiscardOpen(false);
                      runPending();
                    },
                    onError: error => setErr(error.message),
                  },
                );
              }}
            >
              <Trans>Save</Trans>
            </Button>
          </View>
        </View>
      </Popover>
    </View>
  );
}
