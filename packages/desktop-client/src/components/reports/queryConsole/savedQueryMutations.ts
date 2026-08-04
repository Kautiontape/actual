import { useTranslation } from 'react-i18next';

import { sendCatch } from '@actual-app/core/platform/client/connection';
import type { send } from '@actual-app/core/platform/client/connection';
import type { SavedQueryEntity } from '@actual-app/core/types/models';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';

import { addNotification } from '#notifications/notificationsSlice';
import { useDispatch } from '#redux';
import type { AppDispatch } from '#redux/store';

import { savedQueryQueries } from './savedQueries';

const sendThrow: typeof send = async (name, args) => {
  const { error, data } = await sendCatch(name, args);
  if (error) {
    throw error;
  }
  return data;
};

function invalidate(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: savedQueryQueries.lists() });
}

function notifyError(dispatch: AppDispatch, message: string, error?: Error) {
  dispatch(
    addNotification({
      notification: {
        id: uuidv4(),
        type: 'error',
        message,
        pre: error ? error.message : undefined,
      },
    }),
  );
}

type CreatePayload = { name: string; folder: string; query: string };

export function useCreateSavedQueryMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (payload: CreatePayload) => {
      return await sendThrow('saved-query/create', payload);
    },
    onSuccess: () => invalidate(queryClient),
    onError: error => {
      notifyError(
        dispatch,
        t('There was an error saving the query. Please try again.'),
        error,
      );
    },
  });
}

export function useUpdateSavedQueryMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ query }: { query: SavedQueryEntity }) => {
      return await sendThrow('saved-query/update', query);
    },
    onSuccess: () => invalidate(queryClient),
    onError: error => {
      notifyError(
        dispatch,
        t('There was an error updating the query. Please try again.'),
        error,
      );
    },
  });
}

export function useDeleteSavedQueryMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ id }: { id: SavedQueryEntity['id'] }) => {
      return await sendThrow('saved-query/delete', id);
    },
    onSuccess: () => invalidate(queryClient),
    onError: error => {
      notifyError(
        dispatch,
        t('There was an error deleting the query. Please try again.'),
        error,
      );
    },
  });
}

export function useMoveSavedQueryFolderMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      return await sendThrow('saved-query/move-folder', { from, to });
    },
    onSuccess: () => invalidate(queryClient),
    onError: error => {
      notifyError(
        dispatch,
        t('There was an error moving the folder. Please try again.'),
        error,
      );
    },
  });
}
