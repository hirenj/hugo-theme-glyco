'use strict'
const path = require('path')
const { merge } = require('webpack-merge')
const baseWebpackConfig = require('./webpack.base.conf')
const TerserPlugin = require('terser-webpack-plugin')

const webpackConfig = merge(baseWebpackConfig, {
  mode: 'production',
  module: {
  },
  devtool: false,
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        parallel: true,
        terserOptions: {
          ecma: 6,
        },
      }),
    ],
    // keep module ids stable when vendor modules don't change (was
    // webpack.HashedModuleIdsPlugin, removed in webpack 5)
    moduleIds: 'deterministic',
    // enable scope hoisting (was webpack.optimize.ModuleConcatenationPlugin,
    // deprecated in webpack 5 in favor of this flag)
    concatenateModules: true,
  },
})

const CompressionWebpackPlugin = require('compression-webpack-plugin')

webpackConfig.plugins.push(
  // `filename` omitted: v3's '[path].gz[query]' used webpack4-era path
  // tokens that collided under webpack5 ("Multiple assets emit different
  // content to the same filename theme/.gz") — v12's own default
  // ('[path][base].gz') is the webpack5-correct equivalent.
  new CompressionWebpackPlugin({
    algorithm: 'gzip',
    test: new RegExp(
      '\\.(' +
      'js' +
      ')$'
    ),
    threshold: 1024,
    minRatio: 0.8
  })
)

module.exports = webpackConfig
