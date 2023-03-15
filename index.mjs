#!/usr/bin/env node
import "zx/globals";

import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { cd, chalk } from "zx";
import Mustache from "mustache";

const fsp = fs.promises;

process.env.npm_config_legacy_peer_deps = true;

const TEMPLATE_EXT = ".tmpl";

/**
 * @typedef {Object} Repo
 * @property {string} sshUrl
 * @property {string} webUrl
 */

/**
 * @typedef {Object} ProjectProps
 * @property {string} projectName
 * @property {string} projectTitle
 * @property {Repo | {}} projectRepo
 */

async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  try {
    let dest = process.cwd();
    if (process.argv[2]) {
      dest = path.join(dest, process.argv[2]);
    }

    if (isSubdirectory(__dirname, dest)) {
      throw new Error("Cant initialize project within template directory");
    }
    prepareDestination(dest);

    /**
     * @type { ProjectProps }
     */
    const props = {
      projectName: path.basename(dest),
      projectTitle: toTitle(path.basename(dest)),
      projectRepo: {},
    };
    info(`Creating project '${props.projectName}' at ${dest}`);

    const src = path.join(__dirname, "template");
    for await (const file of allFiles(src)) {
      const inp = file;
      const out = path.join(dest, path.relative(src, file));
      copyAndReplace(inp, out, props);
    }

    cd(dest);
    await $`chmod -R +x scripts`;
    await $`git init --initial-branch=main`;
    await addLintStaged();
    await $`npm run format`;
    await commitInitial();
  } catch (e) {
    console.error(chalk.red(e.stack));
  }
}

async function commitInitial() {
  await $`git add .`;
  await $`git commit -m "Initialize project"`;
}

async function addLintStaged() {
  // See https://prettier.io/docs/en/precommit.html
  await $`npx mrm@2 lint-staged`;
}

function prepareDestination(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  } else if (!isEmptyDir(dirPath)) {
    throw new Error(`Directory ${dirPath} is not empty`);
  }
}

function isEmptyDir(dirPath) {
  return !fs.readdirSync(dirPath).length;
}

async function* allFiles(rootDir) {
  for (const item of await fsp.readdir(rootDir)) {
    const fullPath = path.resolve(rootDir, item);
    const stat = await fsp.stat(fullPath);
    if (stat.isFile()) {
      yield fullPath;
    } else if (stat.isDirectory()) {
      yield* allFiles(fullPath);
    }
  }
}

async function copyAndReplace(srcPath, destPath, params) {
  console.log(`Copying: ${srcPath} -> ${destPath}`);
  let contents = await fsp.readFile(srcPath);

  if (path.extname(srcPath) === TEMPLATE_EXT) {
    contents = Mustache.render(contents.toString(), params);
    destPath = destPath.slice(0, -TEMPLATE_EXT.length);
  }

  await fs.outputFile(destPath, contents);
}

function isSubdirectory(dir1, dir2) {
  const rpath = path.relative(dir1, dir2);
  return rpath.split(path.sep)[0] !== "..";
}

function info(msg) {
  console.log(chalk.green(msg));
}

function toTitle(projectName) {
  const capitalize = (word) => word[0].toUpperCase() + word.slice(1);
  return projectName.split(/[-_]/).map(capitalize).join(" ");
}

await main();
