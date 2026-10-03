import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { SvgCode } from '@actual-app/components/icons/v1';

import { useFeatureFlag } from '#hooks/useFeatureFlag';

import { NavRow } from './NavRow';
import { QuerySubRow } from './QuerySubRow';

// ktn: the Query Console entry for the redesigned sidebar, mirroring the classic
// sidebar's Query item and its Saved Queries / Reference sub-items.
export function QueryNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const queryConsoleEnabled = useFeatureFlag('queryConsole');

  if (!queryConsoleEnabled) {
    return null;
  }

  return (
    <>
      <NavRow title={t('Query')} Icon={SvgCode} to="/query" />
      {location.pathname.startsWith('/query') && (
        <>
          <QuerySubRow title={t('Saved Queries')} to="/query/saved" />
          <QuerySubRow title={t('Reference')} to="/query/docs" />
        </>
      )}
    </>
  );
}
