const core = require('@actions/core');
const github = require('@actions/github');

const { DateTime } = require('luxon');
const zone = 'America/Los_Angeles';

const deadlines = {
  ArgumentParser:   '2022-02-04',
  TextFileStemmer:  '2022-02-03', // TODO
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
    states.student = student.name;
    states.username = student.username;

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
        // runs.sort((run1, run2) => {
        //   return run2.run_date.toMillis() - run1.run_date.toMillis();
        // });

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

    // get number of points from run
    const file_result = await octokit.rest.actions.listWorkflowRunArtifacts({
      owner: states.owner,
      repo: states.repo,
      run_id: states.submitted_id
    });

    if (file_result.status === 200 && file_result.data.total_count > 0) {
      states.submitted_points = parseInt(file_result.data.artifacts[0].name);

      if (states.submitted_points === NaN) {
        throw new Error(`Unable to parse points from artifact name: ${file_result.artifacts[0].name}`);
      }
    }
    else {
      throw new Error(`Unable to fetch workflow artifacts. Status: ${file_result.status} Count: ${file_result.data.total_count}`);
    }

    // calculate grade penalty
    states.late_multiplier = 0;
    states.late_deduction = 0;
    states.late_grade = states.submitted_points;

    if (states.submitted_date <= states.deadline) {
      core.warning(`The run id ${states.submitted_id} was submitted on ${states.submitted_text}, before the ${states.deadline_text} deadline for the ${states.homework} assignment.`);
    }
    else {
      const late_diff = states.submitted_date.diff(states.deadline, 'hours');
      const late_hours = late_diff.toObject().hours;

      core.info(`The run id ${states.submitted_id} was submitted on ${states.submitted_text}, which is ${Math.round(late_hours)} hours after the ${states.deadline_text} deadline for the ${states.homework} assignment.`);

      states.late_multiplier = 1 + Math.floor(late_hours / duration);
      states.late_deduction = Math.min(penalty, states.late_multiplier * deduction);
      states.late_grade = states.submitted_points - states.late_deduction;

      core.notice(`Using a ${states.late_multiplier}x late penalty multiplier for a deduction of ${states.late_deduction} points and late grade of ${states.late_grade} points.`);
    }

    // add a comment with the details
    const body = `
:octocat: @${states.actor} your late request has been processed! See the details below.

|  |  |
|----:|:-----|
| Student: | ${states.student} |
| Username: | \`${states.username}\` |
| | |
| Homework: | \`${states.homework}\` |
| Deadline: | ${states.deadline_text} |
| Submitted: | ${states.submitted_text} |
| | |
| Autograder Run: | [Run ID ${states.submitted_id}](${states.repo_url}/actions/runs/${states.submitted_id}) |
| Autograder Grade: | ${states.submitted_points} points |
| | |
| Late Grade: | ${states.late_grade} points |
| Late Penalty: | ${states.late_deduction} points |
| Late Days: | ${states.late_multiplier} days |

You will receive a notice once your grade has been updated on Canvas.
`;

    const comment_result = await octokit.rest.issues.createComment({
      owner: states.owner,
      repo: states.repo,
      issue_number: states.issue_number,
      body: body
    });

    states.comment_status = comment_result.status;

    const update_result = await octokit.rest.issues.update({
      owner: states.owner,
      repo: states.repo,
      issue_number: states.issue_number,
      state: 'open',
      assignees: assignees
    });

    states.update_status = update_result.status;

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
