const core = require('@actions/core');

exports.saveStates = function(states) {
  core.startGroup('Saving state...');
  core.info('');

  for (const state in states) {
    core.saveState(state, states[state]);
    core.info(`Saved value ${states[state]} for state ${state}.`);
  }

  core.saveState('keys', JSON.stringify(Object.keys(states)));

  core.info('');
  core.endGroup();
};
