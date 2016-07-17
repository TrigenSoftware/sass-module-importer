'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var fs = _interopDefault(require('fs'));
var path = _interopDefault(require('path'));
var Map = _interopDefault(require('es6-map'));
var assign = _interopDefault(require('object-assign'));
var npmResolve = _interopDefault(require('resolve'));
var bowerResolve = _interopDefault(require('resolve-bower'));

var ModuleImporter = function ModuleImporter(opts) {
  this.aliases = new Map();
  this.options = assign({}, { packageFilter: this.filter }, opts);
};

ModuleImporter.prototype.resolve = function resolve (ref) {
    var this$1 = this;
    var url = ref.url;
    var prev = ref.prev;

  if (this.aliases.has(url)) {
    return Promise.resolve(this.aliases.get(url));
  }

  return Promise.resolve({ url: url, prev: prev })
    .then(function (file) { return this$1.npm(file); })
    .then(function (file) { return this$1.bower(file); })
    .then(function (file) { return this$1.read(file); })
    .then(function (res) {
      this$1.aliases.set(url, res);
      return res;
    });
};

ModuleImporter.prototype.resolveSass = function resolveSass (ref) {
    var url = ref.url;
    var prev = ref.prev;

  var filePath = path.resolve(prev.replace(path.sep + path.basename(prev), ''), url);
  var extensions = ['.sass', '.scss', '.css'];
  var len = extensions.length;
  var i = 0;
  var ext = extensions[i];
  var filePathWithExt;

  return new Promise(function (resolve) {
    function handler(err, stat) {
      ext = extensions[++i];

      if (err || !stat || !stat.isFile()) {
        if (i < len) {
          fs.stat(filePathWithExt = filePath + ext, handler);
        } else {
          resolve(false);
        }
      } else {
        resolve(filePathWithExt);
      }
    }

    fs.stat(filePathWithExt = filePath + ext, handler);
  });
};

ModuleImporter.prototype.filter = function filter (pkg) {
  if (!pkg.main || (pkg.main && !pkg.main.match(/\.s?[c|a]ss$/g))) {
    pkg.main = pkg.style || pkg['main.scss'] || pkg['main.sass'] || 'index.css';
  }
  return pkg;
};

ModuleImporter.prototype.find = function find (resolver, ref) {
    var this$1 = this;
    var url = ref.url;
    var prev = ref.prev;
    var resolved = ref.resolved;

  return new Promise(function (resolve) {
    if (resolved) {
      resolve({ url: url, prev: prev, resolved: resolved });
    } else
    if (/^(\.|\/)/.test(url)) {
      resolve({ url: url, prev: prev, resolved: true });
    } else {
      // console.log('start resolve');
      this$1.resolveSass({ url: url, prev: prev }).then(function (resolvedPath) {
        if (resolvedPath) {
          resolve({ url: url, prev: prev, resolved: true });
        } else {
          var moduleName = url.split(path.sep)[0];

          resolver(moduleName, this$1.options, function (err, res) {
            var result = res;

            if (!err && url !== moduleName) {
              result = url.replace(
                moduleName,
                result.replace(/(node_modules|bower_components)\/([^\/]*)(\/.*|)$/, '$1/$2')
              );
            }

            resolve({ url: (err ? url : result), prev: prev, resolved: !err });
          });
        }
      });
    }
  });
};

ModuleImporter.prototype.read = function read (ref) {
    var url = ref.url;
    var prev = ref.prev;
    var resolved = ref.resolved;

  return new Promise(function (resolve, reject) {
    if (url.match(/\.css$/g)) {
      fs.readFile(url, 'utf8', function (err, contents) {
        if (err) {
          reject(err);
        } else {
          resolve({ contents: contents });
        }
      });
    } else {
      var resolvedURL = url;
      if (!resolved && prev && prev !== 'stdin' && !path.isAbsolute(url)) {
        resolvedURL = path.resolve(path.dirname(prev), url);
      }
      resolve({ file: resolvedURL });
    }
  });
};

ModuleImporter.prototype.npm = function npm (file) {
  return this.find(npmResolve, file);
};

ModuleImporter.prototype.bower = function bower (file) {
  return this.find(bowerResolve, file);
};


/**
 * Look for Sass files installed through npm
 * @param opts {Object}       Options to be passed to the resolver module
 *
 * @return {Function}         Function to be used by node-sass importer
 */
function index (opts) {
  var importer = new ModuleImporter(opts);

  return function (url, prev, done) {
    importer.resolve({ url: url, prev: prev }).then(done);
  };
}

module.exports = index;