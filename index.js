const core = require('@actions/core');
const github = require('@actions/github');

const utils = require('./utils.js');

async function run() {
  const states = {};

  try {
    const issue = github.context.payload.issue;

    // get details about issue, user, and repo from payload
    states.issue_id = issue.id;
    states.user_login = issue.user.login;
    states.repo_name = github.context.payload.repository.name;

    // attempt to parse configuration
    const pattern = /```json([^`]+)```/;
    const matches = issue.body.match(pattern);

    try {
      const config = JSON.parse(matches[1]);
      console.log(config);

      if (config.name && config.email) {
        states.user_name = config.name;
        states.user_email = config.email;

        if (config.runid) {
          states.run_id = config.runid;
        }
      }
      else {
        throw `Could not find "name" and "email" properties! Found: ${JSON.stringify(config)}`;
      }
    }
    catch (error) {
      // add warning to issue body
      core.setFailed(error.message);
    }
  }
  catch (error) {
    core.setFailed(error.message);
  }
  finally {
    utils.saveStates(states);
  }
}

run();

/*
{
  name: 'Your Name',
  email: 'username@usfca.edu',
  runid: undefined
}


Determine which action run to use.

Get homework name, points, and date from run.

Make sure it is past the deadline. Otherwise output warning.

Make sure the name and email are provided. Otherwise output warning.




*/
