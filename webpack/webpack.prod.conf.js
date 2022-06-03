'use strict'
const path = require('path')
const webpack = require('webpack')
const merge = require('webpack-merge')
const baseWebpackConfig = require('./webpack.base.conf')
const TerserPlugin = require('terser-webpack-plugin')

const webpackConfig = merge(baseWebpackConfig, {
  module: {
  },
  devtool: false,
  plugins: [
    new TerserPlugin({
      parallel: true,
      terserOptions: {
        ecma: 6,
      },
      sourceMap: false,
    }),
    // keep module.id stable when vendor modules does not change
    new webpack.HashedModuleIdsPlugin(),
    // enable scope hoisting
    new webpack.optimize.ModuleConcatenationPlugin()
  ]
})

const CompressionWebpackPlugin = require('compression-webpack-plugin')

webpackConfig.plugins.push(
  new CompressionWebpackPlugin({
    filename: '[path].gz[query]',
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
