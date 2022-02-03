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

function parseHomeworkName(repo) {
  const regex = /^homework-([^-]+)-.+$/;
  const matched = repo.match(regex);

  if (matched !== null && matched.length === 2) {
    return matched[1];
  }

  throw new Error(`Unable to parse homework name from ${repo}. Matches: ${matched}`);
}

async function run() {
  const states = {};

  try {
    const token = core.getInput('token');
    core.setSecret(token);

    const octokit = github.getOctokit(token);

    states.owner = github.context.payload.organization.login;
    states.actor = github.context.payload.issue.user.login;
    states.repo = github.context.payload.repository.name;
    states.issue_number = github.context.payload.issue.number;

    states.assignees = ['sjengle'];
    states.run_event = 'push';
    states.run_branch = 'main';
    states.run_status = 'completed';

    // get homework information
    const homework = parseHomeworkName(states.repo);
    const deadline = DateTime.fromISO(`${deadlines[states.homework]}T23:59:59`, {zone: zone});

    states.homework = homework
    states.deadline = deadline.toLocaleString(DateTime.DATETIME_FULL);
    core.info(`Homework ${states.homework} due on ${states.deadline}.`);

    const result = await octokit.rest.issues.createComment({
      owner: states.owner,
      repo: states.repo,
      issue_number: states.issue_number,
      body: `This action is still under development. Please post on Piazza to have a late homework submission regraded.`
    });

    core.info(JSON.stringify(result));

    states.result = result;

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
