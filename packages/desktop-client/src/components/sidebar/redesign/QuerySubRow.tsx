import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { radius, spacing } from '@actual-app/components/tokens';
import { View } from '@actual-app/components/view';

import { Link } from '#components/common/Link';

// ktn: an icon-less Query Console sub-item. Indented so the label lines up with
// the NavRow labels (padding + icon + gap).
const SUB_ROW_INDENT = spacing.sm + 15 + spacing.sm;

type QuerySubRowProps = {
  title: string;
  to: string;
};

export function QuerySubRow({ title, to }: QuerySubRowProps) {
  return (
    <View style={{ flexShrink: 0 }}>
      <Link
        variant="internal"
        to={to}
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          paddingBlock: spacing.xs,
          paddingRight: spacing.sm,
          paddingLeft: SUB_ROW_INDENT,
          borderRadius: radius.sm,
          marginBottom: 1,
          fontSize: 12,
          textDecoration: 'none',
          color: theme.sidebarItemText,
          ':hover': { backgroundColor: theme.sidebarItemBackgroundHover },
        }}
        activeStyle={{
          color: theme.sidebarItemTextSelected,
          fontWeight: 600,
        }}
      >
        <Text style={styles.ellipsisText}>{title}</Text>
      </Link>
    </View>
  );
}
