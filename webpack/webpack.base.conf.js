const path = require('path');
const webpack = require('webpack');
const fs = require('fs');

const fsExtra = require('fs-extra')

function cleanOldBuilds () {
  fsExtra.emptyDirSync(path.resolve(process.cwd(), 'static/js'))
  fsExtra.emptyDirSync(path.resolve(process.cwd(), 'static/css/webpack'))
}

class WebpackHashWriter {
  apply(compiler) {
    compiler.hooks.done.tap('_data webpack.yml', (stats) => {
      const content = 'hash: ' + stats.hash;
      fs.writeFileSync(path.join(process.cwd(), 'data', 'webpack.yml'), content);
    });

    compiler.hooks.beforeRun.tap('clean builds', cleanOldBuilds);
    compiler.hooks.watchRun.tap('clean builds watch', cleanOldBuilds);
  }
}

// SKIP_AUTHENTICATION added alongside the other two: cloudflare.js reads
// process.env.SKIP_AUTHENTICATION directly, and EnvironmentPlugin's array
// form throws a clear build-time error for any listed var that isn't
// defined in the environment at all (empty string is fine, undefined is
// not) — better than the alternative, a `process is not defined`
// ReferenceError at runtime once this bundle actually loads in a browser.
const ENV_VARIABLES = ['ROOT_API', 'CLIENT_ID', 'SKIP_AUTHENTICATION'];

const theme = 'hugo-theme-glyco';


const find_files = (dirname) => {
  let dir = path.resolve(__dirname, dirname);
  if (fs.existsSync(dir)) {
    return fs.readdirSync(dir).map( file => path.join(dirname,file));
  }
  return [];
};

const entry = {};

let jsFiles = [...find_files(path.join(process.cwd(),'src/pages/')),...find_files(`../src/partials/`),...find_files(`../src/_default/`)];

jsFiles.forEach((filepath) => {
  let filename = path.basename(filepath);
  let js_scope = path.resolve(__dirname,filepath).indexOf(path.resolve(__dirname,"..")) === 0 ? 'theme' : 'site' ;
  let file_type = path.basename(path.dirname(filepath));
  let file_base = path.parse(filename).name;
  if (path.parse(filename).ext === '.js') entry[`${js_scope}/${file_type}_${file_base}`] = path.resolve(__dirname,filepath);
});

entry['theme/common_bootstrap'] = path.resolve( __dirname, `../src/common_bootstrap.js`);

module.exports = {
  entry,
  devtool: 'source-map',
  mode: 'development',
  output: {
    path: path.resolve(process.cwd(), 'static/js'),
    filename: '[name].[hash].js'
  },
  // This config is invoked with `process.cwd()` at the consuming site's root
  // (e.g. glyco_me-docs), but the theme's own loader devDependencies
  // (babel-loader, css-loader, ...) are declared on the theme's own
  // package.json and npm doesn't always hoist them above this package's own
  // node_modules — resolve loaders from both places.
  resolveLoader: {
    modules: ['node_modules', path.resolve(__dirname, '../node_modules')],
  },
  optimization: {
    runtimeChunk: 'single', // enable "runtime" chunk
    splitChunks: {
      cacheGroups: {
        commons: {
          name: "commons",
          chunks: "initial",
          minChunks: 2
        },
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendor',
          chunks: 'all'
        }
      }
    }
  },  
  resolve: {
    alias: {
      'glycan.js' : path.resolve('./node_modules/glycan.js')
    },
  },
  module: {
    rules: [
    // glycosuite.css is excluded here and raw-loaded below instead: it's not
    // a component's scoped style, it's imported as plain text by
    // js/components/ccg-styles.js (`glycoStyles.replaceSync(css_data)`) to
    // build a constructable stylesheet adopted into ccg-userstatus's shadow
    // root. Fed through style-loader/css-loader instead, `css_data`
    // comes back as whatever module shape css-loader produces rather than a
    // plain string, so replaceSync() gets the wrong input and the shadow
    // root ends up with no (or broken) styles — no build error, just a
    // silently unstyled/misstyled <ccg-userstatus>. (The symlinked
    // ccg-shared-elements/ path also resolves outside node_modules/ once
    // webpack follows the symlink, so `exclude: /node_modules/` below
    // wouldn't have caught it anyway.)
    { test: /\.css$/, exclude: [/node_modules/, /glycosuite\.css$/], use: ['style-loader', { loader: 'css-loader', options: { esModule: false } }]},
    {
      test: /glycosuite\.css$/,
      use: 'raw-loader'
    },
    {
      test: /sugars\.svg$/,
      use: 'raw-loader'
    },
    {
      test: /icons\.svg$/,
      use: 'raw-loader'
    },
    {
      test: /\.js$/,
      exclude: [
          /logic-solver/
      ],
      use: {
        loader: 'babel-loader',
        options: {
          babelrc: false,
          presets: [
            ['@babel/preset-env', {
              modules: false,
              corejs: 'core-js@2',
              useBuiltIns: 'entry',
              targets: {
                browsers: [
                  'Chrome >= 60',
                  'Safari >= 10.1',
                  'iOS >= 10.3',
                  'Firefox >= 54',
                  'Edge >= 15',
                ],
              },
            }],
          ],
        },
      },
    }],
  },
  plugins: [
    new WebpackHashWriter(),
    new webpack.EnvironmentPlugin(ENV_VARIABLES)
  ],
};