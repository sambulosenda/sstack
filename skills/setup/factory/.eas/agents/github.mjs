// GitHub helper for the agent jobs: reads issues, opens pull requests, adds comments.
//
// Based on Expo's helper from the Issue to PR and Bug triage guides:
// https://docs.expo.dev/agentic-workflows/issue-to-pr/
// https://docs.expo.dev/agentic-workflows/bug-triage/
// Added here for the retry loop and the daily limit: last-comment, count-commits,
// count-recent-agent-prs, add-labels. For triage: remove-label. For review: diff.
import { readFile } from 'node:fs/promises';

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;

if (!repository || !token) {
  console.error(
    'GITHUB_REPOSITORY or GITHUB_TOKEN is not set. Add both to the preview environment of the Expo Services project.'
  );
  process.exit(1);
}

// Only text written by people who can already push to the repository reaches an agent.
const TRUSTED = ['OWNER', 'MEMBER', 'COLLABORATOR'];

async function request(method, path, body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(
      `GitHub returned ${response.status} for ${method} ${path}: ${await response.text()}\nCheck that GITHUB_TOKEN can read and write contents, issues, and pull requests in ${repository}.`
    );
  }
  return response.json();
}

const repo = `/repos/${repository}`;
const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'issue': {
    const issue = await request('GET', `${repo}/issues/${args[0]}`);
    const comments = await request('GET', `${repo}/issues/${args[0]}/comments?per_page=50`);
    console.log(
      JSON.stringify(
        {
          title: issue.title,
          body: issue.body,
          comments: comments
            .filter(comment => TRUSTED.includes(comment.author_association))
            .map(comment => comment.body),
        },
        null,
        2
      )
    );
    break;
  }
  case 'diff': {
    // Prints the diff of a pull request as text.
    const response = await fetch(`https://api.github.com${repo}/pulls/${args[0]}`, {
      headers: {
        accept: 'application/vnd.github.diff',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub returned ${response.status} for the diff of pull request ${args[0]}: ${await response.text()}`);
    }
    console.log(await response.text());
    break;
  }
  case 'comment': {
    await request('POST', `${repo}/issues/${args[0]}/comments`, {
      body: await readFile(args[1], 'utf8'),
    });
    break;
  }
  case 'last-comment': {
    // Prints the newest trusted comment on an issue or pull request that starts with a prefix.
    // Prints nothing when there is none.
    const [number, prefix] = args;
    const comments = await request(
      'GET',
      `${repo}/issues/${number}/comments?per_page=100&sort=created&direction=desc`
    );
    const match = comments
      .filter(comment => TRUSTED.includes(comment.author_association))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .find(comment => comment.body.startsWith(prefix));
    if (match) console.log(match.body);
    break;
  }
  case 'count-commits': {
    // Prints how many commits of a pull request have a message that starts with a prefix.
    const [number, prefix] = args;
    const commits = await request('GET', `${repo}/pulls/${number}/commits?per_page=100`);
    console.log(commits.filter(commit => commit.commit.message.startsWith(prefix)).length);
    break;
  }
  case 'count-recent-agent-prs': {
    // Prints how many pull requests from agent/ branches were opened in the last N hours.
    const since = Date.now() - Number(args[0]) * 3_600_000;
    const pulls = await request(
      'GET',
      `${repo}/pulls?state=all&sort=created&direction=desc&per_page=100`
    );
    console.log(
      pulls.filter(
        pull => pull.head.ref.startsWith('agent/') && new Date(pull.created_at).getTime() >= since
      ).length
    );
    break;
  }
  case 'add-labels': {
    const [number, ...labels] = args;
    await request('POST', `${repo}/issues/${number}/labels`, { labels });
    break;
  }
  case 'remove-label': {
    // A label that is not on the issue is not an error.
    const [number, label] = args;
    const labels = await request('GET', `${repo}/issues/${number}/labels?per_page=100`);
    if (labels.some(({ name }) => name === label)) {
      await request('DELETE', `${repo}/issues/${number}/labels/${encodeURIComponent(label)}`);
    }
    break;
  }
  case 'create-issue': {
    const [title, bodyFile, ...labels] = args;
    const issue = await request('POST', `${repo}/issues`, {
      title,
      body: await readFile(bodyFile, 'utf8'),
      labels,
    });
    console.log(issue.number);
    break;
  }
  case 'open-pull-request': {
    const [branch, title, bodyFile] = args;
    const owner = repository.split('/')[0];
    const open = await request('GET', `${repo}/pulls?state=open&head=${owner}:${branch}`);
    if (open.length > 0) {
      console.log(open[0].html_url);
      break;
    }
    const { default_branch: base } = await request('GET', repo);
    const pullRequest = await request('POST', `${repo}/pulls`, {
      head: branch,
      base,
      title,
      body: await readFile(bodyFile, 'utf8'),
    });
    console.log(pullRequest.html_url);
    break;
  }
  case 'author-email': {
    const user = await request('GET', '/user');
    console.log(`${user.id}+${user.login}@users.noreply.github.com`);
    break;
  }
  default:
    console.error(
      `Unknown command "${command}". Use issue, diff, comment, last-comment, count-commits, count-recent-agent-prs, add-labels, remove-label, create-issue, open-pull-request, or author-email.`
    );
    process.exit(1);
}
