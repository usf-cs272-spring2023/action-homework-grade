const core = require('@actions/core');
const github = require('@actions/github');

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

    const result = await octokit.rest.issues.createComment({
      owner: states.owner,
      repo: states.repo,
      issue_number: states.issue_number,
      body: `This action is still under development. Please post on Piazza to have a late homework submission regraded.`
    });

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
