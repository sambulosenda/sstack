// Proves the lint rules in eslint.config.js that enforce three rules from AGENTS.md: no inline
// colours or size numbers, no hard-coded copy, and no wrapped library imported outside src/lib.
// The first probe is the mistake the review station was tested with: the home count card
// restyled with a red border, and a new button with its label typed in.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const root = fileURLToPath(new URL('../..', import.meta.url));
const eslint = new ESLint({ cwd: root });
const RULES = new Set(['no-restricted-syntax', 'no-restricted-imports']);

async function findings(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((message) => RULES.has(message.ruleId)).map((message) => message.message);
}

const reviewTestMistake = `
import { StyleSheet } from 'react-native';
import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export function Probe() {
  return (
    <>
      <AppButton label="Double it" testID="home-double" onPress={() => {}} />
      <ThemedText>Sessions today</ThemedText>
      <ThemedText>{'Well done'}</ThemedText>
    </>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderColor: '#ff0000', borderWidth: 2, marginTop: -8 },
});
`;

test('flags the inline colour, the size numbers and the typed-in copy', async () => {
  const found = await findings(reviewTestMistake, 'src/features/home/probe.tsx');
  assert.equal(found.filter((message) => message.startsWith('Inline colour')).length, 1);
  assert.equal(found.filter((message) => message.startsWith('Inline size')).length, 2);
  assert.equal(found.filter((message) => message.startsWith('Hard-coded copy')).length, 3);
  for (const message of found) assert.match(message, /src\/(constants\/theme|lib\/strings)\.ts/);
});

test('accepts the same screen written with tokens and strings', async () => {
  const fixed = `
import { StyleSheet } from 'react-native';
import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { strings } from '@/lib/strings';

export function Probe({ count }: { count: number }) {
  return (
    <>
      <AppButton label={strings.home.start} testID="home-start" onPress={() => {}} />
      <ThemedText accessibilityLabel={\`\${strings.home.todayCount} \${count}\`}>{count}</ThemedText>
    </>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, margin: 0, width: '100%', borderWidth: StyleSheet.hairlineWidth, flex: 1 },
});
`;
  assert.deepEqual(await findings(fixed, 'src/features/home/probe.tsx'), []);
});

test('allows scaling a token, and flags a number added to one', async () => {
  const code = `
const styles = {
  circle: { borderRadius: Circle.size / 2, width: \`\${fullness * 100}%\` },
  header: { paddingTop: insets.top + 8, height: compact ? 40 : Bar.height },
};
`;
  const found = await findings(code, 'src/features/home/probe.ts');
  assert.equal(found.length, 2);
  for (const message of found) assert.match(message, /^Inline size/);
});

test('ignores inline comments that try to turn the rules off', async () => {
  const code = `/* eslint no-restricted-syntax: "off" */
// eslint-disable-next-line no-restricted-syntax
export const card = { borderColor: '#ff0000' };
`;
  const found = await findings(code, 'src/features/home/probe.ts');
  assert.equal(found.length, 1);
  assert.match(found[0], /^Inline colour/);
});

const wrappedImports = `
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases from 'react-native-purchases';
import PostHog from 'posthog-react-native';
export { AsyncStorage, Purchases, PostHog };
`;

test('flags a wrapped library imported in a screen, and names the wrapper', async () => {
  const found = await findings(wrappedImports, 'src/features/home/probe.tsx');
  assert.equal(found.length, 3);
  assert.match(found.join('\n'), /@\/lib\/storage/);
  assert.match(found.join('\n'), /@\/lib\/purchases/);
  assert.match(found.join('\n'), /@\/lib\/analytics/);
});

test('allows the wrapped libraries in src/lib and in tests', async () => {
  assert.deepEqual(await findings(wrappedImports, 'src/lib/probe.ts'), []);
  assert.deepEqual(await findings(wrappedImports, 'src/features/home/probe.test.ts'), []);
});

test('allows colours and sizes in the theme file, where the tokens live', async () => {
  const theme = `export const Card = { borderColor: '#ff0000', borderWidth: 2 };`;
  assert.deepEqual(await findings(theme, 'src/constants/theme.ts'), []);
});
