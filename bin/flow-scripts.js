#!/usr/bin/env node

const commander = require('commander');
const pkg = require('../package.json');
const cli = require('../lib/cli');
const constants = require('../lib/constants');

commander
  .version(pkg.version)
  .usage('[command] [flags]');

console.log('flow-scripts %s\n', pkg.version);

commander
  .command('stub')
  .description('Generates naive flow-typed stubs for packages in dependencies')
  .action(() => {
    cli.execute('stub');
  });

commander
  .command('unmonitored [rootDir] [pattern]')
  .description(`Lists the files matching the specified glob pattern that do not contain "${constants.FLOW_MARKER}"`)
  .option('--fix', `Adds "${constants.FLOW_MARKER}" to the unmonitored files`)
  .option('--dependants', `Checks relative dependancies and returns a list that do not contain "${constants.FLOW_MARKER}"`)
  .action((rootDir, pattern, options) => {
    cli.execute('unmonitored', { pattern, rootDir }, { fix: options.fix, dependants: options.dependants });
  });

commander.parse(process.argv);
