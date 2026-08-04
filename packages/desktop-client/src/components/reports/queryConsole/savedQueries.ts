import { send } from '@actual-app/core/platform/client/connection';
import type { SavedQueryEntity } from '@actual-app/core/types/models';
import { queryOptions, useQuery } from '@tanstack/react-query';

export const savedQueryQueries = {
  all: () => ['savedQueries'],
  lists: () => [...savedQueryQueries.all(), 'lists'],
  list: () =>
    queryOptions<SavedQueryEntity[]>({
      queryKey: [...savedQueryQueries.lists()],
      queryFn: async () => {
        return await send('saved-query/get');
      },
    }),
};

export function useSavedQueries() {
  return useQuery(savedQueryQueries.list());
}
