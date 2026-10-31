'use strict'

const path = require('path');
const { merge } = require('webpack-merge');
const baseWebpackConfig = require('./webpack.base.conf');

const webpackConfig = merge(baseWebpackConfig, {
  module: {
  },
  devtool: 'eval-cheap-module-source-map',
});

module.exports = webpackConfig
