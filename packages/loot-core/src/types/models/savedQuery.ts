export type SavedQueryEntity = {
  id: string;
  name: string;
  // Virtual folder path; '' means the root (no folder).
  folder: string;
  // The query-language source text.
  query: string;
  tombstone?: boolean;
};
