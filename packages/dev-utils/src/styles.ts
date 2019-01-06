import fs from "fs-extra";
import path from "path";
import { promisify } from "util";
import nodeGlob from "glob";
import nodeSass from "node-sass";
import postcss from "postcss";
import postcssPresetEnv from "postcss-preset-env";
import postcssFlexbugsFixes from "postcss-flexbugs-fixes";
import uglifycss from "uglifycss";

import { dist, src, nodeModules } from "./paths";
import { copyFiles, getPackageName, list } from "./utils";
import { getPackageVariables, hackVariableValue } from "./sassdoc";

const glob = promisify(nodeGlob);
const render = promisify(nodeSass.render);

export default async function styles() {
  const scssFiles = await glob("src/**/*.scss");
  if (!scssFiles.length) {
    return;
  }

  await copyFiles(scssFiles, dist);
  const found = scssFiles.find(name => /styles\.scss$/.test(name));
  if (!found) {
    return;
  }

  console.log("Compiling src/styles.scss with the following postcss plugins:");
  console.log(list(["postcss-preset-env", "postcss-flexbugs-fixes"]));
  console.log();
  await compile(false);
  await compile(true);

  await createScssVariables();
}

async function compile(production: boolean) {
  const packageName = await getPackageName();
  const srcFile = path.join("src", "styles.scss");
  const fileName = `${packageName}${production ? ".min" : ""}.css`;
  const outFile = path.join("dist", fileName);
  const sourceMapFile = `${outFile}.map`;

  if (!production) {
    console.log(
      "Compiling a development css bundle along with a sourcemap to:"
    );
    console.log(list([outFile, !production && sourceMapFile]));
    console.log();
  }

  const compiledScss = await render({
    file: srcFile,
    outFile,
    sourceMap: !production,
    includePaths: [src, nodeModules],
    outputStyle: "expanded",
  });

  const postcssResult = await postcss([
    postcssPresetEnv({ stage: 3, autoprefixer: { flexbox: "no-2009" } }),
    postcssFlexbugsFixes(),
  ]).process(compiledScss.css, {
    from: srcFile,
    to: outFile,
    map: !production && { inline: false },
  });

  if (postcssResult.map) {
    await fs.writeFile(sourceMapFile, postcssResult.map.toString());
  }

  let { css } = postcssResult;
  if (production) {
    css = uglifycss.processString(css);
  }

  await fs.writeFile(outFile, css);
}

async function createScssVariables() {
  const fileName = path.join(dist, "scssVariables.js");

  console.log(
    "Creating a typescript file to be compiled that contains a list of"
  );
  console.log(
    "all the scss variables in this project along with their default values."
  );
  console.log();
  const packageName = await getPackageName();
  const unformattedVariables = await getPackageVariables();
  const variables = unformattedVariables.map(variable =>
    hackVariableValue(variable, packageName)
  );

  const contents = `module.exports = ${JSON.stringify(variables)};`;
  await fs.writeFile(fileName, contents);
  console.log(
    `Created ${fileName} with ${variables.length} variables defined.`
  );
  console.log();
}