import { useMemo, useRef } from 'react';

import { theme } from '@actual-app/components/theme';
import { Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import type { ReactCodeMirrorProps } from '@uiw/react-codemirror';

import { autocompleteTabAcceptHighest } from '#components/codemirror/autocompleteTabAccept';
import { useTheme } from '#style/theme';

import { queryLanguageExtensions } from './codeMirror-queryLanguage';

type QueryEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function QueryEditor({ value, onChange, onSubmit }: QueryEditorProps) {
  const [activeTheme] = useTheme();
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const isDarkTheme = useMemo(() => {
    if (activeTheme === 'dark' || activeTheme === 'midnight') {
      return true;
    }
    if (activeTheme === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  }, [activeTheme]);

  const extensions = useMemo(
    () => [
      ...queryLanguageExtensions(isDarkTheme),
      EditorView.lineWrapping,
      // Cmd/Ctrl+Enter runs the query. Highest precedence so it wins even when
      // the autocomplete popup is open.
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              onSubmitRef.current();
              return true;
            },
          },
        ]),
      ),
      autocompleteTabAcceptHighest,
    ],
    [isDarkTheme],
  );

  const codeMirrorTheme: ReactCodeMirrorProps['theme'] = isDarkTheme
    ? 'dark'
    : 'light';

  return (
    <CodeMirror
      value={value}
      // Fill the (resizable) wrapper supplied by the parent; the editor scrolls
      // internally when the query is taller than the available space.
      height="100%"
      theme={codeMirrorTheme}
      extensions={extensions}
      onChange={onChange}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: true,
        highlightActiveLineGutter: false,
      }}
      style={{
        height: '100%',
        fontSize: '13px',
        border: `1px solid ${theme.tableBorder}`,
        borderRadius: 6,
        overflow: 'hidden',
      }}
    />
  );
}
