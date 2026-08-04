import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import { css } from '@emotion/css';
import rehypeExternalLinks from 'rehype-external-links';
import remarkGfm from 'remark-gfm';

import { MobilePageHeader, Page, PageHeader } from '#components/Page';
import {
  markdownBaseStyles,
  remarkBreaks,
  sequentialNewlinesPlugin,
} from '#util/markdown';

import { QUERY_LANGUAGE_REFERENCE } from './queryLanguageReference';

const remarkPlugins = [sequentialNewlinesPlugin, remarkGfm, remarkBreaks];

const markdownStyles = css(markdownBaseStyles, {
  paddingRight: 20,
  '& table': {
    display: 'inline-table',
    ':not(:last-child)': {
      marginBottom: '0.75rem',
    },
  },
});

export function QueryReference() {
  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();

  return (
    <Page
      header={
        isNarrowWidth ? (
          <MobilePageHeader title={t('Query reference')} />
        ) : (
          <PageHeader title={t('Query reference')} />
        )
      }
    >
      <View style={{ padding: 20, maxWidth: 800, overflow: 'auto' }}>
        <Text className={markdownStyles}>
          <ReactMarkdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={[
              [
                rehypeExternalLinks,
                { target: '_blank', rel: ['noopener', 'noreferrer'] },
              ],
            ]}
          >
            {QUERY_LANGUAGE_REFERENCE}
          </ReactMarkdown>
        </Text>
      </View>
    </Page>
  );
}
