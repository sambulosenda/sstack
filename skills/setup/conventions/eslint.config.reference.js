// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const tests = ['**/*.test.ts', '**/*.test.tsx'];

// Files from the Expo template that broke the token and copy rules before the rules existed.
// When you fix one, take it off this list. Never add one: fix the code instead.
// scripts/factory/check-guardrails.mjs fails an agent pull request that changes, renames or
// adds an ESLint config file.
const writtenBeforeTheRules = [
  'src/components/animated-icon.tsx',
  'src/components/animated-icon.web.tsx',
  'src/components/app-tabs.web.tsx',
  'src/components/themed-text.tsx',
];

const SIZE_KEYS = [
  'fontSize|lineHeight|letterSpacing',
  '(padding|margin)(Top|Bottom|Left|Right|Horizontal|Vertical|Start|End)?',
  'gap|rowGap|columnGap',
  'width|height|minWidth|minHeight|maxWidth|maxHeight',
  'top|bottom|left|right|start|end|inset',
  'border(Top|Bottom|Left|Right|Start|End)?Width',
  'border(TopLeft|TopRight|BottomLeft|BottomRight|TopStart|TopEnd|BottomStart|BottomEnd)?Radius',
].join('|');
// Any number but zero.
const NUMBER = '/^[0-9.]*[1-9][0-9.]*$/';
const USER_FACING_PROPS ='accessibilityLabel|accessibilityHint|label|title|placeholder|alt';

const COLOUR =
  'Inline colour. Use a colour from src/constants/theme.ts (useTheme() or Colors), or add a token there.';
const SIZE =
  'Inline size or spacing number. Use a token from src/constants/theme.ts (Spacing, MinTouchTarget and the rest) or a ThemedText type for font sizes, or add a named token there.';
const COPY = 'Hard-coded copy. Add the text to src/lib/strings.ts and use it from there.';

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // Comments cannot turn rules off, however they are spelled. Fix the code instead.
    linterOptions: { noInlineConfig: true },
  },
  {
    // AGENTS.md: screens call the wrappers in src/lib, never the libraries. Tests may import
    // them to stub the mocks.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/lib/**', ...tests],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@react-native-async-storage/async-storage',
              message: 'Use the wrapper in @/lib/storage (add a key to StorageKeys first). Only src/lib may import AsyncStorage.',
            },
            {
              name: 'react-native-purchases',
              message: 'Use the wrapper in @/lib/purchases. Only src/lib may import react-native-purchases.',
            },
            {
              name: 'posthog-react-native',
              message: 'Use the wrapper in @/lib/analytics (add the event to AnalyticsEvent first). Only src/lib may import posthog-react-native.',
            },
          ],
        },
      ],
    },
  },
  {
    // AGENTS.md: no inline colours, font sizes or spacing numbers, and all user-facing copy
    // lives in src/lib/strings.ts. Zero, percentages and plain flex or opacity values are fine.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/constants/theme.ts', ...writtenBeforeTheRules, ...tests],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'Literal[value=/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]', message: COLOUR },
        { selector: 'Literal[value=/^(rgb|hsl)a?\\(/]', message: COLOUR },
        { selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]', message: COLOUR },
        // A number as the value, negated or in a ternary, or added to a token. Multiplying or
        // dividing a token (Circle.size / 2, fullness * 100) scales it and is fine.
        { selector: `Property[key.name=/^(${SIZE_KEYS})$/] > Literal[raw=${NUMBER}]`, message: SIZE },
        { selector: `Property[key.name=/^(${SIZE_KEYS})$/] > :matches(UnaryExpression, ConditionalExpression) > Literal[raw=${NUMBER}]`, message: SIZE },
        { selector: `Property[key.name=/^(${SIZE_KEYS})$/] BinaryExpression[operator=/^[+-]$/] > Literal[raw=${NUMBER}]`, message: SIZE },
        { selector: 'JSXText[value=/[A-Za-z]/]', message: COPY },
        { selector: ':matches(JSXElement, JSXFragment) > JSXExpressionContainer > Literal[value=/[A-Za-z]/]', message: COPY },
        { selector: ':matches(JSXElement, JSXFragment) > JSXExpressionContainer > TemplateLiteral > TemplateElement[value.raw=/[A-Za-z]/]', message: COPY },
        { selector: `JSXAttribute[name.name=/^(${USER_FACING_PROPS})$/] > Literal`, message: COPY },
        { selector: `JSXAttribute[name.name=/^(${USER_FACING_PROPS})$/] > JSXExpressionContainer > Literal[value=/[A-Za-z]/]`, message: COPY },
        { selector: `JSXAttribute[name.name=/^(${USER_FACING_PROPS})$/] TemplateElement[value.raw=/[A-Za-z]/]`, message: COPY },
      ],
    },
  },
  {
    // The test setup already makes these jest.fn mocks (jest/setup.js and jest-expo).
    // jest.spyOn on one returns that same shared mock, a persistent stub leaks into the next
    // test, and restoring it wipes the mock's implementation for every later test. It went
    // wrong this way three times; see "Rules and what enforces them" in AGENTS.md.
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='jest'][callee.property.name='spyOn'][arguments.0.name=/^(AsyncStorage|AccessibilityInfo|AppState)$/]",
          message:
            'This is already a jest.fn mock from the test setup. Use jest.mocked(Thing.method).mockResolvedValueOnce(...) or .mockImplementationOnce(...) instead of jest.spyOn.',
        },
        {
          selector:
            "CallExpression[callee.property.name=/^mock(Implementation|ReturnValue|ResolvedValue|RejectedValue)$/][callee.object.callee.object.name='jest'][callee.object.callee.property.name='mocked'][callee.object.arguments.0.object.name=/^(AsyncStorage|AccessibilityInfo|AppState)$/]",
          message:
            'A lasting stub on a test-setup mock leaks into the next test. Use the Once form: mockResolvedValueOnce, mockRejectedValueOnce, mockReturnValueOnce or mockImplementationOnce.',
        },
      ],
    },
  },
]);
