const core = require('@actions/core');
const github = require('@actions/github');

const { DateTime } = require('luxon');
const zone = 'America/Los_Angeles';

const deadlines = {
  ArgumentParser:   '2022-02-04',
  TextFileStemmer:  '2022-02-25',
  SimpleJsonWriter: '2022-02-25',
  TextFileIndex:    '2022-02-25',
  TextFileFinder:   '2022-03-25',
  TextFileSorter:   '2022-03-25',
  LoggerSetup:      '2022-04-08',
  ReadWriteLock:    '2022-04-08',
  PrimeFinder:      '2022-04-08',
  LinkParser:       '2022-04-29',
  HtmlCleaner:      '2022-04-29',
  HtmlFetcher:      '2022-04-29',
  HeaderServer:     '2022-05-06'
};

const deduction = 2;        // in points
const duration  = 24;       // in hours
const penalty   = 100 - 74; // maximum penalty

// instructor and teacher assistants
const assignees = [
  'sjengle',
  'igentle292',
  'mtquach2',
  'par5ul1',
  'tydaljames',
  'ybsolomon'
];

function parseHomeworkName(repo) {
  const pattern = /^homework-([^-]+)-.+$/;
  const matched = repo.match(pattern);

  if (matched !== null && matched.length === 2) {
    return matched[1];
  }

  throw new Error(`Unable to parse homework name from ${repo}. Matches: ${matched}`);
}

function parseIssueBody(body) {
  const pattern = /```json([^`]+)```/;
  const matched = body.match(pattern);

  if (matched !== null && matched.length === 2) {
    try {
      const parsed = JSON.parse(matched[1]);

      if (parsed.hasOwnProperty('name') && parsed.hasOwnProperty('username')) {
        return {
          name: parsed.name,
          username: parsed.username,
          runid: parsed.runid
        };
      }

      throw new Error(`Required "name" and "username" properties missing from issue body.`);
    }
    catch (error) {
      throw new Error(`Unable to parse issue body as JSON. Error: ${error.message}`);
    }
  }
  else {
    throw new Error(`Unable to find JSON details from issue body. Found: ${matched}`);
  }
}

async function run() {
  const token = core.getInput('token');
  core.setSecret(token);

  const octokit = github.getOctokit(token);

  // set hard-coded values
  const states = {};
  states.assignees = assignees;
  states.run_event = 'push';
  states.run_branch = 'main';
  states.run_status = 'completed';

  // get run details
  states.run_id = github.context.runId;
  states.run_number = github.context.runNumber;

  // get payload values
  states.owner = github.context.payload.organization.login;
  states.actor = github.context.payload.issue.user.login;
  states.repo = github.context.payload.repository.name;
  states.repo_url = github.context.payload.repository.html_url;
  states.issue_number = github.context.payload.issue.number;
  states.issue_body = github.context.payload.issue.body;

  try {
    // get homework name and deadline
    states.homework = parseHomeworkName(states.repo);
    states.deadline = DateTime.fromISO(`${deadlines[states.homework]}T23:59:59`, {zone: zone});
    states.deadline_text = states.deadline.toLocaleString(DateTime.DATETIME_FULL);
    core.info(`Homework ${states.homework} due on ${states.deadline_text}.`);

    // get student information from issue body
    const student = parseIssueBody(states.issue_body);
    core.info(`Student information: ${JSON.stringify(student)}`);

    const result = await octokit.rest.issues.createComment({
      owner: states.owner,
      repo: states.repo,
      issue_number: states.issue_number,
      body: `This action is still under development. Please post on Piazza to have a late homework submission regraded.`
    });

    states.comment_status = result.status;

    // https://octokit.github.io/rest.js/v18
  }
  catch (error) {
    // attempt to add error as comment if possible
    try {
      const body = `
:warning: @${states.actor} there was a problem with your request:

\`\`\`
${error.message}
\`\`\`

See [run number ${states.run_number} (id ${states.run_id})](${states.repo_url}/actions/runs/${states.run_id}) for additional details.

After fixing the problem, you can re-trigger this action by closing and re-opening this issue. Please do *not* create a new issue.
`;

      const result = await octokit.rest.issues.createComment({
        owner: states.owner,
        repo: states.repo,
        issue_number: states.issue_number,
        body: body
      });

      states.error_status = result.status;
    }
    catch (failed) {
      core.info(`Unable to comment on issue: ${failed}`);
    }

    core.setFailed(error.message);
  }
  finally {
    // display context for debugging
    core.startGroup('Displaying context...');
    core.info('');
    core.info(JSON.stringify(github.context, undefined, 2));
    core.info('');
    core.endGroup();

    // display state for debugging
    core.startGroup('Saving state...');
    core.info('');

    for (const state in states) {
      core.saveState(state, states[state]);
      core.info(`Saved value ${states[state]} for state ${state}.`);
    }

    core.saveState('keys', JSON.stringify(Object.keys(states)));
    core.info('');
    core.endGroup();
  }
}

run();
