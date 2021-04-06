const fs = require('fs');
const path = require('path');
const parse = require('can-stache-ast').parse;

module.exports = function plugin(snowpackConfig) {
  return {
    name: 'plugin-stache',
    knownEntrypoints: [
      "can-stache",
      "can-view-scope",
      "can-view-import",
      "can-stache-bindings"
    ],
    resolve: {
      input: ['.stache'],
      output: ['.js'],
    },
    async load({filePath}) {
      const contents = fs.readFileSync(filePath, 'utf-8');
      const dirname = path.dirname(filePath);

      const ast = parse(filePath, contents.trim());
      const intermediate = JSON.stringify(ast.intermediate);

      let tagImportMap = [];
      let simpleImports = [];

      const staticImports = [...new Set(ast.imports)];
      staticImports.forEach((file) => {
        for (let importFile of ast.importDeclarations) {
          if (importFile && importFile.specifier === file && importFile.attributes instanceof Map) {
            if(importFile.attributes.size > 1) {
              tagImportMap.push(importFile.specifier);
              break;
            }else if(importFile.attributes.size === 1){
              simpleImports.push(importFile.specifier);
              break;
            }
          }
        }
      });

      const dynamicImportMap = ast.dynamicImports;

      var body = `
import stache from 'can-stache';
import Scope from 'can-view-scope';
import 'can-view-import';
import 'can-stache/src/mustache_core';
import stacheBindings from 'can-stache-bindings';

${tagImportMap.map((file, i) => `import * as i_${i} from '${file}';`).join('\n')}
${simpleImports.map((file) => `import '${file}';`)}

stache.addBindings(stacheBindings);
var renderer = stache(${intermediate});

 ${Object.keys(dynamicImportMap).length ? `
window.require = window.require || new Function('return false');
(function () {
  const oldPrototype = window.require.prototype;
  const oldRequire = window.require;
  window.require = async function (moduleName) {
    const dynamicImportMap = ${JSON.stringify(dynamicImportMap)}
    const index = dynamicImportMap.indexOf(moduleName);
    if (index >= 0) {
      return import(dynamicImportMap[index]).catch();
    }
    return oldRequire.apply(this, arguments);
  };
  window.require.prototype = oldPrototype;
})();`: ``}

export default function (scope, options, nodeList) {
  if (!(scope instanceof Scope)) {
    scope = new Scope(scope);
  }
  var variableScope = scope.getScope(function (s) {
    return s._meta.variable === true
  });
  if (!variableScope) {
    scope = scope.addLetContext();
    variableScope = scope;
  }
  var moduleOptions = Object.assign({}, options);
  Object.assign(variableScope._context, {
    module: null,
    tagImportMap: {${tagImportMap.map((file, i) => `"${file}": i_${i}`).join(',')}}
    });

  return renderer(scope, moduleOptions, nodeList);
};`;

      return {
        '.js': {code: body, map: ''},
      };

    }
  }
};
