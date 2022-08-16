const core = require('@actions/core');
const github = require('@actions/github');

const artifact = require('@actions/artifact');
const artifactClient = artifact.create();

const fs = require('fs');
// const { DateTime } = require('luxon');
// const zone = 'America/Los_Angeles';

// instructor and teacher assistants
const assignees = [
  'sjengle',
  'igentle292',
  'mtquach2',
  'par5ul1'
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

      if (parsed.hasOwnProperty('name') && parsed.hasOwnProperty('user')) {
        return parsed;
      }

      throw new Error(`Required "name" and "user" properties missing from issue body.`);
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

    // get student information from issue body
    const student = parseIssueBody(github.context.payload.issue.body);
    core.info(`Student details: ${JSON.stringify(student)}`);
    states.fullname = student.name;
    states.username = student.user;

    // get the run information
    const list_result = await octokit.rest.actions.listWorkflowRuns({
      owner: states.owner,
      repo: states.repo,
      workflow_id: 'classroom.yml',
      branch: 'main',
      status: 'completed',
      per_page: 100
    });

    states.list_result = list_result.status;

    if (list_result.status === 200 && list_result.data.total_count > 0) {
      let runs = list_result.data.workflow_runs;
      let found = undefined;

      core.info(`Found ${list_result.data.total_count} completed workflow runs...`);

      if (student.hasOwnProperty("runid")) {
        // find associated run
        core.info(`Attempting to find run ${student.runid}...`);
        found = runs.find(r => parseInt(r.id) === parseInt(student.runid));
      }

      if (found === undefined) {
        // find the most recent run
        found = runs.shift();
      }

      states.submitted_id = found.id;

      core.startGroup(`Using workflow run id: ${states.submitted_id}`);
      core.info(JSON.stringify(found));
      core.endGroup();
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
      core.startGroup(`Found artifacts: ${file_result.data.total_count}`);
      core.info(JSON.stringify(file_result.data));
      core.endGroup();

      const artifact_result = await octokit.rest.actions.downloadArtifact({
        owner: states.owner,
        repo: states.repo,
        artifact_id: file_result.data.artifacts[0].id,
        archive_format: 'zip'
      });

      core.info(JSON.stringify(artifact_result));

      throw new Error('Stop here.');

      // const results_text = fs.readFileSync('./check-deadline-results.json', 'utf8');
      // const results_json = JSON.parse(results_text);

      // for (const property in results_json) {
      //   console.log(`${property}: ${results_json[property]}`);
      //   states[property] = results_json[property];
      // }
    }
    else {
      throw new Error(`Unable to fetch workflow artifacts. Status: ${file_result.status} Count: ${file_result.data.total_count}`);
    }

    // add a comment with the details
    const body = `
:octocat: @${states.actor} your late request has been processed! See the details below.

|  |  |
|----:|:-----|
| Student: | ${states.fullname} |
| Username: | \`${states.username}\` |
| | |
| Homework: | \`${states.assignment_name}\` |
| Deadline: | ${states.deadline_text} |
| Submitted: | ${states.submitted_text} |
| | |
| Autograder Run: | [Run ID ${states.submitted_id}](${states.repo_url}/actions/runs/${states.submitted_id}) |
| Autograder Grade: | ${states.grade_starting} points |
| | |
| Late Hours: |  ${states.late_interval} hours (x${states.late_multiplier} multiplier) |
| Late Penalty: | -${states.late_points} points |
| Late Grade: |  **${states.grade_points}** / ${states.grade_possible} points (${states.grade_percent}%) |

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
