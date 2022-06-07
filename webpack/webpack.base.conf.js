const path = require('path');
const { VueLoaderPlugin } = require('vue-loader');
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

const ENV_VARIABLES = ['ROOT_API', 'CLIENT_ID'];

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
      vue: 'vue/dist/vue.js',
      'glycan.js' : path.resolve('./node_modules/glycan.js')
    },
  },
  module: {
    rules: [
    {
      test: /\.vue$/,
      loader: 'vue-loader',
      options: { cacheBusting: true }
    },
    { test: /\.css$/, exclude: /node_modules/, use: ['vue-style-loader', 'css-loader']},
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
    new VueLoaderPlugin(),
    new WebpackHashWriter(),
    new webpack.EnvironmentPlugin(ENV_VARIABLES)
  ],
};