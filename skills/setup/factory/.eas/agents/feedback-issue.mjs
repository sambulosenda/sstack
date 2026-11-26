// Turns TestFlight feedback into the text of a GitHub issue. The issue does not include
// the name or the email address of the tester.
// From Expo's guide: https://docs.expo.dev/agentic-workflows/bug-triage/
import { readFile, writeFile } from 'node:fs/promises';

const [feedbackFile, bodyFile] = process.argv.slice(2);
const result = JSON.parse(await readFile(feedbackFile, 'utf8'));
const report = result.feedback ?? result.crash ?? result;
const comment = (report.comment ?? '').trim();
const screenshots = (report.screenshots ?? []).map(screenshot => screenshot.url).filter(Boolean);

const lines = [
  '## TestFlight report',
  '',
  comment
    ? comment
        .split('\n')
        .map(line => `> ${line}`)
        .join('\n')
    : '> The tester did not write a comment.',
  '',
  `- Build: ${report.buildVersion ?? 'unknown'}`,
  `- Device: ${report.deviceModel ?? 'unknown'}, iOS ${report.osVersion ?? 'unknown'}`,
  ...screenshots.map((url, index) => `- [Screenshot ${index + 1}](${url}). The link expires.`),
];

if (result.logText) {
  const codeFence = '`'.repeat(3);
  lines.push(
    '',
    '<details>',
    '<summary>Crash log</summary>',
    '',
    codeFence,
    result.logText.slice(0, 20000),
    codeFence,
    '',
    '</details>'
  );
}

await writeFile(bodyFile, `${lines.join('\n')}\n`);

const title =
  comment.split('\n')[0] || (result.crash ? 'TestFlight crash report' : 'TestFlight feedback');
console.log(title.slice(0, 100));
