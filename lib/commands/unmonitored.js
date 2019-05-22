const fs = require('fs');
const glob = require('glob');
const acornLoose = require("acorn-loose");
const walk = require("acorn-walk")
const path = require('path')

// const findImports = require('find-imports');
// const imports = findImports([file], {
//   absoluteImports: true,
//   relativeImports: true,
//   packageImports: false
// });
// console.log(imports);

const constants = require('../constants');

const unmonitoredFiles = [];
const ignoredFiles = [];

function determineUnmonitored(content, file) {
  if (content.indexOf(constants.NOFLOW_MARKER) > -1) {
    ignoredFiles.push(file);
  } else if (content.indexOf(constants.FLOW_MARKER) === -1) {
    unmonitoredFiles.push(file);
  }
}


module.exports = function (args, options) {
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
        console.log('👋  Here are all the dependancies that this file imports!\n');
        walk.simple(ast, {
          ImportDeclaration({ source }) {
            const importFile = source.value;
            console.log(importFile);
            // Checks whether file is relative
            if (importFile[0] === '.') {
              let absolutePath = path.resolve(file, '..', importFile);
              if (!absolutePath.includes('.js')) {
                absolutePath += '.js';
              }
              dependantFiles.push(absolutePath);
            }
            if (importFile.includes('.js')) {
              // Uh, seems like the networking absolute import is aliased?
              if (importFile.includes('networking/')) {
                const absolutePath = path.resolve(file, '..', '..', importFile);
                dependantFiles.push(absolutePath);
              }
              // Same here?
              if ((importFile.includes('components/') || importFile.includes('helpers/'))) {
                const absolutePath = path.resolve(file, '..', '..', '..', importFile);
                dependantFiles.push(absolutePath);
              }
              // And here?
              if (importFile.includes('wbComponents/')) {
                const dealiasedPath = importFile.replace('wbComponents/', 'wunderbar/components/')
                const absolutePath = path.resolve(file, '..', '..', '..', dealiasedPath);
                dependantFiles.push(absolutePath);
              }
            }
          }
        })
        console.log();
        console.log('👇  Here are the absolute paths of files that are not node modules:\n');
        dependantFiles.forEach(file => {
          console.log(file);
          let foundContent;
          // Let's find the dependancy that we're looking for
          let files = glob.sync(file);
          let firstMatchedFile = files[0];
          firstMatchedFile = files[0];
          if (firstMatchedFile) {
            foundContent = fs.readFileSync(firstMatchedFile, "utf8");
          } else {
            // Maybe we can try looking for the index.js file?
            const indexJsedFilePath = file.concat('/index.js');
            files = glob.sync(indexJsedFilePath);
            firstMatchedFile = files[0];
            if (firstMatchedFile) {
              foundContent = fs.readFileSync(firstMatchedFile, "utf8");
            }
          }
          if (foundContent) {
            determineUnmonitored(foundContent, file);
          }
        })
      } else {
        determineUnmonitored(content, file);
      }
    });
    if (!unmonitoredFiles.length) {
      console.log();
      console.log(`There are no unmonitored files that do not contain "${constants.FLOW_MARKER}"!`);
      return;
    }
    if (ignoredFiles.length) {
      console.log();
      console.log(`✨ Found ${ignoredFiles.length} file(s) that contain ` +
        `"${constants.NOFLOW_MARKER}". They will be excluded.`);
    }
    console.log();
    console.log(`⚠️  Found ${unmonitoredFiles.length} file(s) that do ` +
      `not contain "${constants.FLOW_MARKER}":\n`);
    unmonitoredFiles.forEach(file => {
      console.log(`  ${file.replace(/^\.\//, '')}`);
      if (fix) {
        fs.writeFileSync(file, `// ${constants.FLOW_MARKER}\n` + fs.readFileSync(file));
      }
    });

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
