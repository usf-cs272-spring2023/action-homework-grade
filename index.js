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
      const parsed = JSON.parse(matches[1]);

      return parsed;
    }
    catch (error) {
      throw new Error(`Unable to parse issue body to JSON. Error: ${error.message} Body: ${body}`);
    }
  }
  else {
    throw new Error(`Unable to parse details from issue body. Matches: ${matched} Body: ${body}`);
  }
}

async function run() {
  const states = {};

  try {
    const token = core.getInput('token');
    core.setSecret(token);

    const octokit = github.getOctokit(token);

    // set hard-coded values
    states.assignees = assignees;
    states.run_event = 'push';
    states.run_branch = 'main';
    states.run_status = 'completed';

    // get payload values
    core.info(`Payload: ${JSON.stringify(github.context.payload)}`);
    states.owner = github.context.payload.organization.login;
    states.actor = github.context.payload.issue.user.login;
    states.repo = github.context.payload.repository.name;
    states.issue_number = github.context.payload.issue.number;
    states.issue_body = github.context.payload.issue.body;

    // get homework name and deadline
    states.homework = parseHomeworkName(states.repo);
    states.deadline_date = DateTime.fromISO(`${deadlines[states.homework]}T23:59:59`, {zone: zone});
    states.deadline_text = states.deadline_date.toLocaleString(DateTime.DATETIME_FULL);
    core.info(`Homework ${states.homework} due on ${states.deadline_text}.`);

    const emails = await octokit.rest.users.listEmailsForAuthenticatedUser();

    core.info(JSON.stringify(emails));

    // get student information
    const student = parseIssueBody(state.issue_body);
    core.info(JSON.stringify(student));

    const result = await octokit.rest.issues.createComment({
      owner: states.owner,
      repo: states.repo,
      issue_number: states.issue_number,
      body: `This action is still under development. Please post on Piazza to have a late homework submission regraded.`
    });

    core.info(JSON.stringify(result));

    states.comment_status = result.status;

    // https://octokit.github.io/rest.js/v18

    // https://docs.github.com/en/rest/reference/actions#get-a-job-for-a-workflow-run
  }
  catch (error) {
    core.setFailed(error.message);
  }
  finally {
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
