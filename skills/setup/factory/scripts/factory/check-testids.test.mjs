import assert from 'node:assert/strict';
import { test } from 'node:test';

import { findMissing, flowIds, sourceIds } from './check-testids.mjs';

test('reads ids from a Maestro flow in every form they are written', () => {
  const flow = `
appId: \${MAESTRO_APP_ID}
---
- tapOn:
    id: "settings-upgrade"
- assertVisible:
    id: 'paywall-screen'
- extendedWaitUntil:
    visible:
      id: home-screen   # comment
- tapOn: "Settings"
`;
  assert.deepEqual([...flowIds(flow)].sort(), ['home-screen', 'paywall-screen', 'settings-upgrade']);
});

test('skips ids that are regular expressions', () => {
  assert.deepEqual([...flowIds('- tapOn:\n    id: "paywall-plan-.*"\n')], []);
});

test('reads literal testIDs from source', () => {
  const source = `
<View testID="home-screen" />
<AppButton testID='home-reset' />
<Text testID={'home-counter-value'} />
<NativeTabs.Trigger name="index" testID="tab-home">
<Pressable testID={\`paywall-plan-\${plan.id}\`} />
`;
  assert.deepEqual([...sourceIds(source)].sort(), [
    'home-counter-value',
    'home-reset',
    'home-screen',
    'tab-home',
  ]);
});

test('reports the flow and the id when a testID is gone', () => {
  const flows = [['.maestro/paywall.yaml', '- tapOn:\n    id: "paywall-close"\n- tapOn:\n    id: "gone"\n']];
  const sources = ['<AppButton testID="paywall-close" />'];
  assert.deepEqual(findMissing(flows, sources), [{ file: '.maestro/paywall.yaml', id: 'gone' }]);
});

test('passes when every id exists', () => {
  const flows = [['a.yaml', '- tapOn:\n    id: "a"\n']];
  assert.deepEqual(findMissing(flows, ['testID="a"']), []);
});

test('a comment that mentions testID does not hide the ids after it (issue 07)', () => {
  // The comment that hid home-pattern-box and home-length-1 from this check.
  const source = `
/**
 * Each written as a \`testID:\` literal, the form that scripts/factory/check-testids.mjs
 * recognises, so a Maestro flow can use them and the check still finds them.
 */
const PatternButtons = {
  box: { testID: 'home-pattern-box' },
  relax: { testID: 'home-pattern-relax' },
};`;
  assert.deepEqual([...sourceIds(source)].sort(), ['home-pattern-box', 'home-pattern-relax']);
});

test('a testID that is commented out does not count as existing', () => {
  const source = `
// <AppButton testID="home-old" />
{/* <View testID="home-older" /> */}
<View testID="home-live" />`;
  assert.deepEqual([...sourceIds(source)], ['home-live']);
});

test('a URL in a string is not taken for a comment', () => {
  const source = `const help = 'https://example.com/help'; <View testID="home-help" />`;
  assert.deepEqual([...sourceIds(source)], ['home-help']);
});
