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
        return parsed;
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

  // get run details
  states.run_id = github.context.runId;
  states.run_number = github.context.runNumber;

  // get payload values
  states.owner = github.context.payload.organization.login;
  states.actor = github.context.payload.issue.user.login;
  states.repo = github.context.payload.repository.name;
  states.repo_url = github.context.payload.repository.html_url;
  states.issue_number = github.context.payload.issue.number;

  try {
    // get homework name and deadline
    states.homework = parseHomeworkName(states.repo);
    states.deadline = DateTime.fromISO(`${deadlines[states.homework]}T23:59:59`, {zone: zone});
    states.deadline_text = states.deadline.toLocaleString(DateTime.DATETIME_FULL);
    core.info(`Homework ${states.homework} due on ${states.deadline_text}.`);

    // get student information from issue body
    const student = parseIssueBody(github.context.payload.issue.body);
    core.info(`Student details: ${JSON.stringify(student)}`);

    // get the run information
    const list_result = await octokit.rest.actions.listWorkflowRuns({
      owner: states.owner,
      repo: states.repo,
      workflow_id: 'classroom.yml',
      branch: 'main',
      event: 'push',
      status: 'completed',
      per_page: 100
    });

    states.list_result = list_result.status;

    if (list_result.status === 200 && list_result.data.total_count > 0) {
      let runs = list_result.data.workflow_runs;
      let found = undefined;

      core.info(`Found ${list_result.data.total_count} workflow runs...`);

      // convert run date for each run
      runs.forEach(run => {
        run.run_date = DateTime.fromISO(run.run_started_at, {zone: zone});
      });

      if (student.hasOwnProperty("runid")) {
        // find associated run
        found = runs.find(r => parseInt(r.id) === parseInt(student.runid));
      }

      if (found === undefined) {
        // find the most recent run
        runs.sort((run1, run2) => {
          return run2.run_date.toMillis() - run1.run_date.toMillis();
        });

        found = runs.shift();
      }

      states.submitted_id = found.id;
      states.submitted_date = found.run_date;
      states.submitted_text = found.run_date.toLocaleString(DateTime.DATETIME_FULL);

      core.info(`Using workflow run id ${states.submitted_id} from ${states.submitted_text}.`);
    }
    else {
      throw new Error(`Unable to fetch workflow runs. Status: ${list_result.status} Count: ${list_result.data.total_count}`);
    }

    // calculate grade penalty
    states.late_days = 0;
    states.late_deduction = 0;

    if (states.submitted_date <= states.deadline) {
      throw new Error(`The ${states.homework} assignment is not late. The assignment is due ${states.deadline_text} and [run number ${states.run_number} (id ${states.run_id})](${states.repo_url}/actions/runs/${states.run_id}) was submitted on ${states.submitted_text}.`);
    }

    

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

<blockquote>
${error.message}
</blockquote>

See [run number ${states.run_number} (id ${states.run_id})](${states.repo_url}/actions/runs/${states.run_id}) for additional details. After fixing the problem, you can re-trigger this action by re-opening this issue. Please do *not* create a new issue.
`;

      const comment_result = await octokit.rest.issues.createComment({
        owner: states.owner,
        repo: states.repo,
        issue_number: states.issue_number,
        body: body
      });

      states.error_comment = comment_result.status;

      const close_result = await octokit.rest.issues.update({
        owner: states.owner,
        repo: states.repo,
        issue_number: states.issue_number,
        state: 'closed',
        assignees: [states.actor]
      });

      states.error_close = close_result.status;
    }
    catch (failed) {
      core.warning(`Unable to update issue: ${failed.message}`);
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
