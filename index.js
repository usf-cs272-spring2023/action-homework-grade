const core = require('@actions/core');
const github = require('@actions/github');

try {
  const payload = github.context.payload;
  console.log(`The event payload: ${JSON.stringify(payload, undefined, 2)}`);

  const body = payload.issue.body;
  console.log(body);

  const pattern = /```json([^`]+)```/;
  const matches = body.match(pattern);
  console.log(matches);

  const config = JSON.parse(matches[1]);
  console.log(config);

} catch (error) {
  core.setFailed(error.message);
}


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
