const fs = require('fs');
const glob = require('glob');
const acornLoose = require("acorn-loose");
const walk = require("acorn-walk")
const path = require('path')

// Ideally, I would've liked to use this npm package but 
// I ran into parsing issues ):
// const findImports = require('find-imports');
// const imports = findImports([file], {
//   absoluteImports: true,
//   relativeImports: true,
//   packageImports: false
// });
// console.log(imports);

const constants = require('../constants');

const unmonitoredFiles = {};
const ignoredFiles = {};
const aliases = {
  analytics: './app/assets/javascripts/analytics',
  components: './app/assets/javascripts/components',
  wbComponents: './app/assets/javascripts/wunderbar/components',
  src: './src',
  networking: './app/assets/javascripts/wunderbar/networking',
  helpers: './app/assets/javascripts/helpers',
  factories: './app/assets/javascripts/factories',
};

function determineUnmonitored(content, file) {
  if (content.indexOf(constants.NOFLOW_MARKER) > -1) {
    if (!ignoredFiles[file]) {
      ignoredFiles[file] = 1;
    } else {
      ignoredFiles[file] = ignoredFiles[file] + 1;
    }
  } else if (content.indexOf(constants.FLOW_MARKER) === -1) {
    if (!unmonitoredFiles[file]) {
      unmonitoredFiles[file] = 1;
    } else {
      unmonitoredFiles[file] = unmonitoredFiles[file] + 1;
    }
  }
}

module.exports = function (args, options) {
  const rootDir = args.rootDir || __dirname;
  const pattern = args.pattern || './**/*.{js,jsx}';
  const fix = !!options.fix;
  const dependants = !!options.dependants;
  glob(pattern, null, (err, files) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`✅  Found ${files.length} file(s) matching the pattern "${pattern}"...`);
    console.log();
    if (!files.length) {
      return;
    }
    // We just need the loose parser because we only care about imports.
    // I couldn't really get the strict parser to run with our files ):
    const parser = acornLoose.LooseParser;
    files.forEach(file => {
      const content = fs.readFileSync(file, "utf8");
      if (dependants) {
        const ast = parser.parse(content, { sourceType: 'module' });
        const dependantFiles = [];
        // console.log('👋  Here are all the dependancies that this file imports!\n');
        walk.simple(ast, {
          ImportDeclaration({ source }) {
            const importFilePath = source.value;
            // console.log(importFilePath);
            let absolutePath;
            // Checks whether file is relative
            if (importFilePath[0] === '.') {
              absolutePath = path.resolve(file, '..', importFilePath);
            }
            // Check for aliased imports
            for (var alias in aliases) {
              if (importFilePath.includes(alias)) {
                const baseName = path.basename(importFilePath);
                absolutePath = path.resolve(rootDir, aliases[alias], baseName);
              }
            }
            if (absolutePath) {
              // Relative or aliased import paths could be a reference to index.js,
              // so let's fix that here
              if (!absolutePath.includes('.js')) {
                absolutePath += '/index.js';
              }
              dependantFiles.push(absolutePath);
            }
          }
        })
        // console.log();
        // console.log('👇  Here are the absolute paths of files that are not node modules:\n');
        dependantFiles.forEach(file => {
          // console.log(file);
          // Let's find the dependancy that we're looking for
          const files = glob.sync(file);
          const firstMatchedFile = files[0];
          if (firstMatchedFile) {
            const foundContent = fs.readFileSync(firstMatchedFile, "utf8");
            determineUnmonitored(foundContent, file);
          }
        })
      } else {
        determineUnmonitored(content, file);
      }
    });

    if (!Object.keys(unmonitoredFiles).length) {
      console.log();
      console.log(`There are no unmonitored files that do not contain "${constants.FLOW_MARKER}"!`);
      return;
    }

    const numIgnoredFiles = Object.keys(ignoredFiles).length;
    if (numIgnoredFiles) {
      console.log();
      console.log(`✨ Found ${numIgnoredFiles} file(s) that contain ` +
        `"${constants.NOFLOW_MARKER}". They will be excluded.`);
    }

    const numUnmonitoredFiles = Object.keys(unmonitoredFiles).length;
    if (numUnmonitoredFiles) {
      console.log();
      console.log(`⚠️  Found ${numUnmonitoredFiles} file(s) that do ` +
      `not contain "${constants.FLOW_MARKER}":\n`);
      const sortedUnmonitoredFilesDescending = Object.keys(unmonitoredFiles).sort((a, b) => { return -(unmonitoredFiles[a] - unmonitoredFiles[b]) });
      sortedUnmonitoredFilesDescending.map(key => {
        console.log(`  ${key.replace(/^\.\//, '').replace(`${rootDir}/`, '')} appears ${unmonitoredFiles[key]} times`);
        if (fix) {
          fs.writeFileSync(file, `// ${constants.FLOW_MARKER}\n` + fs.readFileSync(file));
        }
      });
    }

    console.log();
    if (!fix) {
      console.log('Run the command again with --fix to automatically append ' +
        `"${constants.FLOW_MARKER}" to those files.`);
    } else {
      console.log(`${unmonitoredFiles.length} fixed by automatically ` +
        `appending "${constants.FLOW_MARKER}"`);
    }

    console.log();
  });
}
